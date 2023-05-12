import { cachedCall, registerStorage } from '../src';
import { getDefaultStorage } from '../src/storage/default';
import { Storage } from '../src/types';

describe('Caching library', () => {
  const storage = getDefaultStorage();
  registerStorage('peekable', storage);

  it('should cache function results', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    
    const result1 = await cachedCall({ fn, key: 'testKey' }, { lazyClear: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');

    const result2 = await cachedCall({ fn, key: 'testKey' }, { lazyClear: true });
    expect(fn).toHaveBeenCalledTimes(1); // Should not be called again because of caching
    expect(result2).toBe('test');
  });

  it('should respect invalidateIn option', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    const invalidateIn = 1000; // 1 second for test

    const result1 = await cachedCall({ fn, key: 'testKeyA' }, { invalidateIn, storageKey: 'peekable', lazyClear: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');

    // Wait for cache to be invalidated
    await new Promise(resolve => setTimeout(resolve, invalidateIn + 100));

    // While it should be invalidated at this point, it should not be deleted as we specified lazyClear
    const stored = await storage.get('testKeyA');
    expect(stored).toBeDefined();
    expect(stored!.value).toBe('test');

    const result2 = await cachedCall({ fn, key: 'testKeyA' }, { invalidateIn, storageKey: 'peekable', lazyClear: true });
    expect(fn).toHaveBeenCalledTimes(2); // Should be called again because cache is invalidated
    expect(result2).toBe('test');
  });


  it('should respect lazyClear option', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    const invalidateIn = 1000; // 1 second for test

    const result1 = await cachedCall({ fn, key: 'testKeyB' }, { invalidateIn, lazyClear: false, storageKey: 'peekable' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe('test');

    const beforeInvalidate = await storage.get('testKeyB');
    expect(beforeInvalidate).toBeDefined();
    expect(beforeInvalidate!.value).toBe('test');

    // Wait for cache to be invalidated
    await new Promise(resolve => setTimeout(resolve, invalidateIn + 200));

    // We expect it to not only be invalidated but to also have been deleted from the cache.
    const stored = await storage.get('testKeyB');
    expect(stored).toBeNull;
  });
});
