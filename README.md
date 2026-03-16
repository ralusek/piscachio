[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ralusek/piscachio/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/piscachio.svg?style=flat)](https://www.npmjs.com/package/piscachio)

# piscachio

`piscachio` is a tiny in-memory cache for promise-returning function calls. It deduplicates in-flight work by key, supports stale-while-revalidate refreshes, lets you seed values manually, lets you explicitly mark entries stale or expired, and exposes lifecycle hooks for instrumentation.

It is a good fit when you want:

- one execution per key while a request is already in flight
- cached results reused across later calls in the same process
- stale values returned immediately while a refresh happens in the background
- a low-latency "give me only resolved data right now" mode
- explicit invalidation when outside writes make cached data outdated
- lightweight observability hooks without pulling in a larger cache framework

It ships CommonJS, ESM, and TypeScript declarations.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [API](#api)
- [Examples](#examples)
- [Lifecycle Callbacks](#lifecycle-callbacks)
- [TypeScript](#typescript)
- [Behavior Notes](#behavior-notes)
- [Development](#development)
- [License](#license)

## Installation

```bash
npm install piscachio
```

CommonJS:

```js
const { default: piscachio, set, forceStale, expire, isolate } = require('piscachio');
```

## Quick Start

```ts
import piscachio from 'piscachio';

// Caches user by ID.
async function getUser(userId: string) {
  return piscachio(
    async() => {
      const res = await fetch(`https://api.example.com/users/${userId}`);
      return res.json();
    },
    {
      key: ['user', userId],
      staleIn: 60_000, // After 60 seconds, the value is still returned, but a background refresh is triggered
      expireIn: 60_000 * 60, // After 60 minutes, the value is removed from the cache
    },
  );
}
```

The first call runs the function and caches the resolved value. Later calls with the same key return the cached result without running the function again.

### Request deduplication

Concurrent calls with the same key share the same in-flight promise:

```ts
import piscachio from 'piscachio';

let runs = 0;

const loadConfig = () =>
  piscachio(async () => {
    runs += 1;
    return { version: 1 };
  }, { key: 'config' });

const [a, b] = await Promise.all([loadConfig(), loadConfig()]);

console.log(a, b, runs);
// { version: 1 } { version: 1 } 1
```

## How It Works

Each cache entry is identified by a `key` and can move through three useful states:

| State | What callers get | What happens next |
| --- | --- | --- |
| Fresh | The cached value | Nothing else runs |
| Stale | The stale cached value | A background refresh starts |
| Expired | No cached value | The call behaves like a cache miss and runs again |

Two config options control those transitions:

- `staleIn`: after this many milliseconds, the value is still returned but a refresh is triggered on the next read
- `expireIn`: after this many milliseconds without another access or write after commit, a committed value is no longer used and the next read behaves like a miss

This gives you stale-while-revalidate semantics:

1. First call: miss, run the function, cache the result.
2. Later fresh call: return the cached result.
3. Later stale call: return the stale result immediately and refresh in the background.
4. Later expired call: run the function again before returning.

## API

### `piscachio(fn, config)`

```ts
import piscachio from 'piscachio';

const value = await piscachio(() => Promise.resolve('hello'), {
  key: 'greeting'
});
```

#### Signature

```ts
function piscachio<T>(
  fn: () => Promise<T>,
  config: PiscachioConfig
): Promise<T>;

function piscachio<T>(
  fn: () => Promise<T>,
  config: PiscachioConfig & { rush: true }
): Promise<T | null>;
```

#### Config

| Field | Type | Description |
| --- | --- | --- |
| `key` | `string \| string[]` | Required cache key. Array keys are joined internally with `::`. |
| `staleIn` | `number` | Milliseconds until the value becomes stale. Stale values are still returned, but a refresh is triggered on the next read. |
| `expireIn` | `number` | Milliseconds until a committed value is considered expired. Reads and writes push the deadline back. Pending misses stay deduplicated until they resolve. |
| `rush` | `boolean` | Return only a resolved value that is already available. If nothing resolved is available yet, return `null` while still starting or continuing the work. |
| `onMiss` | `(cachedCall) => void \| Promise<void>` | Called when no usable entry exists and a new run starts. |
| `onHit` | `(cachedCall) => void \| Promise<void>` | Called whenever a cache entry exists, whether fresh or stale. |
| `onStale` | `(cachedCall) => void \| Promise<void>` | Called when a stale value is returned and a background refresh is triggered. |
| `onFresh` | `(cachedCall) => void \| Promise<void>` | Called when a fresh cached value is returned. |
| `onValue` | `(cachedCall) => void \| Promise<void>` | Called when a value is stored in the cache, including `set(...)`. |
| `onRefresh` | `(cachedCall) => void \| Promise<void>` | Called after a stale background refresh stores a new value. |
| `onRunError` | `(cachedCall) => void \| Promise<void>` | Called when a run errors, including background refresh failures that would otherwise be swallowed. |

### `set(value, config)`

```ts
import { set } from 'piscachio';

set({ enabled: true }, { key: 'feature-flags', expireIn: 60_000 });
```

Seeds or overwrites the cache directly and returns the same `value` you passed in.

#### Signature

```ts
function set<T>(
  value: T,
  config: PiscachioSetConfig
): T;
```

`PiscachioSetConfig` is derived from `PiscachioConfig` and excludes `rush`, `onMiss`, `onHit`, `onStale`, and `onFresh`.

In practice, `set(...)` uses:

- `key`
- `staleIn`
- `expireIn`
- `onValue`

### `forceStale(key)`

```ts
import { forceStale } from 'piscachio';

forceStale(['users', userId]);
```

Marks a resolved entry stale without removing its current value. The next stale-capable read returns the cached value immediately and starts a background refresh.

#### Signature

```ts
function forceStale(
  key: string | string[]
): void;
```

Notes:

- the entry must already have a committed value
- the entry must have a `staleIn` value, either from earlier usage or from the next read's config, for the next read to take the stale path
- the named helper operates on the shared top-level cache; isolated instances expose `instance.forceStale(...)`

### `expire(key)`

```ts
import { expire } from 'piscachio';

expire(['users', userId]);
```

Removes the entry immediately. The next read for that key behaves like a cold miss.

#### Signature

```ts
function expire(
  key: string | string[]
): void;
```

Notes:

- expiring a missing key is a no-op
- expiring an entry does not cancel underlying work that is already running; it only disconnects future lookups from that entry
- the named helper operates on the shared top-level cache; isolated instances expose `instance.expire(...)`

### `isolate()`

```ts
import { isolate } from 'piscachio';

const privateCache = isolate();
```

Creates a new private in-memory cache context. The default export and named helpers keep using the shared top-level context, while each isolated instance gets its own cache and its own `instance.set(...)`, `instance.forceStale(...)`, and `instance.expire(...)`.

#### Signature

```ts
function isolate(): PiscachioInstance;
```

### Lifecycle payloads

Lifecycle callbacks receive one of these payload shapes depending on the state being observed:

```ts
type PiscachioPendingPayload<T> = {
  key: string;
  state: 'pending';
  startedAt: number;
  expiresAt: number | null;
  promise: Promise<T>;
};

type PiscachioFreshPayload<T> = {
  key: string;
  state: 'fresh';
  value: T;
  committedAt: number;
  staleAt: number | null;
  expiresAt: number | null;
};

type PiscachioStalePayload<T> = {
  key: string;
  state: 'stale';
  value: T;
  committedAt: number;
  staleAt: number | null;
  expiresAt: number | null;
  refreshPromise: Promise<T>;
  refreshStartedAt: number;
};
```

Notes:

- `onHit` can receive any of the three payloads above
- `onFresh` always receives `PiscachioFreshPayload`
- `onStale` always receives `PiscachioStalePayload`
- `onMiss`, `onValue`, `onRefresh`, and `onRunError` receive smaller event-specific payloads

## Examples

### Basic caching

```ts
import piscachio from 'piscachio';

const user = await piscachio(
  () => db.users.findById('42'),
  { key: ['users', '42'] }
);
```

### Stale-while-revalidate

```ts
import piscachio from 'piscachio';

const article = await piscachio(
  () => cms.fetchArticle('homepage'),
  {
    key: ['article', 'homepage'],
    staleIn: 30_000,
    expireIn: 5 * 60_000
  }
);
```

After 30 seconds the cached article is still returned, but the next read triggers a background refresh. After 5 minutes the next read behaves like a miss.

Setting `staleIn: 0` is a useful pattern when you want "return cached once, then refresh on the next read".

### Low-latency reads with `rush`

```ts
import piscachio from 'piscachio';

const cachedProfile = await piscachio(
  () => fetchProfile(userId),
  { key: ['profile', userId], rush: true }
);

if (cachedProfile === null) {
  return { pending: true };
}

return { pending: false, profile: cachedProfile };
```

`rush` does not disable execution. On a miss, the function still starts so later calls can reuse the result.

### Priming the cache

```ts
import piscachio, { set } from 'piscachio';

set('warm value', { key: 'homepage-copy', staleIn: 10_000 });

const value = await piscachio(
  () => Promise.resolve('should not run yet'),
  { key: 'homepage-copy' }
);

console.log(value);
// "warm value"
```

### Overwriting an entry

```ts
import piscachio, { set } from 'piscachio';

await piscachio(() => Promise.resolve('old'), { key: 'settings' });

set('new', { key: 'settings' });

const value = await piscachio(
  () => Promise.resolve('should not run'),
  { key: 'settings' }
);

console.log(value);
// "new"
```

### Private cache contexts

```ts
import piscachio, { isolate } from 'piscachio';

const privatePiscachio = isolate();

await piscachio(() => Promise.resolve('shared'), { key: 'scope-demo' });
await privatePiscachio(() => Promise.resolve('private'), { key: 'scope-demo' });

const shared = await piscachio(() => Promise.resolve('should not run'), { key: 'scope-demo' });
const privateValue = await privatePiscachio(() => Promise.resolve('should not run'), { key: 'scope-demo' });

console.log(shared, privateValue);
// "shared" "private"
```

### Instrumentation

```ts
import piscachio from 'piscachio';

const value = await piscachio(loadDashboard, {
  key: 'dashboard',
  staleIn: 5_000,
  onMiss: ({ key }) => metrics.increment('cache.miss', { key }),
  onHit: ({ key }) => metrics.increment('cache.hit', { key }),
  onStale: ({ key, staleAt }) => {
    metrics.increment('cache.stale', { key, staleAt: String(staleAt) });
  },
  onRunError: ({ key }) => {
    metrics.increment('cache.run_error', { key });
  }
});
```

## Lifecycle Callbacks

Callbacks are intentionally sandboxed:

- errors thrown inside callbacks are swallowed
- `onMiss`, `onHit`, `onStale`, and `onFresh` are awaited before returning from the current cache operation
- if you want purely observational behavior, start your async work inside the callback without awaiting it

Callback timing:

| Callback | When it fires |
| --- | --- |
| `onMiss` | A key has no usable entry and a new run is started |
| `onHit` | A key already has an entry, whether fresh or stale |
| `onFresh` | A hit is fresh |
| `onStale` | A hit is stale and will trigger a refresh |
| `onValue` | A value has been written into the cache |
| `onRefresh` | A stale background refresh finishes successfully |
| `onRunError` | A run throws, including background refreshes |

## TypeScript

The package includes declaration files.

Normal calls preserve the function's resolved type:

```ts
import piscachio from 'piscachio';

const count = await piscachio(async () => 5, { key: 'count' });
//    ^? number
```

When `rush: true` is present, the return type becomes nullable:

```ts
import piscachio from 'piscachio';

const count = await piscachio(async () => 5, {
  key: 'count',
  rush: true
});
//    ^? number | null
```

Isolated instances preserve the same call signatures:

```ts
import { isolate } from 'piscachio';

const privatePiscachio = isolate();
const count = await privatePiscachio(async () => 5, { key: 'count' });
//    ^? number
```

## Behavior Notes

### Key rules

- `key` is required
- keys may be a string or an array of strings
- key parts may not contain `::`, because that separator is used internally to normalize compound keys

### Error handling

- if the wrapped function throws or rejects, the cache entry is cleared
- the next call for that key will try again
- background refresh errors do not reject the stale caller that triggered them; use `onRunError` if you need visibility into those failures

### `staleIn` vs `expireIn`

- `staleIn` is based on when the current committed value was written
- if later calls pass a new `staleIn`, staleness is recalculated from that current committed timestamp
- `expireIn` starts once a value has been committed
- `expireIn` behaves like time-to-idle after commit: reads and writes push the deadline back
- the deadline is calculated from the later of the current committed time and the most recent access or write

### Manual invalidation

- `forceStale(...)` keeps the current value but makes the next stale-capable read behave like a stale hit
- if an entry has no `staleIn` configured yet, `forceStale(...)` does not discard the value; the next read stays fresh until a `staleIn` is provided
- `expire(...)` removes the entry immediately so the next read is a miss
- neither helper cancels user code that is already running in the background

### `set(...)` semantics

- `set(...)` writes a resolved value immediately
- it can replace an existing cached value
- it can also replace the entry used for subsequent lookups even if an earlier function call is still in flight
- it does not cancel the original underlying work; it only changes what future cache lookups see

### Scope

- the default export and named `set(...)`, `forceStale(...)`, and `expire(...)` use one shared in-memory, process-local cache
- `isolate()` creates additional private cache contexts inside the same process
- values are not persisted across restarts
- values are not shared across separate Node.js processes, workers, lambdas, or servers

## Development

```bash
npm install
npm run build
npm test
```

Project scripts:

- `npm run build`: build CommonJS and ESM bundles and emit declaration files into `dist/`
- `npm test`: build first, then run the Jest test suite

## License

MIT
