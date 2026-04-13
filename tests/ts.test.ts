import piscachio, { isolate, peek, wipe } from '../dist';

describe('basic piscachio functionality', () => {
  it('should not throw a typescript error for return type', async () => {
    async function a() {
      const y = await piscachio(async () => {
        return 5;
      }, { key: ['testKey', 'a'] });
    
      // Type check
      const z: number = y;
    }
  });

  it('should not throw a typescript error for isolated instances', async () => {
    async function a() {
      const isolated = isolate();
      isolated.set(5, { key: ['testKey', 'isolated'] });

      const y = await isolated(async () => {
        return 5;
      }, { key: ['testKey', 'isolated'] });

      const z: number = y;
    }
  });

  it('should not throw a typescript error for peek results', () => {
    const result = peek<number>(['testKey', 'peek']);

    if (!result.missed) {
      const z: number = result.value;
    }
  });

  it('should not throw a typescript error for isolated peek results', () => {
    const isolated = isolate();
    const result = isolated.peek<number>(['testKey', 'isolated-peek']);

    if (!result.missed) {
      const z: number = result.value;
    }
  });

  it('should not throw a typescript error for wipe helpers', () => {
    const isolated = isolate();
    isolated.wipe();
    wipe();
    piscachio.wipe();
  });
});
