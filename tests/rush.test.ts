import piscachio from '../dist';

describe('rush functionality', () => {
  it('should return null when rush is true and nothing is cached yet', async () => {
    const fn = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('test'), 250)));

    const result = await piscachio(fn, { key: 'rushMiss', rush: true });
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1); // fn was still invoked to populate the cache
  });

  it('should return the cached value when rush is true and the value is already cached', async () => {
    const fn = jest.fn().mockResolvedValue('cachedValue');

    // First call without rush to populate the cache
    const result1 = await piscachio(fn, { key: 'rushHit' });
    expect(result1).toBe('cachedValue');
    expect(fn).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(() => resolve(null), 100));

    // Second call with rush — value is cached and resolved, should return it
    const result2 = await piscachio(fn, { key: 'rushHit', rush: true });
    expect(result2).toBe('cachedValue');
    expect(fn).toHaveBeenCalledTimes(1); // Should not call fn again
  });

  it('should return the stale cached value when rush is true and trigger a background refresh', async () => {
    const seedFn = jest.fn().mockResolvedValue('staleValue');
    const refreshFn = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('freshValue'), 50))
    );

    expect(seedFn).toHaveBeenCalledTimes(0);
    const initialResult = await piscachio(seedFn, { key: 'rushStaleHit', staleIn: 0 });
    expect(initialResult).toBe('staleValue');
    expect(seedFn).toHaveBeenCalledTimes(1);

    const rushedResult = await piscachio(refreshFn, { key: 'rushStaleHit', rush: true });
    expect(rushedResult).toBe('staleValue');
    expect(refreshFn).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(() => resolve(null), 75));

    const refreshedResult = await piscachio(refreshFn, { key: 'rushStaleHit' });
    expect(refreshedResult).toBe('freshValue');
  });
});
