import piscachio, { expire, set } from '../dist';

describe('expire functionality', () => {
  it('should remove a cached entry so next read is a cold miss', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    // Populate cache
    const result1 = await piscachio(fn, { key: 'expire-basic' });
    expect(result1).toBe('first');
    expect(fn).toHaveBeenCalledTimes(1);

    // Expire the entry
    expire('expire-basic');

    // Next read should be a full miss — must wait for fn
    const result2 = await piscachio(fn, { key: 'expire-basic' });
    expect(result2).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should be a no-op if the key does not exist', () => {
    // Should not throw
    expire('expire-nonexistent');
  });

  it('should work with compound keys', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');

    await piscachio(fn, { key: ['expire', 'compound'] });
    expire(['expire', 'compound']);

    const result = await piscachio(fn, { key: ['expire', 'compound'] });
    expect(result).toBe('v2');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should remove a value that was set() directly', async () => {
    set('set-value', { key: 'expire-set' });

    expire('expire-set');

    const fn = jest.fn().mockResolvedValue('from-fn');
    const result = await piscachio(fn, { key: 'expire-set' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('from-fn');
  });

  it('should cause rush:true to return null after expiration', async () => {
    const fn = jest
      .fn()
      .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('slow'), 200)));

    // Populate cache
    await piscachio(fn, { key: 'expire-rush' });
    expect(fn).toHaveBeenCalledTimes(1);

    // Expire
    expire('expire-rush');

    // Rush should return null since there's no cached value
    const result = await piscachio(fn, { key: 'expire-rush', rush: true });
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2); // new run started

    // Wait for it to resolve, then verify it's cached
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result2 = await piscachio(fn, { key: 'expire-rush' });
    expect(result2).toBe('slow');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should trigger onMiss on the next read after expiration', async () => {
    const onMiss = jest.fn();
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await piscachio(fn, { key: 'expire-onMiss' });
    expire('expire-onMiss');

    await piscachio(fn, { key: 'expire-onMiss', onMiss });
    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss).toHaveBeenCalledWith({ key: 'expire-onMiss' });
  });

  it('should clear scheduled expiry timers', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')
      .mockResolvedValueOnce('third');

    // Populate with an expireIn
    await piscachio(fn, { key: 'expire-timer', expireIn: 5000 });

    // Manually expire
    expire('expire-timer');

    // Re-populate with a fresh value
    const result = await piscachio(fn, { key: 'expire-timer', expireIn: 5000 });
    expect(result).toBe('second');

    // Wait a bit — the old timer should NOT have cleared the new entry
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result2 = await piscachio(fn, { key: 'expire-timer' });
    expect(result2).toBe('second'); // still cached
    expect(fn).toHaveBeenCalledTimes(2);

    // Clean up the replacement timer so Jest can exit without open handles.
    expire('expire-timer');
  });

  it('should keep deduplicating a pending miss even after expireIn elapses', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const fn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolvers.push(resolve);
      })
    );

    const firstPromise = piscachio(fn, { key: 'expire-pending-dedupe', expireIn: 10 });

    await new Promise((resolve) => setTimeout(resolve, 25));

    const secondPromise = piscachio(fn, { key: 'expire-pending-dedupe', expireIn: 10 });

    resolvers.forEach((resolve, index) => {
      resolve(`value-${index + 1}`);
    });

    const results = await Promise.all([firstPromise, secondPromise]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['value-1', 'value-1']);

    expire('expire-pending-dedupe');
  });

  it('should cache the resolved value from a slow miss even if expireIn elapses before it resolves', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const fn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolvers.push(resolve);
      })
    );

    const firstPromise = piscachio(fn, { key: 'expire-pending-commit', expireIn: 10 });

    // Wait > expireIn to make sure we're in expired territory.
    await new Promise((resolve) => setTimeout(resolve, 25));

    resolvers[0]('first');
    await expect(firstPromise).resolves.toBe('first');

    const secondPromise = piscachio(fn, { key: 'expire-pending-commit', expireIn: 10 });

    if (resolvers[1]) resolvers[1]('second');

    await expect(secondPromise).resolves.toBe('first');
    expect(fn).toHaveBeenCalledTimes(1);

    expire('expire-pending-commit');
  });

  it('should never expire when expireIn is Infinity', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('cached')
      .mockResolvedValueOnce('should-not-appear');

    // Populate with expireIn: Infinity — should not trigger TimeoutOverflowWarning
    const result1 = await piscachio(fn, { key: 'expire-infinity', expireIn: Infinity });
    expect(result1).toBe('cached');
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait a bit and verify the value is still cached
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result2 = await piscachio(fn, { key: 'expire-infinity', expireIn: Infinity });
    expect(result2).toBe('cached');
    expect(fn).toHaveBeenCalledTimes(1);

    expire('expire-infinity');
  });

  it('should reuse an in-flight refresh after the committed value expires', async () => {
    let resolveRefresh!: (value: string) => void;
    const seedFn = jest.fn().mockResolvedValue('first');
    const refreshFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolveRefresh = resolve;
      })
    );

    await piscachio(seedFn, { key: 'expire-refresh-pending', staleIn: 0, expireIn: 10 });

    const staleResult = await piscachio(refreshFn, {
      key: 'expire-refresh-pending',
      staleIn: 0,
      expireIn: 10,
    });

    expect(staleResult).toBe('first');
    expect(refreshFn).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const secondPromise = piscachio(refreshFn, {
      key: 'expire-refresh-pending',
      staleIn: 0,
      expireIn: 10,
    });

    resolveRefresh('second');

    await expect(secondPromise).resolves.toBe('second');
    expect(refreshFn).toHaveBeenCalledTimes(1);

    expire('expire-refresh-pending');
  });
});
