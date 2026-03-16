import piscachio, { forceStale } from '../dist';

describe('forceStale functionality', () => {
  it('should cause next read to trigger a background refresh and return the stale value', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    // Populate cache
    const result1 = await piscachio(fn, { key: 'forceStale-basic' });
    expect(result1).toBe('first');
    expect(fn).toHaveBeenCalledTimes(1);

    // Force stale
    forceStale('forceStale-basic');

    // Next read should return stale value and trigger background refresh
    const result2 = await piscachio(fn, { key: 'forceStale-basic', staleIn: 60_000 });
    expect(result2).toBe('first'); // still returns stale value
    expect(fn).toHaveBeenCalledTimes(2); // but triggered a refresh

    // After refresh completes, should return new value
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result3 = await piscachio(fn, { key: 'forceStale-basic', staleIn: 60_000 });
    expect(result3).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2); // no additional call
  });

  it('should be a no-op if the key does not exist', () => {
    // Should not throw
    forceStale('forceStale-nonexistent');
  });

  it('should be a no-op if the key has no committed value (only pending)', async () => {
    const fn = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('pending-result'), 200))
    );

    // Start an in-flight call but don't await
    const promise = piscachio(fn, { key: 'forceStale-pending-only' });

    // forceStale should not throw — there's no committed value to mark
    forceStale('forceStale-pending-only');

    const result = await promise;
    expect(result).toBe('pending-result');
  });

  it('should work with compound keys', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');

    await piscachio(fn, { key: ['forceStale', 'compound'] });
    expect(fn).toHaveBeenCalledTimes(1);

    forceStale(['forceStale', 'compound']);

    const result = await piscachio(fn, { key: ['forceStale', 'compound'], staleIn: 60_000 });
    expect(result).toBe('v1'); // stale value returned
    expect(fn).toHaveBeenCalledTimes(2); // refresh triggered
  });

  it('should work even without staleIn configured on the read call', async () => {
    // If there's no staleIn on the read call, the entry won't be considered stale
    // by normal logic. But forceStale sets committedAt to 0, so any staleIn > 0
    // will see it as stale. Without staleIn at all, isStale returns false.
    const fn = jest
      .fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');

    await piscachio(fn, { key: 'forceStale-no-staleIn' });
    forceStale('forceStale-no-staleIn');

    // Without staleIn, isStale() returns false (staleIn is undefined)
    const result = await piscachio(fn, { key: 'forceStale-no-staleIn' });
    expect(result).toBe('v1');
    expect(fn).toHaveBeenCalledTimes(1); // no refresh triggered

    // With staleIn, it should trigger refresh
    const result2 = await piscachio(fn, { key: 'forceStale-no-staleIn', staleIn: 60_000 });
    expect(result2).toBe('v1');
    expect(fn).toHaveBeenCalledTimes(2); // refresh triggered
  });

  it('should trigger onStale callback on next read', async () => {
    const onStale = jest.fn();
    const fn = jest
      .fn()
      .mockResolvedValueOnce('original')
      .mockResolvedValueOnce('refreshed');

    await piscachio(fn, { key: 'forceStale-onStale', staleIn: 60_000 });
    forceStale('forceStale-onStale');

    await piscachio(fn, { key: 'forceStale-onStale', staleIn: 60_000, onStale });
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'stale',
        value: 'original',
      })
    );

    const payload = onStale.mock.calls[0][0];
    expect(payload.committedAt).toBeGreaterThan(0);
    expect(payload.staleAt).toBeLessThanOrEqual(Date.now());
  });
});
