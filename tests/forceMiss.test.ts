import piscachio, { expire } from '../dist';

describe('forceMiss functionality', () => {
  afterEach(() => {
    expire('force-miss-callback-default');
    expire('force-miss-callback-forced');
    expire('force-miss-refresh');
    expire('force-miss-rush');
    expire('force-miss-pending');
    expire('force-miss-stale-refresh');
    expire('force-miss-expiry');
  });

  it('should report forced:false to onMiss on a normal miss', async () => {
    const onMiss = jest.fn();
    const fn = jest.fn().mockResolvedValue('value');

    await piscachio(fn, {
      key: 'force-miss-callback-default',
      onMiss,
    });

    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss).toHaveBeenCalledWith(
      { key: 'force-miss-callback-default' },
      { forced: false },
    );
  });

  it('should report forced:true to onMiss on a forced miss', async () => {
    const onMiss = jest.fn();
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await piscachio(fn, { key: 'force-miss-callback-forced' });
    const result = await piscachio(fn, {
      key: 'force-miss-callback-forced',
      forceMiss: true,
      onMiss,
    });

    expect(result).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss).toHaveBeenCalledWith(
      { key: 'force-miss-callback-forced' },
      { forced: true },
    );
  });

  it('should rerun fn and replace the cached value on a forced miss', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    const first = await piscachio(fn, { key: 'force-miss-refresh' });
    const second = await piscachio(fn, {
      key: 'force-miss-refresh',
      forceMiss: true,
    });
    const third = await piscachio(fn, { key: 'force-miss-refresh' });

    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(third).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should treat a forced miss like a miss when rush is true', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve('second'), 50))
      );

    await piscachio(fn, { key: 'force-miss-rush' });

    const rushed = await piscachio(fn, {
      key: 'force-miss-rush',
      forceMiss: true,
      rush: true,
    });

    expect(rushed).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);

    await new Promise((resolve) => setTimeout(resolve, 75));

    const refreshed = await piscachio(fn, { key: 'force-miss-rush' });
    expect(refreshed).toBe('second');
  });

  it('should supersede a pending run when forceMiss is used mid-flight', async () => {
    let resolveFirst!: (value: string) => void;
    const fn = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>(resolve => { resolveFirst = resolve; })
      )
      .mockResolvedValueOnce('second');

    // First call starts a pending run that hasn't resolved yet.
    const firstPromise = piscachio(fn, { key: 'force-miss-pending' });

    // Force miss while the first run is still in-flight.
    const second = await piscachio(fn, {
      key: 'force-miss-pending',
      forceMiss: true,
    });

    expect(second).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);

    // Resolve the orphaned first run — it should NOT overwrite the committed value.
    resolveFirst('first');
    await firstPromise;

    const third = await piscachio(fn, { key: 'force-miss-pending' });
    expect(third).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should supersede a pending stale refresh when forceMiss is used mid-flight', async () => {
    let resolveRefresh!: (value: string) => void;
    let refreshSettled!: Promise<void>;

    const seedFn = jest.fn().mockResolvedValue('first');
    const refreshFn = jest.fn().mockImplementation(
      () => {
        refreshSettled = new Promise<void>((resolve) => {
          resolveRefresh = (value: string) => {
            resolve();
            return value;
          };
        });

        return new Promise<string>((resolve) => {
          const finish = resolveRefresh;
          resolveRefresh = (value: string) => {
            resolve(value);
            finish(value);
          };
        });
      }
    );
    const forcedFn = jest.fn().mockResolvedValue('forced');

    await piscachio(seedFn, { key: 'force-miss-stale-refresh', staleIn: 0 });

    const staleResult = await piscachio(refreshFn, {
      key: 'force-miss-stale-refresh',
      staleIn: 0,
    });

    expect(staleResult).toBe('first');
    expect(refreshFn).toHaveBeenCalledTimes(1);

    const forcedResult = await piscachio(forcedFn, {
      key: 'force-miss-stale-refresh',
      staleIn: 1000,
      forceMiss: true,
    });

    expect(forcedResult).toBe('forced');
    expect(forcedFn).toHaveBeenCalledTimes(1);

    resolveRefresh('refreshed');
    await refreshSettled;

    const finalResult = await piscachio(forcedFn, {
      key: 'force-miss-stale-refresh',
      staleIn: 1000,
    });

    expect(finalResult).toBe('forced');
    expect(forcedFn).toHaveBeenCalledTimes(1);
  });

  it('should apply new expiration settings from a forced miss commit', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')
      .mockResolvedValueOnce('third');

    await piscachio(fn, { key: 'force-miss-expiry' });
    await piscachio(fn, {
      key: 'force-miss-expiry',
      forceMiss: true,
      expireIn: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    const result = await piscachio(fn, { key: 'force-miss-expiry' });
    expect(result).toBe('third');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
