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
  
    // First invocation
    const result1 = await piscachio(fn, { key: 'testKeyStale', staleIn: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('firstTest');
  
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  
    // Second invocation: the function is rerun due to staleness but it still returns the stale value
    const result2 = await piscachio(fn, { key: 'testKeyStale' });
    expect(fn).toHaveBeenCalledTimes(2); 
    expect(result2).toBe('firstTest'); // Should still return the first value
  
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  
    // Third invocation: the function should now return the updated value
    const result3 = await piscachio(fn, { key: 'testKeyStale', staleIn: 0 });
    expect(fn).toHaveBeenCalledTimes(2); 
    expect(result3).toBe('secondTest'); // Should return the second value now

    await new Promise((resolve) => setTimeout(() => resolve(null), 100));

    // Fourth invocation: the function should now return the updated value
    const result4 = await piscachio(fn, { key: 'testKeyStale' });
    expect(fn).toHaveBeenCalledTimes(3); // Has been called again because of previous staleIn
    expect(result4).toBe('secondTest'); // Should return the second value now
  });  
});
