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

    const promise = fn()
    .then((value) => {
      cachedCall.value = value;
      cachedCall.resolvedAt = Date.now();
      return cachedCall;
    })
    .catch(err => {
      clear(key);
      throw err;
    });

    promises.set(key, promise);

    if (cachedCall.expiredAt) {
      timeouts.set(key, setTimeout(() => clear(key), cachedCall.expiredAt - now));
    }

    return promise;
  }

  const cache: PiscachioCache = {
    handle: async <T>(key: string, fn: () => Promise<T>, config: PiscachioConfig) => {
      const cachedCall = cached.get(key);
      const now = Date.now();
      if (
        !cachedCall ||
        (cachedCall.expiredAt && cachedCall.expiredAt <= now) ||
        (config.expireIn !== undefined && (cachedCall.createdAt + config.expireIn <= now))
      ) return run(fn, key, config);

      const promise = promises.get(key)!;

      if (cachedCall?.staleAt && cachedCall.staleAt <= now) run(fn, key, config);

      // Update values that can be overridden by the config
      if (config.staleIn !== undefined) cachedCall.staleAt = now + config.staleIn;

      return promise;
    },
  };

  return cache;
}
