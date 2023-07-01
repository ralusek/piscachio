import piscachio from '../src';

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
});
