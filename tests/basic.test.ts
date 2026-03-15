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
      .mockResolvedValueOnce('fourthTest')
      .mockResolvedValueOnce('fifthTest');
  
    // First invocation
    const result1 = await piscachio(fn, { key: 'testKeyStale', staleIn: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('firstTest');
  
    // Second invocation: the function is rerun due to staleness but it still returns the stale value
    const result2 = await piscachio(fn, { key: 'testKeyStale' });
    expect(fn).toHaveBeenCalledTimes(1); // Will still be 1 despite us just now firing off new one because we haven't waited next tick
    await new Promise((resolve) => setTimeout(() => resolve(null), 0)); // Allow for async execution
    expect(fn).toHaveBeenCalledTimes(2); // Allowed for async execution
    expect(result2).toBe('firstTest'); // Should still have returned the first value
  
    // Third invocation: the function should now return the updated value
    const result3 = await piscachio(fn, { key: 'testKeyStale', staleIn: 0 });
    expect(fn).toHaveBeenCalledTimes(2); // Will still be 2 despite us just now firing off new one because we haven't waited next tick
    expect(result3).toBe('secondTest'); // Should return the second value now
    await new Promise((resolve) => setTimeout(() => resolve(null), 0)); // Allow for async execution
    expect(fn).toHaveBeenCalledTimes(3); 

    // Fourth invocation: the function should now return the updated value
    const result4 = await piscachio(fn, { key: 'testKeyStale', staleIn: 150 });
    expect(fn).toHaveBeenCalledTimes(3); // Will still be 3 despite us just now firing off new one because we haven't waited next tick
    await new Promise((resolve) => setTimeout(() => resolve(null), 50)); // Allow for async execution, but stay within staleIn value
    expect(fn).toHaveBeenCalledTimes(3); // Will still be 3 because we've updated the staleIn value to a greater value
    expect(result4).toBe('thirdTest'); // Should return the second value now

    // Drop to a lower staleIn value
    const result5 = await piscachio(fn, { key: 'testKeyStale', staleIn: 100 });
    expect(fn).toHaveBeenCalledTimes(3); // Will still be 3
    await new Promise((resolve) => setTimeout(() => resolve(null), 0)); // Allow for async execution
    expect(fn).toHaveBeenCalledTimes(3); // Will still be 3, because even though we've lowered the staleIn value, we're still not 100ms past the createdAt value
    expect(result5).toBe('thirdTest'); // Should return the third value now

    await new Promise((resolve) => setTimeout(() => resolve(null), 200)); //  Wait past staleIn value
    const result6 = await piscachio(fn, { key: 'testKeyStale', staleIn: 100 });
    // Will still be 3 because, same as previous examplpes, despite being stale, fn won't execute until next tick
    expect(fn).toHaveBeenCalledTimes(3); 
    await new Promise((resolve) => setTimeout(() => resolve(null), 0)); // Allow for async execution
    expect(fn).toHaveBeenCalledTimes(4); // Now reflects fact that we had exceeded createdAt + staleIn value
    expect(result6).toBe('thirdTest');

    const result7 = await piscachio(fn, { key: 'testKeyStale', staleIn: 100 });
    expect(result7).toBe('fourthTest');
    await new Promise((resolve) => setTimeout(() => resolve(null), 0)); // Allow for async execution
    const result8 = await piscachio(fn, { key: 'testKeyStale', staleIn: 100 });
    expect(result8).toBe('fourthTest');
  });
});
