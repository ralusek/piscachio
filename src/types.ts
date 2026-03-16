export type PiscachioPendingPayload<T = any> = {
  key: string;
  state: 'pending';
  startedAt: number;
  expiresAt: number | null;
  promise: Promise<T>;
};

export type PiscachioFreshPayload<T = any> = {
  key: string;
  state: 'fresh';
  value: T;
  committedAt: number;
  staleAt: number | null;
  expiresAt: number | null;
};

export type PiscachioStalePayload<T = any> = {
  key: string;
  state: 'stale';
  value: T;
  committedAt: number;
  staleAt: number | null;
  expiresAt: number | null;
  refreshPromise: Promise<T>;
  refreshStartedAt: number;
};

export type PiscachioHitPayload<T = any> =
  | PiscachioPendingPayload<T>
  | PiscachioFreshPayload<T>
  | PiscachioStalePayload<T>;

export type PiscachioConfig<T = any> = {
  key: string | string[];
  expireIn?: number;
  staleIn?: number;

  // Does not affect cache behavior, but if true, indicates that the function should return immediately.
  // If there is a pending run, it will not be awaited. If a committed value exists, it will be returned.
  rush?: boolean;

  // Lifecycle callbacks
  // Called when the cache does not have an entry for the key and a new run is initiated.
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onMiss?: (payload: { key: string }) => void | Promise<void>;
  // Called when the cache has an entry for the key (hit). Payload is a derived read view.
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onHit?: (payload: PiscachioHitPayload<T>) => void | Promise<void>;

  onStale?: (payload: PiscachioStalePayload<T>) => void | Promise<void>;

  onFresh?: (payload: PiscachioFreshPayload<T>) => void | Promise<void>;

  // Called when a value is set in the cache.
  onValue?: (payload: { key: string; value: T }) => void | Promise<void>;

  // Called when a value is set on the cache due to staleness.
  onRefresh?: (payload: { key: string; value: T }) => void | Promise<void>;

  // Called when the function run errors. In most cases, these errors will be thrown to the caller, but
  // on stale hits, we run the function again in the background and catch the errors. Thus, to not lose
  // them, they will still be captured here.
  onRunError?: (payload: { key: string; error: unknown }) => void | Promise<void>;
};

export type PiscachioSetConfig = Omit<PiscachioConfig, 'rush' | 'onMiss' | 'onHit' | 'onStale' | 'onFresh'>;

export type PiscachioCache = {
  handle: {
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig & { rush: true }): Promise<T | null>;
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig): Promise<T>;
  };
  set: <T>(key: string, value: T, config: PiscachioSetConfig) => void;
};

export type KeyString = string;
