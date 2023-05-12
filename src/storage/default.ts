import { PiscachioCachedCall, PiscachioStorage } from '../types';

export function getDefaultStorage(): PiscachioStorage {
  const cache = new Map<string, PiscachioCachedCall<any>>();

  const eventListeners = new Map<string, Set<(error?: any, cachedCall?: PiscachioCachedCall<any>) => void>>();

  async function emitResolved<T>(key: string, error?: any, cachedCall?: PiscachioCachedCall<T>) {
    if (!eventListeners.has(key)) return;
    const listeners = eventListeners.get(key)!;
    listeners.forEach((listener) => listener(error, cachedCall));
  }

  function onResolved<T>(
    key: string,
    handler: (error?: any, cachedCall?: PiscachioCachedCall<T>) => void,
  ) {
    if (!eventListeners.has(key)) eventListeners.set(key, new Set());
    const listeners = eventListeners.get(key)!;
    listeners.add(handler);

    return () => listeners.delete(handler);
  }


  // Even though these are all sycnrhonous, we await in order to keep the interface
  // as similar to alternative storage implementations as possible.
  return {
    get: async (key: string) => (await cache.get(key)) ?? null,
    set: async (key: string, value: PiscachioCachedCall<any>) => {
      await cache.set(key, value);
    },
    delete: async (key: string) => {
      await cache.delete(key)
    },
    clear: async () => await cache.clear(),

    onResolved,
    emitResolved,
  };
}
