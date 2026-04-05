import piscachio, { isolate, peek, set } from '../dist';

describe('peek functionality', () => {
  it('should return miss metadata for a missing key', () => {
    expect(peek('peek-missing')).toEqual({
      key: 'peek-missing',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });
  });

  it('should return metadata for a committed fresh value', () => {
    set('hello', { key: 'peek-fresh' });

    const result = peek<string>('peek-fresh');
    expect(result.missed).toBe(false);
    if (result.missed) throw new Error('expected a hit');

    expect(result.key).toBe('peek-fresh');
    expect(result.value).toBe('hello');
    expect(result.state).toBe('fresh');
    expect(result.pending).toBe(false);
    expect(typeof result.committedAt).toBe('number');
    expect(result.staleAt).toBeNull();
    expect(result.expiresAt).toBeNull();
  });

  it('should support compound keys', () => {
    set(42, { key: ['peek-compound', 'a'] });

    const result = peek<number>(['peek-compound', 'a']);
    expect(result.missed).toBe(false);
    if (result.missed) throw new Error('expected a hit');

    expect(result.key).toBe('peek-compound::a');
    expect(result.value).toBe(42);
  });

  it('should report an in-flight miss without a committed value', async () => {
    const slowFn = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('slow-result'), 50))
    );

    const inFlightPromise = piscachio(slowFn, { key: 'peek-pending-miss' });
    const result = peek<string>('peek-pending-miss');

    expect(result).toEqual({
      key: 'peek-pending-miss',
      missed: true,
      value: null,
      state: 'missing',
      pending: true,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    await expect(inFlightPromise).resolves.toBe('slow-result');
  });

  it('should report stale committed values without starting a refresh', async () => {
    set('stale-value', { key: 'peek-stale', staleIn: 0 });

    const snapshot = peek<string>('peek-stale');
    expect(snapshot.missed).toBe(false);
    if (snapshot.missed) throw new Error('expected a hit');

    expect(snapshot.value).toBe('stale-value');
    expect(snapshot.state).toBe('stale');
    expect(snapshot.pending).toBe(false);

    const fn = jest.fn().mockResolvedValue('refreshed');
    const result = await piscachio(fn, { key: 'peek-stale' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('stale-value');
  });

  it('should not extend expiry when peeking', async () => {
    set('ephemeral', { key: 'peek-no-touch', expireIn: 40 });

    await new Promise(resolve => setTimeout(resolve, 20));
    const snapshot = peek<string>('peek-no-touch');
    expect(snapshot.missed).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 30));

    const fn = jest.fn().mockResolvedValue('fresh');
    const result = await piscachio(fn, { key: 'peek-no-touch' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('fresh');
  });

  it('should treat expired values as missing', async () => {
    set('ephemeral', { key: 'peek-expired', expireIn: 25 });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(peek('peek-expired')).toEqual({
      key: 'peek-expired',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });
  });

  it('should keep peek scoped to isolated instances', () => {
    const isolated = isolate();

    set('shared', { key: 'peek-isolated' });
    isolated.set('private', { key: 'peek-isolated' });

    const sharedResult = peek<string>('peek-isolated');
    const privateResult = isolated.peek<string>('peek-isolated');

    expect(sharedResult.missed).toBe(false);
    expect(privateResult.missed).toBe(false);
    if (sharedResult.missed || privateResult.missed) throw new Error('expected hits');

    expect(sharedResult.value).toBe('shared');
    expect(privateResult.value).toBe('private');
  });
});
