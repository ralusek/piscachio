import piscachio, { set } from '../dist';

describe('set functionality', () => {
  it('should set a value directly into the cache', async () => {
    set('hello', { key: 'set-basic' });

    // Retrieve via piscachio — fn should not be called since value is cached
    const fn = jest.fn().mockResolvedValue('should not be called');
    const result = await piscachio(fn, { key: 'set-basic' });
    expect(fn).toHaveBeenCalledTimes(0);
    expect(result).toBe('hello');
  });

  it('should return the set value', () => {
    const result = set({ foo: 'bar' }, { key: 'set-return' });
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should support compound keys', async () => {
    set(42, { key: ['set-compound', 'a'] });

    const fn = jest.fn().mockResolvedValue(999);
    const result = await piscachio(fn, { key: ['set-compound', 'a'] });
    expect(fn).toHaveBeenCalledTimes(0);
    expect(result).toBe(42);
  });

  it('should respect expireIn', async () => {
    set('ephemeral', { key: 'set-expire', expireIn: 50 });

    // Value should be available immediately
    const fn = jest.fn().mockResolvedValue('fresh');
    const result1 = await piscachio(fn, { key: 'set-expire' });
    expect(fn).toHaveBeenCalledTimes(0);
    expect(result1).toBe('ephemeral');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now the cache should be expired, fn should be called
    const result2 = await piscachio(fn, { key: 'set-expire' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result2).toBe('fresh');
  });

  it('should overwrite a value from a prior piscachio call', async () => {
    const fn = jest.fn().mockResolvedValue('from-fn');
    const result1 = await piscachio(fn, { key: 'set-overwrite' });
    expect(result1).toBe('from-fn');

    // Overwrite with set
    set('from-set', { key: 'set-overwrite' });

    const fn2 = jest.fn().mockResolvedValue('should not be called');
    const result2 = await piscachio(fn2, { key: 'set-overwrite' });
    expect(fn2).toHaveBeenCalledTimes(0);
    expect(result2).toBe('from-set');
  });

  it('should set a value for a key that has an in-flight piscachio call', async () => {
    // Start a slow piscachio call
    const slowFn = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('slow-result'), 200))
    );
    const piscachioPromise = piscachio(slowFn, { key: 'set-in-flight' });

    // Immediately set a value for the same key (overwrites the in-flight call)
    set('set-result', { key: 'set-in-flight' });

    // A new lookup should return the set value, not the in-flight one
    const fn2 = jest.fn().mockResolvedValue('should not be called');
    const result = await piscachio(fn2, { key: 'set-in-flight' });
    expect(fn2).toHaveBeenCalledTimes(0);
    expect(result).toBe('set-result');
  });

  it('should support staleIn and trigger re-fetch on next piscachio call', async () => {
    set('stale-value', { key: 'set-stale', staleIn: 0 });

    // The value is immediately stale, so piscachio should return it but trigger a re-run
    const fn = jest.fn().mockResolvedValue('refreshed');
    const result = await piscachio(fn, { key: 'set-stale' });
    expect(result).toBe('stale-value');
    expect(fn).toHaveBeenCalledTimes(1); // triggered a background re-run

    // After the re-run, the value should be updated
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result2 = await piscachio(fn, { key: 'set-stale' });
    expect(result2).toBe('refreshed');
  });
});
