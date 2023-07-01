import piscachio from '../src';

describe('validation', () => {
  it('should throw an error when no key is provided', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    
    // @ts-expect-error
    await expect(piscachio(fn, {})).rejects.toThrow('Piscachio key is required.');
  });
  
  it('should throw an error when a key contains ":" character', async () => {
    const fn = jest.fn().mockResolvedValue('test');
  
    await expect(piscachio(fn, { key: 'test:key' })).rejects.toThrow('Piscachio key test:key may not contain the ":" character.');
  });
  
});
