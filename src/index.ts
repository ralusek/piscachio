import { Cache, CachedCall, Storage } from './types';

import { getCache } from './cache';
import { getDefaultStorage } from './storage/default';

const caches: Record<string, Cache>  = {
  default: getCache(getDefaultStorage()),
};


type CachedCallConfig<R> = {
  key: string | string[];
  fn: (...args: any[]) => R | Promise<R>;
};

type CachedCallOptions = {
  // The point at which the cached call should be considered invalid/expired/stale.
  invalidateIn?: number;
  // Implementation detail for storage mechanism as to whether
  // or not the cached call should be proactively deleted when it is invalid (as opposed to
  // just being deleted when it is requested and found to be invalid)
  lazyClear?: boolean;
  // Can be configured to be removed from the cache right when resolved, for the case
  // where the cached call is only meant to deduplicated parallel calls.
  invalidOnResolve?: boolean;
  storageKey?: string;
};

export function registerStorage(name: string, storage: Storage) {
  if (caches[name]) throw new Error(`Cannot register new storage with name ${name} because it already exists.`);
  caches[name] = getCache(storage);
}

export async function cachedCall<T>(
  {
    fn,
    key,
  }: CachedCallConfig<T>,
  options: CachedCallOptions = {},
) {
  const keyString = Array.isArray(key) ? key.join(':') : key;

  const {
    invalidateIn = 1000 * 60 * 10, // 10 minutes
    lazyClear = false,
    invalidOnResolve = false,
    storageKey = 'default',
  } = options;

  const cache = caches[storageKey];

  if (!cache) throw new Error(`No cache found with name ${storageKey}.`);

  const existing = await cache.get<T>(keyString);

  // TODO determine if there are certain settings we want to
  // update on subsequent calls, but for now the initial call
  // determines the cache settings.
  if (existing) return cache.onceResolved<T>(keyString);

  const createdAt = Date.now();
  const invalidAt = invalidateIn ? createdAt + invalidateIn : undefined;

  const cachedCall: CachedCall<T> = {
    id: String(Math.random() * 100000000000000000).padEnd(17, '0'),
    key: keyString,
    createdAt,
    invalidAt,
    lazyClear,
    invalidOnResolve,
  };

  let error: any;
  try {
    const [ value ] = await Promise.all([
      fn(),
      cache.set(keyString, cachedCall).catch(err => {}),
    ]);
    cachedCall.value = value;
  }
  catch (err: any) {
    error = err;
  }
  cachedCall.resolvedAt = Date.now();
  cache.emitResolved(keyString, error, cachedCall);

  return cache.onceResolved<T>(keyString);
}
