import { PiscachioCachedCall, PiscachioCache, PiscachioStorage } from '../types';

const timeouts = new Map<string, NodeJS.Timeout>();

export function getCache(storage: PiscachioStorage): PiscachioCache {
  function onceResolved<T>(
    key: string,
    handler?: (error?: any, cachedCall?: PiscachioCachedCall<T>) => void,
  ) {
    return new Promise<T>(async (resolve, reject) => {
      // In case not currently resolved, register handler.
      const removeListener = storage.onResolved<T>(key, handle);

      if (!removeListener) throw new Error(`Storage implementation of onResolved must return a function to remove the listener.`);

      // Check if already resolved.
      const cachedCall = await storage.get<T>(key);
      if (cachedCall?.resolvedAt) handle(null, cachedCall);

      function handle(error?: any, cachedCall?: PiscachioCachedCall<T>) {
        removeListener();
        handler?.(error, cachedCall);
        if (error) reject(error);
        else resolve(cachedCall!.value!);
      }
    });
  }

  async function emitResolved<T>(key: string, error?: any, cachedCall?: PiscachioCachedCall<T>) {
    if (!error) await storage.set(key, cachedCall!);

    await storage.emitResolved(key, error, cachedCall);

    if (error || cachedCall!.invalidOnResolve) await cache.delete(key);
  }
  
  const cache = {
    get: async <T>(key: string) => {
      const cachedCall = await storage.get<T>(key);
      if (!cachedCall) return null;

      if (cachedCall.invalidAt && cachedCall.invalidAt < Date.now()) {
        cache.delete(key);
        return null;
      }

      return cachedCall;
    },
    set: async (key: string, value: PiscachioCachedCall<any>) => {
      if (!value.lazyClear && value.invalidAt) {
        const { id } = value;
        clearTimeout(timeouts.get(key) as NodeJS.Timeout);
        const timeoutId = setTimeout(async () => {
          // Sanity check to make sure we're deleting the right value.
          // This won't be a problem now, but if this library grows in complexity
          // this is a likely area for problems.
          const currentlyCached = await storage.get(key);
          if (currentlyCached?.id === id) await cache.delete(key);
          // If the value has changed, we don't want to delete it, but we still
          // want to clear the timeout.
          else timeouts.delete(key);
        }, value.invalidAt - value.createdAt);
        timeouts.set(key, timeoutId);
      }
      storage.set(key, value);
      return value;
    },
    delete: async (key: string) => {
      clearTimeout(timeouts.get(key) as NodeJS.Timeout);
      timeouts.delete(key);
      storage.delete(key);
    },
    clear: async () => {
      timeouts.forEach((timeout, key) => {
        clearTimeout(timeout);
        timeouts.delete(key);
      });
      storage.clear();
    },

    onceResolved,
    emitResolved,
    onResolved: storage.onResolved,
  };

  return cache;
}
