import { KeyString, PiscachioCache, PiscachioCachedCall, PiscachioConfig } from '../types';

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

  function run<T>(
    fn: () => Promise<T>,
    key: KeyString,
    config: PiscachioConfig,
  ) {
    clear(key);
    const now = Date.now();
    const cachedCall: PiscachioCachedCall<T> = {
      key,
      createdAt: now,
      expiredAt: config.expireIn !== undefined ? now + config.expireIn : null,
      staleAt: config.staleIn !== undefined ? now + config.staleIn : null,
    };
    cached.set(key, cachedCall);

    // Create new wrapper promise to delay execution until next tick
    const promise = new Promise<PiscachioCachedCall<T>>((resolve, reject) => {
      setTimeout(async () => {
        try {
          const value = await fn();
          cachedCall.value = value;
          cachedCall.resolvedAt = Date.now();
          resolve(cachedCall);
        } catch (err) {
          clear(key);
          reject(err);
        }
      }, 0);
    });

    // Set promise without waiting for it to resolve, preventing multiple runs while one is in flight
    // or returned.
    promises.set(key, promise);

    if (cachedCall.expiredAt) {
      timeouts.set(key, setTimeout(() => clearIfExpired(key), cachedCall.expiredAt - now));
    }

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
      if (!cachedCall) return run(fn, key, config);

      // Handle cache hit.
      const promise = promises.get(key)!;

      // If stale, run, but don't await the result.
      if (cachedCall?.staleAt && cachedCall.staleAt <= now) run(fn, key, config);

      // Return cached call.
      return promise;
    })();

    // If rush is true, only return result if it is already resolved.
    if (config.rush) {
      // We need to wait a tick so that a run that resolves immediately has a chance
      // to update the cached call to be resolvedAt(promise resolution propagates
      // through multiple microtasks even when the underlying promise is already resolved).
      await new Promise((resolve) => setTimeout(resolve, 0));
      
      const cachedCall = cached.get(key);
      if (cachedCall?.resolvedAt) return cachedCall;
      return null;
    }

    return await result;
  }

  const cache: PiscachioCache = {
    handle: handle as PiscachioCache['handle'],
  };

  return cache;
}
