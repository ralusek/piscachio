export type PiscachioConfig = {
  key: string | string[];
  expireIn?: number;
  staleIn?: number;
};

export type PiscachioCachedCall<T> = {
  key: string;
  value?: T;
  resolvedAt?: number;
  createdAt: number;
  // The point at which the result, when returned, will trigger a re-run of the function.
  // Important: A stale result will still be returned if the function is invoked with a stale
  // cached call, but the function will be re-run and the result will be updated in the cache.
  // This is mirroring the behavior in react-query.
  staleAt: number | null;
  // The point at which the result should be removed from the cache.
  expiredAt: number | null;
};

export type PiscachioCache = {
  handle: < T>(key: string, fn: () => Promise<T>, config: PiscachioConfig) => Promise<PiscachioCachedCall<T>>;
};

export type KeyString = string;
