/** Payload passed to `onHit` when work for the key is already in flight. */
export type PiscachioPendingPayload<T = any> = {
  key: string;
  state: 'pending';
  startedAt: number;
  expiresAt: number | null;
  promise: Promise<T>;
};

/** Payload passed to `onHit` or `onFresh` when a committed value is still fresh. */
export type PiscachioFreshPayload<T = any> = {
  key: string;
  state: 'fresh';
  value: T;
  committedAt: number;
  staleAt: number | null;
  expiresAt: number | null;
};

/** Payload passed to `onHit` or `onStale` when a stale value is returned during refresh. */
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

/** Union of payloads that may be observed by `onHit`. */
export type PiscachioHitPayload<T = any> =
  | PiscachioPendingPayload<T>
  | PiscachioFreshPayload<T>
  | PiscachioStalePayload<T>;

export type PiscachioMissPayload = {
  key: string;
};

export type PiscachioMissMeta = {
  forced: boolean;
};

export type PiscachioConfig<T = any> = {
  key: string | string[];
  expireIn?: number;
  /**
   * Milliseconds until a committed value is considered stale.
   * Always overrides the current stale policy for a key, but only actually results in a
   * new stale deadline if it is sooner than the current deadline.
   * */
  staleIn?: number;
  forceMiss?: boolean;

  // Does not affect cache behavior, but if true, indicates that the function should return immediately.
  // If there is a pending run, it will not be awaited. If a committed value exists, it will be returned.
  rush?: boolean;

  // Lifecycle callbacks
  // Called when the cache does not have an entry for the key and a new run is initiated.
  // The second parameter indicates whether this miss was forced by `forceMiss`.
  // This is a sandboxed control-flow callback. It will be awaited, but any errors will be ignored.
  // If caller wishes it to be purely observational, simply do not await your logic within the callback.
  onMiss?: (payload: PiscachioMissPayload, meta: PiscachioMissMeta) => void | Promise<void>;
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

export type PiscachioSetConfig = Omit<PiscachioConfig, 'forceMiss' | 'rush' | 'onMiss' | 'onHit' | 'onStale' | 'onFresh'>;

export type PiscachioCache = {
  handle: {
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig & { rush: true }): Promise<T | null>;
    <T>(key: string, fn: () => T | Promise<T>, config: PiscachioConfig): Promise<T>;
  };
  set: <T>(key: string, value: T, config: PiscachioSetConfig) => void;
  /** Marks the committed value stale without discarding it. */
  forceStale: (key: string) => void;
  /** Removes all cached state for the key immediately. */
  expire: (key: string) => void;
};

export type KeyString = string;

export type PiscachioInstance = {
  <T>(
    fn: () => Promise<T>,
    config: PiscachioConfig & { rush: true },
  ): Promise<T | null>;
  <T>(
    fn: () => Promise<T>,
    config: PiscachioConfig,
  ): Promise<T>;
  /** Writes a resolved value directly into this cache instance. */
  set: <T>(value: T, config: PiscachioSetConfig) => T;
  /** Marks the current committed value stale without removing it. */
  forceStale: (key: string | string[]) => void;
  /** Removes the entry so the next read behaves like a miss. */
  expire: (key: string | string[]) => void;
};
