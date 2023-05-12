// Serializable representation of a function call that
// can be stored locally or remotely.
export type CachedCall<T> = {
  id: string;
  key: string;
  value?: T;
  resolvedAt?: number;
  createdAt: number;
  // The point at which the cached call should be considered invalid/expired/stale.
  invalidAt?: number;
  // Implementation detail for storage mechanism as to whether
  // or not the cached call should be proactively deleted when it is invalid (as opposed to
  // just being deleted when it is requested and found to be invalid)
  lazyClear: boolean;
  // Can be configured to be removed from the cache right when resolved, for the case
  // where the cached call is only meant to deduplicated parallel calls.
  invalidOnResolve: boolean;
};

export type Cache = {
  get: <T>(key: string) => Promise<CachedCall<T> | null>;
  set: (key: string, value: CachedCall<any>) => Promise<CachedCall<any>>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;

  onceResolved: <T>(key: string, handler?: (error?: any, cachedCall?: CachedCall<T>) => void) => Promise<T>;
  onResolved: <T>(key: string, handler: (error?: any, cachedCall?: CachedCall<T>) => void) => void;
  emitResolved: <T>(key: string, error?: any, cachedCall?: CachedCall<T>) => Promise<void>;
};

export type Storage = {
  // Implementations should return null if the key is not found.
  get: <T>(key: string) => Promise<CachedCall<T> | null>;
  set: (key: string, value: CachedCall<any>) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;

  onResolved: <T>(key: string, handler: (error?: any, cachedCall?: CachedCall<T>) => void) => () => void;
  emitResolved: <T>(key: string, error?: any, cachedCall?: CachedCall<T>) => Promise<void>;
};
