import piscachio, { set } from '../dist';

describe('validation', () => {
  it('should throw an error when no key is provided', async () => {
    const fn = jest.fn().mockResolvedValue('test');
    
    // @ts-expect-error
    await expect(piscachio(fn, {})).rejects.toThrow('Piscachio key is required.');
  });
  
  it('should throw an error when a key contains "::" character', async () => {
    const fn = jest.fn().mockResolvedValue('test');
  
    await expect(piscachio(fn, { key: 'test::key' })).rejects.toThrow('Piscachio key test::key may not contain the "::" character.');
  });

  it('should throw an error when expireIn is negative', async () => {
    const fn = jest.fn().mockResolvedValue('test');

    await expect(piscachio(fn, { key: 'negative-expire', expireIn: -1 })).rejects.toThrow(
      'Piscachio expireIn must be a non-negative finite number or Infinity.'
    );
  });

  it('should throw an error when expireIn is non-finite and not Infinity', async () => {
    const fn = jest.fn().mockResolvedValue('test');

    await expect(piscachio(fn, { key: 'nan-expire', expireIn: Number.NaN })).rejects.toThrow(
      'Piscachio expireIn must be a non-negative finite number or Infinity.'
    );
    await expect(piscachio(fn, { key: 'negative-infinity-expire', expireIn: Number.NEGATIVE_INFINITY })).rejects.toThrow(
      'Piscachio expireIn must be a non-negative finite number or Infinity.'
    );
  });

  it('should validate expireIn for set as well', () => {
    expect(() => set('value', { key: 'set-negative-expire', expireIn: -1 })).toThrow(
      'Piscachio expireIn must be a non-negative finite number or Infinity.'
    );
  });
});
