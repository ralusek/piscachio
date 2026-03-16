import piscachio from '../dist';

describe('error handling', () => {
  it('should handle errors thrown by the function', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('test error'));
  
    await expect(piscachio(fn, { key: 'testKeyError' })).rejects.toThrow('test error');
    expect(fn).toHaveBeenCalledTimes(1);
  
    await new Promise((resolve) => setTimeout(() => resolve(null), 100));
  
    // The cache should be cleared after an error, so the function should be called again
    await expect(piscachio(fn, { key: 'testKeyError' })).rejects.toThrow('test error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should preserve the committed value when a stale refresh fails', async () => {
    const seedFn = jest.fn().mockResolvedValue('cached');
    const failingRefresh = jest.fn().mockRejectedValue(new Error('refresh failed'));
    const succeedingRefresh = jest.fn().mockResolvedValue('refreshed');

    await piscachio(seedFn, { key: 'staleRefreshError', staleIn: 0 });

    await expect(piscachio(failingRefresh, { key: 'staleRefreshError' })).resolves.toBe('cached');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(failingRefresh).toHaveBeenCalledTimes(1);

    await expect(piscachio(succeedingRefresh, { key: 'staleRefreshError' })).resolves.toBe('cached');
    expect(succeedingRefresh).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(piscachio(succeedingRefresh, { key: 'staleRefreshError', staleIn: 100 })).resolves.toBe('refreshed');
  });
});
