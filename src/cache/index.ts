import { KeyString, PiscachioCache, PiscachioCachedCall, PiscachioConfig, PiscachioSetConfig } from '../types';

async function sandbox(fn: () => any) {
  try {
    return await fn();
  } catch (error) {
    // Do nothing
  }
}

export default function createCache() {
  const cached = new Map<KeyString, PiscachioCachedCall<any>>();
  const promises = new Map<KeyString, Promise<PiscachioCachedCall<any>>>();
  const timeouts = new Map<KeyString, NodeJS.Timeout>();

  function clear(key: KeyString) {
    cached.delete(key);
    promises.delete(key);
    const timeout = timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(key);
    }

    return null;
  }

  function clearIfExpired(key: KeyString, now?: number) {
    now ??= Date.now();
    const cachedCall = cached.get(key);
    if (!cachedCall) return null;
    if (!cachedCall.expiredAt || (cachedCall.expiredAt > now)) return cachedCall;
    // Is expired, clear and return null.
    return clear(key);
  }

  function store<T>(key: KeyString, config: Pick<PiscachioConfig, 'expireIn' | 'staleIn'>) {
    clear(key);
    const now = Date.now();
    const cachedCall: PiscachioCachedCall<T> = {
      key,
      createdAt: now,
      expiredAt: config.expireIn !== undefined ? now + config.expireIn : null,
      staleAt: config.staleIn !== undefined ? now + config.staleIn : null,
    };
    cached.set(key, cachedCall);

    if (cachedCall.expiredAt) {
      timeouts.set(key, setTimeout(() => clearIfExpired(key), cachedCall.expiredAt - now));
    }

    return cachedCall;
  }

  function run<T>(
    fn: () => Promise<T>,
    key: KeyString,
    config: PiscachioConfig,
  ) {
    const cachedCall = store<T>(key, config);

    const promise = new Promise<PiscachioCachedCall<T>>(async (resolve, reject) => {
      try {
        const value = await fn();
        cachedCall.value = value;
        cachedCall.resolvedAt = Date.now();
        resolve(cachedCall);
        if (config?.onValue) await sandbox(() => config.onValue!({ ...cachedCall }));
      } catch (err) {
        clear(key);
        if (config?.onRunError) await sandbox(() => config.onRunError!({ ...cachedCall }));
        reject(err);
      }
    });

    // Set promise without waiting for it to resolve, preventing multiple runs while one is in flight
    // or returned.
    promises.set(key, promise);

    return promise;
  }

  async function handle <T>(key: string, fn: () => Promise<T>, config: PiscachioConfig) {
    // We await the async function but not the "promise." This allows the lifecycle callbacks to be awaited
    // but we still don't wait for the actual run execution to complete. This allows for the "rush" behavior
    // to work as expected.
    const { promise, cachedCallSnapshot } = await (async () => {
      let cachedCall = cached.get(key) || null;
      const now = Date.now();

      if (cachedCall) {
        // Update values that can be overridden by the config

        // Update staleAt if a new staleIn value is set. Note that unlike expiredAt, which is always pushed
        // back using "now" as a reference, staleAt always uses "createdAt" as a basis. This is because
        // staleness is a reflection of how old data can be, whereas expiration is a reflection of how
        // much further into the future to maintain data since the last time it was touched.
        if (config.staleIn !== undefined) {
          cachedCall.staleAt = cachedCall.createdAt + config.staleIn;
        }
        // Any expiration that is later than current will push it back.
        if (config.expireIn !== undefined) {
          cachedCall.expiredAt = Math.max(cachedCall.expiredAt ?? 0, now + config.expireIn);
        }

        // Clear if expired, in case new expiration is set.
        cachedCall = clearIfExpired(key, now);
      }
      
      // Handle cache miss or expiration resulting in a new run.
      if (!cachedCall) {
        const result = run(fn, key, config);
        if (config?.onMiss) await sandbox(() => config.onMiss!({ ...cached.get(key)! }));
        return { promise: result, cachedCallSnapshot: null };
      }

      // Handle cache hit.
      const promise = promises.get(key)!;

      if (config?.onHit) await sandbox(() => config.onHit!({ ...cachedCall }));

      // If stale, run, but don't await the result.
      if (
        (cachedCall?.staleAt && cachedCall.staleAt <= now) &&
        // Only consider stale if cached call is not already in flight.
        !!cachedCall.resolvedAt
      ) {
        if (config?.onStale) await sandbox(() => config.onStale!({ ...cachedCall }));
        run(fn, key, config)
        .then((cachedCall) => {
          if (config?.onRefresh) sandbox(() => config.onRefresh!({ ...cachedCall }));
        })
        .catch(() => {});
      }
      else {
        if (config?.onFresh) await sandbox(() => config.onFresh!({ ...cachedCall }));
      }

      // Return cached call.
      return {
        // Will either be the resolved value or the in-flight promise.
        promise,
        // We return the snapshot because if it was stale, the "run" call will have cleared it.
        // We still need it, however, to handle config.rushed == true.
        cachedCallSnapshot: cachedCall,
      };
    })();

    // If rush is true, only return result if it is already resolved.
    if (config.rush) {
      // Because stale hits will have cleared the cached calls in the map, we utilize the snapshot.
      if (cachedCallSnapshot?.resolvedAt) return { ...cachedCallSnapshot };

      // If not in snapshot, we still allow one tick to resolve the promise and pull from cached map.

      // We wait a tick so that a run that resolves immediately has a chance
      // to update the cached call to be resolvedAt (promise resolution propagates
      // through multiple microtasks even when the underlying promise is already resolved).
      await new Promise((resolve) => setTimeout(resolve, 0));
      
      const cachedCall = cached.get(key);
      if (cachedCall?.resolvedAt) return cachedCall;
      return null;
    }

    return await promise;
  }

  function set<T>(key: KeyString, value: T, config: PiscachioSetConfig) {
    const cachedCall = store<T>(key, config);
    cachedCall.value = value;
    cachedCall.resolvedAt = cachedCall.createdAt;
    promises.set(key, Promise.resolve(cachedCall));
    if (config?.onValue) sandbox(() => config.onValue!({ ...cachedCall }));
    return cachedCall;
  }

  const cache: PiscachioCache = {
    handle: handle as PiscachioCache['handle'],
    set,
  };

  return cache;
}
