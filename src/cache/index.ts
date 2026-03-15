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
      } catch (err) {
        clear(key);
        reject(err);
      }
    });

    // Set promise without waiting for it to resolve, preventing multiple runs while one is in flight
    // or returned.
    promises.set(key, promise);

    return promise;
  }

  async function handle <T>(key: string, fn: () => Promise<T>, config: PiscachioConfig) {
    const result = (async () => {
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
        return result;
      }

      // Handle cache hit.
      const promise = promises.get(key)!;

      if (config?.onHit) await sandbox(() => config.onHit!({ ...cachedCall }));

      // If stale, run, but don't await the result.
      if (cachedCall?.staleAt && cachedCall.staleAt <= now) {
        if (config?.onStale) await sandbox(() => config.onStale!({ ...cachedCall }));
        run(fn, key, config);
      }
      else {
        if (config?.onFresh) await sandbox(() => config.onFresh!({ ...cachedCall }));
      }

      // Return cached call.
      return promise;
    })();

    // If rush is true, only return result if it is already resolved.
    if (config.rush) {
      // We wait a tick so that a run that resolves immediately has a chance
      // to update the cached call to be resolvedAt (promise resolution propagates
      // through multiple microtasks even when the underlying promise is already resolved).
      await new Promise((resolve) => setTimeout(resolve, 0));
      
      const cachedCall = cached.get(key);
      if (cachedCall?.resolvedAt) return cachedCall;
      return null;
    }

    return await result;
  }

  function set<T>(key: KeyString, value: T, config: PiscachioSetConfig) {
    const cachedCall = store<T>(key, config);
    cachedCall.value = value;
    cachedCall.resolvedAt = cachedCall.createdAt;
    promises.set(key, Promise.resolve(cachedCall));
    return cachedCall;
  }

  const cache: PiscachioCache = {
    handle: handle as PiscachioCache['handle'],
    set,
  };

  return cache;
}
