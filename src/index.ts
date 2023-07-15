// Types
import { KeyString, PiscachioConfig } from './types';

import createCache from './cache';

const cache = createCache();

export default async function piscachio<T>(
  fn: () => Promise<T>,
  {
    key,
    expireIn,
    staleIn,
  }: PiscachioConfig,
) {
  if (!key) throw new Error('Piscachio key is required.');
  key = Array.isArray(key) ? key : [key];
  key.forEach(key => {
    if (key.includes('::')) throw new Error(`Piscachio key ${key} may not contain the "::" character.`);
  });

  const keyAsString = key.join('::');

  const cachedCall = await cache.handle(keyAsString, fn, { key, expireIn, staleIn });

  return cachedCall.value as T;
}
