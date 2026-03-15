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
});
