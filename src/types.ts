// Serializable representation of a function call that
// can be stored locally or remotely.
export type PiscachioCachedCall<T> = {
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

export type PiscachioCache = {
  get: <T>(key: string) => Promise<PiscachioCachedCall<T> | null>;
  set: (key: string, value: PiscachioCachedCall<any>) => Promise<PiscachioCachedCall<any>>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;

  onceResolved: <T>(key: string, handler?: (error?: any, cachedCall?: PiscachioCachedCall<T>) => void) => Promise<T>;
  onResolved: <T>(key: string, handler: (error?: any, cachedCall?: PiscachioCachedCall<T>) => void) => void;
  emitResolved: <T>(key: string, error?: any, cachedCall?: PiscachioCachedCall<T>) => Promise<void>;
};

export type PiscachioStorage = {
  // Implementations should return null if the key is not found.
  get: <T>(key: string) => Promise<PiscachioCachedCall<T> | null>;
  set: (key: string, value: PiscachioCachedCall<any>) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;

  onResolved: <T>(key: string, handler: (error?: any, cachedCall?: PiscachioCachedCall<T>) => void) => () => void;
  emitResolved: <T>(key: string, error?: any, cachedCall?: PiscachioCachedCall<T>) => Promise<void>;
};
