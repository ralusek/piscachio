import piscachio, { isolate, set, wipe } from '../dist';

describe('isolate functionality', () => {
  it('should keep the default context separate from isolated contexts', async () => {
    const isolated = isolate();

    const defaultFn = jest.fn().mockResolvedValue('default-value');
    const isolatedFn = jest.fn().mockResolvedValue('isolated-value');

    await expect(piscachio(defaultFn, { key: 'isolate-default-separation' })).resolves.toBe('default-value');
    await expect(isolated(isolatedFn, { key: 'isolate-default-separation' })).resolves.toBe('isolated-value');

    expect(defaultFn).toHaveBeenCalledTimes(1);
    expect(isolatedFn).toHaveBeenCalledTimes(1);

    const defaultHitFn = jest.fn().mockResolvedValue('should-not-run-default');
    const isolatedHitFn = jest.fn().mockResolvedValue('should-not-run-isolated');

    await expect(piscachio(defaultHitFn, { key: 'isolate-default-separation' })).resolves.toBe('default-value');
    await expect(isolated(isolatedHitFn, { key: 'isolate-default-separation' })).resolves.toBe('isolated-value');

    expect(defaultHitFn).toHaveBeenCalledTimes(0);
    expect(isolatedHitFn).toHaveBeenCalledTimes(0);
  });

  it('should keep separate isolated contexts from sharing cached values', async () => {
    const first = isolate();
    const second = isolate();

    const firstFn = jest.fn().mockResolvedValue('first-value');
    const secondFn = jest.fn().mockResolvedValue('second-value');

    await expect(first(firstFn, { key: 'isolate-private-separation' })).resolves.toBe('first-value');
    await expect(second(secondFn, { key: 'isolate-private-separation' })).resolves.toBe('second-value');

    expect(firstFn).toHaveBeenCalledTimes(1);
    expect(secondFn).toHaveBeenCalledTimes(1);
  });

  it('should scope set calls to the instance that performed them', async () => {
    const isolated = isolate();

    isolated.set('isolated-seeded-value', { key: 'isolate-set-separation' });
    set('default-seeded-value', { key: 'default-set-separation' });

    const isolatedMissFn = jest.fn().mockResolvedValue('isolated-miss');
    const defaultMissFn = jest.fn().mockResolvedValue('default-miss');

    await expect(isolated(isolatedMissFn, { key: 'default-set-separation' })).resolves.toBe('isolated-miss');
    await expect(piscachio(defaultMissFn, { key: 'isolate-set-separation' })).resolves.toBe('default-miss');

    expect(isolatedMissFn).toHaveBeenCalledTimes(1);
    expect(defaultMissFn).toHaveBeenCalledTimes(1);

    const isolatedHitFn = jest.fn().mockResolvedValue('should-not-run-isolated');
    const defaultHitFn = jest.fn().mockResolvedValue('should-not-run-default');

    await expect(isolated(isolatedHitFn, { key: 'isolate-set-separation' })).resolves.toBe('isolated-seeded-value');
    await expect(piscachio(defaultHitFn, { key: 'default-set-separation' })).resolves.toBe('default-seeded-value');

    expect(isolatedHitFn).toHaveBeenCalledTimes(0);
    expect(defaultHitFn).toHaveBeenCalledTimes(0);
  });

  it('should wipe only the targeted isolated context and leave it reusable', async () => {
    const isolated = isolate();

    isolated.set('isolated-value', { key: 'isolate-wipe-private' });
    set('default-value', { key: 'isolate-wipe-private' });

    isolated.wipe();

    expect(isolated.peek('isolate-wipe-private')).toEqual({
      key: 'isolate-wipe-private',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    expect(piscachio.peek('isolate-wipe-private')).toEqual({
      key: 'isolate-wipe-private',
      missed: false,
      value: 'default-value',
      state: 'fresh',
      pending: false,
      committedAt: expect.any(Number),
      staleAt: null,
      expiresAt: null,
    });

    const refillFn = jest.fn().mockResolvedValue('refilled');
    await expect(isolated(refillFn, { key: 'isolate-wipe-private' })).resolves.toBe('refilled');
    expect(refillFn).toHaveBeenCalledTimes(1);
  });

  it('should let the shared wipe helper clear only the shared context', () => {
    const isolated = isolate();

    set('default-value', { key: 'shared-wipe-scope' });
    isolated.set('isolated-value', { key: 'shared-wipe-scope' });

    wipe();

    expect(piscachio.peek('shared-wipe-scope')).toEqual({
      key: 'shared-wipe-scope',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    expect(isolated.peek('shared-wipe-scope')).toEqual({
      key: 'shared-wipe-scope',
      missed: false,
      value: 'isolated-value',
      state: 'fresh',
      pending: false,
      committedAt: expect.any(Number),
      staleAt: null,
      expiresAt: null,
    });
  });

  it('should let pending work resolve after wipe without restoring wiped state', async () => {
    const isolated = isolate();
    let resolveValue!: (value: string) => void;
    const fn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolveValue = resolve;
      })
    );

    const pendingPromise = isolated(fn, { key: 'isolate-wipe-pending', expireIn: 60_000 });
    expect(isolated.peek('isolate-wipe-pending')).toEqual({
      key: 'isolate-wipe-pending',
      missed: true,
      value: null,
      state: 'missing',
      pending: true,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    isolated.wipe();

    expect(isolated.peek('isolate-wipe-pending')).toEqual({
      key: 'isolate-wipe-pending',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    resolveValue('slow-result');
    await expect(pendingPromise).resolves.toBe('slow-result');

    expect(isolated.peek('isolate-wipe-pending')).toEqual({
      key: 'isolate-wipe-pending',
      missed: true,
      value: null,
      state: 'missing',
      pending: false,
      committedAt: null,
      staleAt: null,
      expiresAt: null,
    });

    const refillFn = jest.fn().mockResolvedValue('next-value');
    await expect(isolated(refillFn, { key: 'isolate-wipe-pending' })).resolves.toBe('next-value');
    expect(refillFn).toHaveBeenCalledTimes(1);
  });
});
