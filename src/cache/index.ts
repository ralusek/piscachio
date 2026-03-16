import { KeyString, PiscachioCache,  PiscachioConfig, PiscachioSetConfig } from '../types';

async function sandbox(fn: () => any) {
  try {
    return await fn();
  } catch (error) {
    // Do nothing
  }
}


// TODO move all of these types to the types file

type State<T> = {
  key: KeyString;
  staleIn?: number;
  expireIn?: number;
  touchedAt: number | null;
  runs: {
    current: RunRecord<T> | null;
    stale: RunRecord<T> | null;
  };
};

type RunRecord<T> = {
  value: T;
  ranAt: number;
  resolvedAt: number | null;
  promise: Promise<T>;
};

type CachedCall<T> = ReturnType<typeof createCachedCall<T>>;
function createCachedCall<T>(
  config: {
    key: KeyString;
    expireIn?: number;
    staleIn?: number;
    onTouch: (cachedCall: CachedCall<T>) => void;
  },
) {
  const state: State<T> = {
    key: config.key,
    staleIn: config.staleIn,
    expireIn: config.expireIn,
    touchedAt: null,
    runs: {
      current: null,
      stale: null,
    },
  };
 
  function getStaleAt() {
    if (state.staleIn === undefined) return null;
    if (!state.runs.current?.resolvedAt) return null;
    return state.runs.current.resolvedAt + state.staleIn;
  }

  function isStale(now?: number) {
    const staleAt = getStaleAt();
    if (!staleAt) return false;
    now ??= Date.now();
    return now >= staleAt;
  }

  function handleStale() {
    const isCurrentStale = isStale();
    if (!isCurrentStale) return { wasStale: false };
    // Eject current run to stale.
    state.runs.stale = state.runs.current;
    state.runs.current = null;
    return { wasStale: true };
  }

  function getExpiredAt() {
    if (state.expireIn === undefined) return null;
    if (!state.touchedAt) return null;
    return state.touchedAt + state.expireIn;
  }

  function isExpired(now?: number) {
    const expiredAt = getExpiredAt();
    if (!expiredAt) return false;
    now ??= Date.now();
    return now >= expiredAt;
  }

  function touch() {
    state.touchedAt = Date.now();
    config.onTouch(cachedCall);
  }

  function patchConfig(config: PiscachioConfig) {
    if (config.expireIn !== undefined) state.expireIn = Math.max(state.expireIn ?? 0, config.expireIn);
    if (config.staleIn !== undefined) state.staleIn = config.staleIn;

    touch();
  }

  function getResolvedRun() {
    const run = state.runs.current?.resolvedAt ? state.runs.current : state.runs.stale;
    if (!run) return null;
    return {
      value: run.value,
      resolved: run.resolvedAt !== null,
      promise: run.promise,
      ranAt: run.ranAt,
      stale: state.runs.stale === run,
    };
  }

  const cachedCall = {
    key: config.key,
    state,

    isStale,
    isExpired,
    getExpiredAt,

    handleStale,

    touch,
    patchConfig,
    getResolvedRun,
  };

  touch();

  return cachedCall;
}

type Timeout = ReturnType<typeof setTimeout>;

export default function createCache() {
  const cachedCalls = new Map<KeyString, CachedCall<any>>();
  const timeouts = new Map<KeyString, Timeout>();

  function patchCachedCall<T>(key: KeyString, config: PiscachioConfig) {
    let cachedCall = cachedCalls.get(key);
    if (!cachedCall) {
      cachedCall = createCachedCall<T>({
        key,
        onTouch: (cachedCall: CachedCall<T>) => {
          const expiredAt = cachedCall.getExpiredAt();
          if (expiredAt !== null) {
            scheduleExpiry(key, expiredAt - Date.now());
          }
        },
      });
      cachedCalls.set(key, cachedCall);
    }
    cachedCall.patchConfig(config);
    return cachedCall;
  }

  function clear(key: KeyString) {
    cachedCalls.delete(key);
    const timeout = timeouts.get(key);
    if (timeout) clearTimeout(timeout);
    timeouts.delete(key);
  }

  function scheduleExpiry(key: KeyString, expireIn: number) {
    // Clear any existing timeout.
    const timeout = timeouts.get(key);
    if (timeout) clearTimeout(timeout);
    const newTimeout = setTimeout(() => {
      clear(key);
    }, expireIn);
    timeouts.set(key, newTimeout);
  }


  async function handle<T>(key: KeyString, fn: () => Promise<T>, config: PiscachioConfig) {
    let cachedCall = patchCachedCall<T>(key, config);

    // Replace if expired.
    if (cachedCall.isExpired()) {
      cachedCalls.delete(key);
      cachedCall = patchCachedCall<T>(key, config);
      cachedCalls.set(key, cachedCall);
    }

    ///////////////////////////
    // Cache Miss
    ///////////////////////////
    if (!cachedCall.state.runs.current?.promise && !cachedCall.state.runs.stale?.promise) {
      const promise = run(key, fn, config);
      // We do this after beginning the run, because there are multiple race conditions to account for if this
      // does not begin running immediately. We do not await the run, and call onMiss immediately, which is fine.
      await sandbox(() => config?.onMiss!({ key }));
      if (config?.rush) return null;
      return await promise;
    }

    ///////////////////////////
    // Cache Hit
    ///////////////////////////
  

    const { wasStale } = cachedCall.handleStale();
    // Stale Hit
    if (wasStale) {
      await sandbox(() => config?.onStale!({ key, value: cachedCall.state.runs.stale?.value, resolved: cachedCall.state.runs.stale?.resolvedAt !== null, promise: cachedCall.state.runs.stale?.promise! }));
      // If stale, run, but don't await the result.
      run(key, fn, config)
      .then((cachedCall) => {
        if (config?.onRefresh) sandbox(() => config.onRefresh!(cachedCall.dump()));
      });
    } else {
      await sandbox(() => config?.onFresh!({ key, value: cachedCall.state.runs.current?.value, resolved: cachedCall.state.runs.current?.resolvedAt !== null, promise: cachedCall.state.runs.current?.promise! }));
    }

    let resolvedRun = cachedCall.getResolvedRun();

    // If we don't get a direct hit to a resolved value, wait for one tick to see if the run just needs to resolve
    // on next tick, in which case we'll just count it as a direct hit.
    if (!resolvedRun) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      resolvedRun = cachedCall.getResolvedRun();
    }

    // If there is no resolved run, then there MUST be a current run in flight.
    await sandbox(() => config?.onHit!(
      resolvedRun ? {
        key,
        ...resolvedRun,
      } : {
        key,
        value: undefined,
        resolved: false,
        promise: cachedCall.state.runs.current?.promise!,
        stale: false,
      },
    ));

    // Wait until after onHit call.
    if (resolvedRun) return resolvedRun.value;

    // If we're rushing, return null immediately, because if it was a direct hit, we would have already returned.
    if (config.rush) return null;

    // Only fall back on in-flight promise if we don't have a stale value and are not rushing
    return await cachedCall.state.runs.current?.promise;
  }

  async function run<T>(key: KeyString, fn: () => Promise<T>, config: PiscachioConfig) {
    const cachedCall = cachedCalls.get(key);
    if (!cachedCall) throw new Error(`Cached call not found for key: ${key}`); // Should not be possible
    const promise = new Promise(async (resolve, reject) => {
      try {
        const value = await fn();
        const currentCachedCall = cachedCalls.get(key);

        // This is to account for the scenario where a current run was replaced with a `set` call
        if (currentCachedCall?.state.runs.current?.promise !== promise) {
          resolve(value);
          return;
        }
        cachedCall.state.runs.current!.resolvedAt = Date.now();
        cachedCall.state.runs.current!.value = value;

        cachedCall.state.runs.stale = null;

        resolve(value);
        if (config?.onValue) await sandbox(() => config.onValue!({ key, value }));
      } catch (error) {
        if (config?.onRunError) await sandbox(() => config.onRunError!({ key, error }));
        const currentCachedCall = cachedCalls.get(key);
        // This is to account for the scenario where a current run was replaced with a `set` call
        if (currentCachedCall?.state.runs.current?.promise !== promise) {
          reject(error);
          return;
        }
        reject(error);
        clear(key);
      }
    });

    cachedCall.state.runs.current = {
      value: undefined as T,
      ranAt: Date.now(),
      resolvedAt: null,
      promise,
    }

    return cachedCall.state.runs.current!.promise;
  }

  function set<T>(key: KeyString, value: T, config: PiscachioSetConfig) {
    const cachedCall = patchCachedCall<T>(key, config);
    cachedCall.state.runs.current = {
      value,
      ranAt: Date.now(),
      resolvedAt: Date.now(),
      promise: Promise.resolve(value),
    }
    cachedCall.touch();
    cachedCall.state.runs.stale = null;
    if (config?.onValue) sandbox(() => config.onValue!({ key, value }));
  }


  const cache: PiscachioCache = {
    handle: handle as PiscachioCache['handle'],
    set,
  };

  return cache;
}
