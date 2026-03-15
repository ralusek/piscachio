export type PiscachioLifecycleCallback<T = any> = (cachedCall: PiscachioCachedCall<T>) => void | Promise<void>;

export type PiscachioConfig = {
  key: string | string[];
  expireIn?: number;
  staleIn?: number;

  // Does not affect cache behavior, but if true, indicates that the function should return immediately.
  // If there is a pending run, it will not be awaited. If the promise is already resolved, it will be
  // returned.
  rush?: boolean;

  // Lifecycle callbacks
  // Called when the cache does not have an entry for the key and a new run is initiated.
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onMiss?: PiscachioLifecycleCallback;
  // Called when the cache has an entry for the key (hit), regardless of staleness.
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onHit?: PiscachioLifecycleCallback;
  // Called when the cache has an entry but it is stale (subset of hits).
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onStale?: PiscachioLifecycleCallback;
  // Called when the cache has an entry and it is fresh (subset of hits).
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onFresh?: PiscachioLifecycleCallback;

  // Called when a value is set in the cache.
  onValue?: PiscachioLifecycleCallback;

  // Called when a value is set on the cache due to staleness
  onRefresh?: PiscachioLifecycleCallback;

  // Called when the function run errors. In most cases, these errors will be thrown to the caller, but
  // on stale hits, we run the function again in the background and catch the errors. Thus, to not lose
  // them, they will still be captured here.
  onRunError?: PiscachioLifecycleCallback;
};

export type PiscachioSetConfig = Omit<PiscachioConfig, 'rush' | 'onMiss' | 'onHit' | 'onStale' | 'onFresh'>;

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
  set: <T>(key: string, value: T, config: PiscachioSetConfig) => PiscachioCachedCall<T>;
};

export type KeyString = string;
