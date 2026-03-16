import piscachio from '../dist';

describe('lifecycle callbacks', () => {
  describe('onMiss', () => {
    it('should call onMiss when the cache does not have an entry', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onMiss).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'lifecycle-miss' })
      );
    });

    it('should not call onMiss on a cache hit', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss-no-hit', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await piscachio(fn, { key: 'lifecycle-miss-no-hit', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);
    });

    it('should call onMiss when the cache entry has expired', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss-expired', expireIn: 0, onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await piscachio(fn, { key: 'lifecycle-miss-expired', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(2);
    });

    it('should not call onMiss on a stale re-fetch', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-miss-not-stale', staleIn: 0, onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await piscachio(fn, { key: 'lifecycle-miss-not-stale', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);
    });

    it('should swallow errors thrown by onMiss', async () => {
      const onMiss = jest.fn().mockImplementation(() => {
        throw new Error('onMiss error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await expect(piscachio(fn, { key: 'lifecycle-miss-throw', onMiss })).resolves.toBe('value');
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onHit', () => {
    it('should call onHit when the cache has an entry', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit' });

      const result = await piscachio(fn, { key: 'lifecycle-hit', onHit });
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(result).toBe('value');

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        staleAt: null,
        expiresAt: null,
      }));
    });

    it('should not call onHit on a cache miss', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-no-miss', onHit });
      expect(onHit).toHaveBeenCalledTimes(0);
    });

    it('should call onHit on stale hits', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-hit-stale', staleIn: 0 });

      const result = await piscachio(fn, { key: 'lifecycle-hit-stale', onHit });
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(result).toBe('first');

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-stale',
        state: 'stale',
        value: 'first',
        committedAt: expect.any(Number),
        staleAt: expect.any(Number),
        expiresAt: null,
        refreshStartedAt: expect.any(Number),
      }));
      await expect(payload.refreshPromise).resolves.toBe('second');
    });

    it('should swallow errors thrown by onHit', async () => {
      const onHit = jest.fn().mockImplementation(() => {
        throw new Error('onHit error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-throw' });

      await expect(piscachio(fn, { key: 'lifecycle-hit-throw', onHit })).resolves.toBe('value');
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should provide a fresh payload on a fresh hit', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-current-payload' });
      const result = await piscachio(fn, { key: 'lifecycle-hit-current-payload', onHit });

      expect(result).toBe('value');
      expect(onHit).toHaveBeenCalledTimes(1);

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-current-payload',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        staleAt: null,
        expiresAt: null,
      }));
    });

    it('should provide a stale payload on a stale hit', async () => {
      const onHit = jest.fn();
      const seedFn = jest.fn().mockResolvedValue('first');
      const refreshFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('second'), 50))
      );

      await piscachio(seedFn, { key: 'lifecycle-hit-stale-payload', staleIn: 0 });
      const result = await piscachio(refreshFn, { key: 'lifecycle-hit-stale-payload', onHit });

      expect(result).toBe('first');
      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(1);

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-stale-payload',
        state: 'stale',
        value: 'first',
        committedAt: expect.any(Number),
        staleAt: expect.any(Number),
        expiresAt: null,
        refreshStartedAt: expect.any(Number),
      }));
      await expect(payload.refreshPromise).resolves.toBe('second');
    });

    it('should provide a pending payload when a run is already in flight', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('value'), 50))
      );

      const firstPromise = piscachio(fn, { key: 'lifecycle-hit-in-flight-payload' });
      const secondPromise = piscachio(fn, { key: 'lifecycle-hit-in-flight-payload', onHit });

      await expect(firstPromise).resolves.toBe('value');
      await expect(secondPromise).resolves.toBe('value');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(1);

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-in-flight-payload',
        state: 'pending',
        startedAt: expect.any(Number),
        expiresAt: null,
      }));
      await expect(payload.promise).resolves.toBe('value');
    });

    it('should keep expiresAt null for a pending miss even when expireIn is configured', async () => {
      const onHit = jest.fn();
      let resolveValue!: (value: string) => void;
      const fn = jest.fn().mockImplementation(
        () => new Promise<string>((resolve) => {
          resolveValue = resolve;
        })
      );

      const firstPromise = piscachio(fn, { key: 'lifecycle-hit-pending-expire', expireIn: 25 });
      const secondPromise = piscachio(fn, {
        key: 'lifecycle-hit-pending-expire',
        expireIn: 25,
        onHit,
      });

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-pending-expire',
        state: 'pending',
        startedAt: expect.any(Number),
        expiresAt: null,
      }));

      resolveValue('value');
      await expect(firstPromise).resolves.toBe('value');
      await expect(secondPromise).resolves.toBe('value');
    });

    it('should expose expiresAt on a fresh payload when expireIn is configured', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-fresh-expire', expireIn: 50 });
      await piscachio(fn, { key: 'lifecycle-hit-fresh-expire', expireIn: 50, onHit });

      const payload = onHit.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-hit-fresh-expire',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      }));
      expect(payload.expiresAt).toBeGreaterThan(payload.committedAt);
    });

    it('should keep returning the stale payload while a refresh is already in flight', async () => {
      const onHit = jest.fn();
      const seedFn = jest.fn().mockResolvedValue('first');
      let resolveRefresh!: (value: string) => void;
      const refreshFn = jest.fn().mockImplementation(
        () => new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        })
      );

      await piscachio(seedFn, { key: 'lifecycle-hit-stale-repeat', staleIn: 0 });

      const firstResult = await piscachio(refreshFn, { key: 'lifecycle-hit-stale-repeat', onHit });
      const secondResult = await piscachio(refreshFn, { key: 'lifecycle-hit-stale-repeat', onHit });

      expect(firstResult).toBe('first');
      expect(secondResult).toBe('first');
      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(2);

      const firstPayload = onHit.mock.calls[0][0];
      const secondPayload = onHit.mock.calls[1][0];

      expect(firstPayload.state).toBe('stale');
      expect(secondPayload.state).toBe('stale');
      expect(firstPayload.value).toBe('first');
      expect(secondPayload.value).toBe('first');
      expect(firstPayload.refreshPromise).toBe(secondPayload.refreshPromise);

      resolveRefresh('second');
      await expect(firstPayload.refreshPromise).resolves.toBe('second');
    });
  });

  describe('onStale', () => {
    it('should call onStale when the cached entry is stale', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-stale', staleIn: 0 });

      const result = await piscachio(fn, { key: 'lifecycle-stale', onStale });
      expect(onStale).toHaveBeenCalledTimes(1);
      expect(result).toBe('first');

      const payload = onStale.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-stale',
        state: 'stale',
        value: 'first',
        committedAt: expect.any(Number),
        staleAt: expect.any(Number),
        expiresAt: null,
        refreshStartedAt: expect.any(Number),
      }));
      await expect(payload.refreshPromise).resolves.toBe('second');
    });

    it('should not call onStale when the cached entry is fresh', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-stale-fresh' });

      await piscachio(fn, { key: 'lifecycle-stale-fresh', onStale });
      expect(onStale).toHaveBeenCalledTimes(0);
    });

    it('should not call onStale on a cache miss', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-stale-miss', onStale });
      expect(onStale).toHaveBeenCalledTimes(0);
    });

    it('should swallow errors thrown by onStale', async () => {
      const onStale = jest.fn().mockImplementation(() => {
        throw new Error('onStale error');
      });
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-stale-throw', staleIn: 0 });

      await expect(piscachio(fn, { key: 'lifecycle-stale-throw', onStale })).resolves.toBe('first');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onStale).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('onFresh', () => {
    it('should call onFresh when the cached entry is fresh', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh' });

      const result = await piscachio(fn, { key: 'lifecycle-fresh', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(1);
      expect(result).toBe('value');

      const payload = onFresh.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({
        key: 'lifecycle-fresh',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        staleAt: null,
        expiresAt: null,
      }));
    });

    it('should not call onFresh when the cached entry is stale', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-fresh-stale', staleIn: 0 });

      await piscachio(fn, { key: 'lifecycle-fresh-stale', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(0);
    });

    it('should not call onFresh on a cache miss', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh-miss', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(0);
    });

    it('should swallow errors thrown by onFresh', async () => {
      const onFresh = jest.fn().mockImplementation(() => {
        throw new Error('onFresh error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh-throw' });

      await expect(piscachio(fn, { key: 'lifecycle-fresh-throw', onFresh })).resolves.toBe('value');
      expect(onFresh).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('combined callbacks', () => {
    it('should call onMiss only on first call, then onHit + onFresh on subsequent fresh hits', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const onStale = jest.fn();
      const onFresh = jest.fn();
      const callbacks = { onMiss, onHit, onStale, onFresh };
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-combined', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(0);
      expect(onStale).toHaveBeenCalledTimes(0);
      expect(onFresh).toHaveBeenCalledTimes(0);

      await piscachio(fn, { key: 'lifecycle-combined', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledTimes(0);
      expect(onFresh).toHaveBeenCalledTimes(1);

      expect(onMiss.mock.calls[0][0]).toEqual({ key: 'lifecycle-combined' });
      expect(onHit.mock.calls[0][0]).toEqual(expect.objectContaining({
        key: 'lifecycle-combined',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        staleAt: null,
        expiresAt: null,
      }));
      expect(onFresh.mock.calls[0][0]).toEqual(expect.objectContaining({
        key: 'lifecycle-combined',
        state: 'fresh',
        value: 'value',
        committedAt: expect.any(Number),
        staleAt: null,
        expiresAt: null,
      }));
    });

    it('should call onHit + onStale (not onFresh or onMiss) on a stale hit', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const onStale = jest.fn();
      const onFresh = jest.fn();
      const callbacks = { onMiss, onHit, onStale, onFresh };
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-combined-stale', staleIn: 0, ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await piscachio(fn, { key: 'lifecycle-combined-stale', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledTimes(1);
      expect(onFresh).toHaveBeenCalledTimes(0);

      expect(onMiss.mock.calls[0][0]).toEqual({ key: 'lifecycle-combined-stale' });
      expect(onHit.mock.calls[0][0]).toEqual(expect.objectContaining({
        key: 'lifecycle-combined-stale',
        state: 'stale',
        value: 'first',
        committedAt: expect.any(Number),
        staleAt: expect.any(Number),
        expiresAt: null,
        refreshStartedAt: expect.any(Number),
      }));
      await expect(onHit.mock.calls[0][0].refreshPromise).resolves.toBe('second');
      expect(onStale.mock.calls[0][0]).toEqual(expect.objectContaining({
        key: 'lifecycle-combined-stale',
        state: 'stale',
        value: 'first',
        committedAt: expect.any(Number),
        staleAt: expect.any(Number),
        expiresAt: null,
        refreshStartedAt: expect.any(Number),
      }));
      await expect(onStale.mock.calls[0][0].refreshPromise).resolves.toBe('second');
    });

    it('should call onMiss again after expiration', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const callbacks = { onMiss, onHit };
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-combined-expire', expireIn: 0, ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(0);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await piscachio(fn, { key: 'lifecycle-combined-expire', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(2);
      expect(onHit).toHaveBeenCalledTimes(0);
    });
  });
});
