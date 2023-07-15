import piscachio from '../dist';

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
});
