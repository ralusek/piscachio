import {
  KeyString,
  PiscachioCache,
  PiscachioConfig,
  PiscachioFreshPayload,
  PiscachioPendingPayload,
  PiscachioSetConfig,
  PiscachioStalePayload,
} from '../types';

async function sandbox(fn: () => any) {
  try {
    return await fn();
  } catch (error) {
    // Do nothing
  }
}

type CommittedSnapshot<T> = {
  value: T;
  committedAt: number;
};

type PendingRun<T> = {
  promise: Promise<T>;
  startedAt: number;
  kind: 'miss' | 'refresh';
  version: number;
};

type State<T> = {
  key: KeyString;
  staleIn?: number;
  expireIn?: number;
  forceStale: boolean;
  touchedAt: number | null;
  version: number;
  committed: CommittedSnapshot<T> | null;
  pending: PendingRun<T> | null;
};

type CacheEntry<T> = ReturnType<typeof createCacheEntry<T>>;
function createCacheEntry<T>(
  config: {
    key: KeyString;
    onTouch: (entry: CacheEntry<T>) => void;
  },
) {
  const state: State<T> = {
    key: config.key,
    touchedAt: null,
    staleIn: undefined,
    expireIn: undefined,
    forceStale: false,
    version: 0,
    committed: null,
    pending: null,
  };

  function getStaleAt(now?: number) {
    if (state.staleIn === undefined) return null;
    if (!state.committed) return null;
    const staleAt = state.committed.committedAt + state.staleIn;
    if (!state.forceStale) return staleAt;
    now ??= Date.now();
    return Math.min(staleAt, now);
  }

  function isStale(now?: number) {
    const staleAt = getStaleAt();
    if (staleAt === null) return false;
    now ??= Date.now();
    return now >= staleAt;
  }

  function getExpiryBase() {
    if (!state.committed) return null;
    return Math.max(state.touchedAt ?? Number.NEGATIVE_INFINITY, state.committed.committedAt);
  }

  function getExpiredAt() {
    if (state.expireIn === undefined) return null;
    const expiryBase = getExpiryBase();
    if (expiryBase === null) return null;
    return expiryBase + state.expireIn;
  }

  function isExpired(now?: number) {
    const expiredAt = getExpiredAt();
    if (expiredAt === null) return false;
    now ??= Date.now();
    return now >= expiredAt;
  }

  function touch() {
    state.touchedAt = Date.now();
    config.onTouch(entry);
  }

  function patchConfig(config: PiscachioConfig) {
    if (config.expireIn !== undefined) state.expireIn = Math.max(state.expireIn ?? 0, config.expireIn);
    if (config.staleIn !== undefined) state.staleIn = config.staleIn;
    touch();
  }

  function getPendingPayload(): PiscachioPendingPayload<T> | null {
    if (!state.pending) return null;
    return {
      key: state.key,
      state: 'pending',
      startedAt: state.pending.startedAt,
      expiresAt: getExpiredAt(),
      promise: state.pending.promise,
    };
  }

  function getFreshPayload(): PiscachioFreshPayload<T> | null {
    if (!state.committed) return null;
    return {
      key: state.key,
      state: 'fresh',
      value: state.committed.value,
      committedAt: state.committed.committedAt,
      staleAt: getStaleAt(),
      expiresAt: getExpiredAt(),
    };
  }

  function getStalePayload(): PiscachioStalePayload<T> | null {
    if (!state.committed || !state.pending) return null;
    return {
      key: state.key,
      state: 'stale',
      value: state.committed.value,
      committedAt: state.committed.committedAt,
      staleAt: getStaleAt(),
      expiresAt: getExpiredAt(),
      refreshPromise: state.pending.promise,
      refreshStartedAt: state.pending.startedAt,
    };
  }

  const entry = {
    key: config.key,
    state,

    getStaleAt,
    isStale,
    getExpiredAt,
    isExpired,

    touch,
    patchConfig,
    getPendingPayload,
    getFreshPayload,
    getStalePayload,
  };

  return entry;
}

type Timeout = ReturnType<typeof setTimeout>;

export default function createCache() {
  const cachedCalls = new Map<KeyString, CacheEntry<any>>();
  const timeouts = new Map<KeyString, Timeout>();

  function clear(key: KeyString) {
    cachedCalls.delete(key);
    const timeout = timeouts.get(key);
    if (timeout) clearTimeout(timeout);
    timeouts.delete(key);
  }

  function scheduleExpiry(key: KeyString, expireIn: number) {
    const timeout = timeouts.get(key);
    if (timeout) clearTimeout(timeout);

    // Infinity means "never expire" — skip the timer to avoid
    // TimeoutOverflowWarning (Infinity doesn't fit a 32-bit signed int).
    if (expireIn === Infinity) {
      timeouts.delete(key);
      return;
    }

    const newTimeout = setTimeout(() => {
      expireValue(key);
    }, Math.max(0, expireIn));

    // Cache cleanup should not keep a consumer's process alive; if the process exits
    // before this fires, the in-memory cache disappears with it anyway.
    if (typeof newTimeout === 'object' && newTimeout !== null && 'unref' in newTimeout) {
      newTimeout.unref?.();
    }

    timeouts.set(key, newTimeout);
  }

  function syncExpiry<T>(key: KeyString, entry: CacheEntry<T>) {
    const expiredAt = entry.getExpiredAt();
    if (expiredAt === null) {
      const timeout = timeouts.get(key);
      if (timeout) clearTimeout(timeout);
      timeouts.delete(key);
      return;
    }

    scheduleExpiry(key, expiredAt - Date.now());
  }

  function expireValue(key: KeyString) {
    const entry = cachedCalls.get(key);
    if (!entry) return;

    if (entry.state.pending) {
      entry.state.committed = null;
      entry.state.forceStale = false;
      syncExpiry(key, entry);
      return;
    }

    clear(key);
  }

  function prepareEntry<T>(key: KeyString, config: PiscachioConfig) {
    let entry = cachedCalls.get(key) as CacheEntry<T> | undefined;
    if (entry?.isExpired()) {
      expireValue(key);
      entry = cachedCalls.get(key) as CacheEntry<T> | undefined;
    }

    if (!entry) {
      entry = createCacheEntry<T>({
        key,
        onTouch: (entry) => {
          syncExpiry(key, entry);
        },
      });
      cachedCalls.set(key, entry);
    }

    entry.patchConfig(config);
    return entry;
  }

  function startPendingRun<T>(
    key: KeyString,
    fn: () => Promise<T>,
    config: PiscachioConfig<T>,
    kind: PendingRun<T>['kind'],
  ) {
    const entry = cachedCalls.get(key) as CacheEntry<T> | undefined;
    if (!entry) throw new Error(`Cached call not found for key: ${key}`);

    const version = entry.state.version + 1;
    entry.state.version = version;

    let resolvePromise: (value: T) => void = () => undefined;
    let rejectPromise: (error: unknown) => void = () => undefined;
    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    entry.state.pending = {
      promise,
      startedAt: Date.now(),
      kind,
      version,
    };
    if (kind === 'refresh') {
      promise.catch(() => undefined);
    }

    void (async () => {
      try {
        const value = await fn();
        const currentEntry = cachedCalls.get(key) as CacheEntry<T> | undefined;

        if (currentEntry !== entry || currentEntry.state.pending?.version !== version) {
          resolvePromise(value);
          return;
        }

        currentEntry.state.committed = {
          value,
          committedAt: Date.now(),
        };
        currentEntry.state.forceStale = false;
        currentEntry.state.pending = null;
        syncExpiry(key, currentEntry);

        resolvePromise(value);

        if (config.onValue) await sandbox(() => config.onValue!({ key, value }));
        if (kind === 'refresh' && config.onRefresh) {
          await sandbox(() => config.onRefresh!({ key, value }));
        }
      } catch (error) {
        if (config.onRunError) await sandbox(() => config.onRunError!({ key, error }));

        const currentEntry = cachedCalls.get(key) as CacheEntry<T> | undefined;
        if (currentEntry !== entry || currentEntry.state.pending?.version !== version) {
          rejectPromise(error);
          return;
        }

        currentEntry.state.pending = null;
        rejectPromise(error);

        if (!currentEntry.state.committed) clear(key);
      }
    })();

    return entry.state.pending;
  }

  async function handleMiss<T>(
    key: KeyString,
    fn: () => Promise<T>,
    config: PiscachioConfig<T>,
    forced: boolean,
  ) {
    const pending = startPendingRun(key, fn, config, 'miss');
    await sandbox(() => config.onMiss?.({ key }, { forced }));
    if (config.rush) {
      pending.promise.catch(() => undefined);
      return null;
    }
    return await pending.promise;
  }

  async function handle<T>(key: KeyString, fn: () => Promise<T>, config: PiscachioConfig<T>) {
    const entry = prepareEntry<T>(key, config);

    if (config.forceMiss) {
      return await handleMiss(key, fn, config, true);
    }

    if (!entry.state.committed && !entry.state.pending) {
      return await handleMiss(key, fn, config, false);
    }

    if (!entry.state.committed) {
      const payload = entry.getPendingPayload();
      if (!payload) throw new Error(`Expected in-flight run for key: ${key}`);
      await sandbox(() => config.onHit?.(payload));
      if (config.rush) return null;
      return await payload.promise;
    }

    if (entry.isStale()) {
      entry.state.pending ??= startPendingRun(key, fn, config, 'refresh');

      const payload = entry.getStalePayload();
      if (!payload) throw new Error(`Expected stale payload for key: ${key}`);

      await sandbox(() => config.onStale?.(payload));
      await sandbox(() => config.onHit?.(payload));
      return payload.value;
    }

    const payload = entry.getFreshPayload();
    if (!payload) throw new Error(`Expected fresh payload for key: ${key}`);

    await sandbox(() => config.onFresh?.(payload));
    await sandbox(() => config.onHit?.(payload));
    return payload.value;
  }

  function set<T>(key: KeyString, value: T, config: PiscachioSetConfig) {
    const entry = prepareEntry<T>(key, config);
    const version = entry.state.version + 1;
    entry.state.version = version;
    entry.state.pending = null;
    entry.state.committed = {
      value,
      committedAt: Date.now(),
    };
    entry.state.forceStale = false;
    entry.touch();
    if (config.onValue) sandbox(() => config.onValue!({ key, value }));
  }

  function forceStale(key: KeyString) {
    const entry = cachedCalls.get(key) as CacheEntry<any> | undefined;
    if (!entry || !entry.state.committed) return;
    entry.state.forceStale = true;
  }

  function expire(key: KeyString) {
    clear(key);
  }

  const cache: PiscachioCache = {
    handle: handle as PiscachioCache['handle'],
    set,
    forceStale,
    expire,
  };

  return cache;
}
