import piscachio from '../dist';

describe('basic piscachio functionality', () => {
  it('should cache function results', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    
    const result1 = await piscachio(fn, { key: ['testKey', 'a'] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');

    await new Promise((resolve) => setTimeout(() => resolve(null), 100));

    const result2 = await piscachio(fn, { key: ['testKey', 'a'] });
    expect(fn).toHaveBeenCalledTimes(1); // Should not be called again because of caching
    expect(result2).toBe('test');
  });

  it('should cache function results with async function', async () => {
    // Use jest.fn to create a mock function that simulates a delay of 250ms
    const fn = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('test'), 250)));
  
    // Cache and retrieve the result of the function call
    const result1 = await piscachio(fn, { key: ['testKeyAsync', 'a'] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');
  
    // Wait for 100ms
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  
    // Retrieve the cached result
    const result2 = await piscachio(fn, { key: ['testKeyAsync', 'a'] });
    expect(fn).toHaveBeenCalledTimes(1); // The function should not be called again because the result is cached
    expect(result2).toBe('test');
  });

  it('should cache function results with async function where resolution happens before next call attempt', async () => {
    // Use jest.fn to create a mock function that simulates a delay of 250ms
    const fn = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('test'), 50)));
  
    // Cache and retrieve the result of the function call
    const result1 = await piscachio(fn, { key: ['testKeyAsync', 'b'] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');
  
    // Wait for 100ms
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  
    // Retrieve the cached result
    const result2 = await piscachio(fn, { key: ['testKeyAsync', 'b'] });
    expect(fn).toHaveBeenCalledTimes(1); // The function should not be called again because the result is cached
    expect(result2).toBe('test');
  });
  

  it('should expire the cache', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    
    const result1 = await piscachio(fn, { key: 'testKeyExpiresImmediately', expireIn: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');

    await new Promise((resolve) => setTimeout(() => resolve(null), 100));

    const result2 = await piscachio(fn, { key: 'testKeyExpiresImmediately' });
    expect(fn).toHaveBeenCalledTimes(2); // Should be called again because it expired
    expect(result2).toBe('test');
  });

  it('should rerun the function when the cache is stale and still return the stale value', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('firstTest')
      .mockResolvedValueOnce('secondTest')
      .mockResolvedValueOnce('thirdTest')
      .mockResolvedValueOnce('fourthTest');

    // First invocation establishes a stale deadline 200ms in the future.
    const result1 = await piscachio(fn, { key: 'testKeyStale', staleIn: 200 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('firstTest');

    await new Promise((resolve) => setTimeout(resolve, 150));

    // This tightens the stale deadline from committedAt + 200ms to committedAt + 100ms.
    const result2 = await piscachio(fn, { key: 'testKeyStale', staleIn: 100 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result2).toBe('firstTest');

    await new Promise((resolve) => setTimeout(resolve, 20));

    // The refreshed value is still fresh under the current 100ms deadline. Passing 1000 here
    // updates the next-commit policy, but does not relax the current committed value's deadline.
    const result3 = await piscachio(fn, { key: 'testKeyStale', staleIn: 1000 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result3).toBe('secondTest');

    await new Promise((resolve) => setTimeout(resolve, 120));

    // Once the stale deadline has passed, a new staleIn can replace it, but this read is still stale.
    const result4 = await piscachio(fn, { key: 'testKeyStale' });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result4).toBe('secondTest');

    await new Promise((resolve) => setTimeout(resolve, 20));

    // The refreshed value should now be fresh under the new 1000ms policy.
    const result5 = await piscachio(fn, { key: 'testKeyStale', staleIn: 40 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result5).toBe('thirdTest');

    await new Promise((resolve) => setTimeout(resolve, 60));

    // The earlier deadline has now passed, so we return stale and trigger a refresh.
    const result6 = await piscachio(fn, { key: 'testKeyStale' });
    expect(fn).toHaveBeenCalledTimes(4);
    expect(result6).toBe('thirdTest');
  });
});
