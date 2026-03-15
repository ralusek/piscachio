import piscachio from '../dist';

describe('lifecycle callbacks', () => {
  describe('onMiss', () => {
    it('should call onMiss when the cache does not have an entry', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onMiss).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'lifecycle-miss' })
      );
    });

    it('should not call onMiss on a cache hit', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss-no-hit', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await piscachio(fn, { key: 'lifecycle-miss-no-hit', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should call onMiss when the cache entry has expired', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-miss-expired', expireIn: 0, onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await piscachio(fn, { key: 'lifecycle-miss-expired', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(2); // Called again after expiration
    });

    it('should not call onMiss on a stale re-fetch', async () => {
      const onMiss = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-miss-not-stale', staleIn: 0, onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);

      // Second call triggers stale re-fetch — should NOT fire onMiss
      await piscachio(fn, { key: 'lifecycle-miss-not-stale', onMiss });
      expect(onMiss).toHaveBeenCalledTimes(1);
    });

    it('should swallow errors thrown by onMiss', async () => {
      const onMiss = jest.fn().mockImplementation(() => {
        throw new Error('onMiss error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await expect(piscachio(fn, { key: 'lifecycle-miss-throw', onMiss })).resolves.toBe('value');
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onHit', () => {
    it('should call onHit when the cache has an entry', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit' });

      await piscachio(fn, { key: 'lifecycle-hit', onHit });
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'lifecycle-hit' })
      );
    });

    it('should not call onHit on a cache miss', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-no-miss', onHit });
      expect(onHit).toHaveBeenCalledTimes(0);
    });

    it('should call onHit on stale hits', async () => {
      const onHit = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-hit-stale', staleIn: 0 });

      await piscachio(fn, { key: 'lifecycle-hit-stale', onHit });
      expect(onHit).toHaveBeenCalledTimes(1); // Stale hit is still a hit
    });

    it('should swallow errors thrown by onHit', async () => {
      const onHit = jest.fn().mockImplementation(() => {
        throw new Error('onHit error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-hit-throw' });

      await expect(piscachio(fn, { key: 'lifecycle-hit-throw', onHit })).resolves.toBe('value');
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStale', () => {
    it('should call onStale when the cached entry is stale', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-stale', staleIn: 0 });

      await piscachio(fn, { key: 'lifecycle-stale', onStale });
      expect(onStale).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'lifecycle-stale' })
      );
    });

    it('should not call onStale when the cached entry is fresh', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-stale-fresh' });

      await piscachio(fn, { key: 'lifecycle-stale-fresh', onStale });
      expect(onStale).toHaveBeenCalledTimes(0);
    });

    it('should not call onStale on a cache miss', async () => {
      const onStale = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-stale-miss', onStale });
      expect(onStale).toHaveBeenCalledTimes(0);
    });

    it('should swallow errors thrown by onStale', async () => {
      const onStale = jest.fn().mockImplementation(() => {
        throw new Error('onStale error');
      });
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-stale-throw', staleIn: 0 });

      await expect(piscachio(fn, { key: 'lifecycle-stale-throw', onStale })).resolves.toBe('first');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onStale).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('onFresh', () => {
    it('should call onFresh when the cached entry is fresh', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh' });

      await piscachio(fn, { key: 'lifecycle-fresh', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(1);
      expect(onFresh).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'lifecycle-fresh' })
      );
    });

    it('should not call onFresh when the cached entry is stale', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await piscachio(fn, { key: 'lifecycle-fresh-stale', staleIn: 0 });

      await piscachio(fn, { key: 'lifecycle-fresh-stale', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(0);
    });

    it('should not call onFresh on a cache miss', async () => {
      const onFresh = jest.fn();
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh-miss', onFresh });
      expect(onFresh).toHaveBeenCalledTimes(0);
    });

    it('should swallow errors thrown by onFresh', async () => {
      const onFresh = jest.fn().mockImplementation(() => {
        throw new Error('onFresh error');
      });
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-fresh-throw' });

      await expect(piscachio(fn, { key: 'lifecycle-fresh-throw', onFresh })).resolves.toBe('value');
      expect(onFresh).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('combined callbacks', () => {
    it('should call onMiss only on first call, then onHit + onFresh on subsequent fresh hits', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const onStale = jest.fn();
      const onFresh = jest.fn();
      const callbacks = { onMiss, onHit, onStale, onFresh };
      const fn = jest.fn().mockResolvedValue('value');

      // First call — miss
      await piscachio(fn, { key: 'lifecycle-combined', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(0);
      expect(onStale).toHaveBeenCalledTimes(0);
      expect(onFresh).toHaveBeenCalledTimes(0);

      // Second call — fresh hit
      await piscachio(fn, { key: 'lifecycle-combined', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledTimes(0);
      expect(onFresh).toHaveBeenCalledTimes(1);
    });

    it('should call onHit + onStale (not onFresh or onMiss) on a stale hit', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const onStale = jest.fn();
      const onFresh = jest.fn();
      const callbacks = { onMiss, onHit, onStale, onFresh };
      const fn = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      // First call — miss
      await piscachio(fn, { key: 'lifecycle-combined-stale', staleIn: 0, ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);

      // Second call — stale hit
      await piscachio(fn, { key: 'lifecycle-combined-stale', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1); // Not called again
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onStale).toHaveBeenCalledTimes(1);
      expect(onFresh).toHaveBeenCalledTimes(0);
    });

    it('should call onMiss again after expiration', async () => {
      const onMiss = jest.fn();
      const onHit = jest.fn();
      const callbacks = { onMiss, onHit };
      const fn = jest.fn().mockResolvedValue('value');

      await piscachio(fn, { key: 'lifecycle-combined-expire', expireIn: 0, ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(1);
      expect(onHit).toHaveBeenCalledTimes(0);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await piscachio(fn, { key: 'lifecycle-combined-expire', ...callbacks });
      expect(onMiss).toHaveBeenCalledTimes(2);
      expect(onHit).toHaveBeenCalledTimes(0);
    });
  });
});
