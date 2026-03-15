export type PiscachioConfig = {
  key: string | string[];
  expireIn?: number;
  staleIn?: number;

  // Does not affect cache behavior, but if true, indicates that the function should return immediately.
  // If there is a pending run, it will not be awaited. If the promise is already resolved, it will be
  // returned.
  rush?: boolean;
};

export type PiscachioCachedCall<T> = {
  key: string;
  value?: T;
  resolvedAt?: number;
  createdAt: number;
  // The point at which the result, when returned, will trigger a re-run of the function.
  // Is createdAt + staleIn for convenience.
  // Important: A stale result will still be returned if the function is invoked with a stale
  // cached call, but the function will be re-run and the result will be updated in the cache.
  // This is mirroring the behavior in react-query.
  staleAt: number | null;
  // The point at which the result should be removed from the cache.
  expiredAt: number | null;
};

export type PiscachioCache = {
  handle: {
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig & { rush: true }): Promise<PiscachioCachedCall<T> | null>;
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig): Promise<PiscachioCachedCall<T>>;
  };
  set: <T>(key: string, value: T, config: Omit<PiscachioConfig, 'rush'>) => PiscachioCachedCall<T>;
};

export type KeyString = string;
