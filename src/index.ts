// Types
import { KeyString, PiscachioConfig } from './types';

import createCache from './cache';

const cache = createCache();

export default async function piscachio<T>(
  fn: () => Promise<T>,
  config: PiscachioConfig & { rush: true },
): Promise<T | null>;
export default async function piscachio<T>(
  fn: () => Promise<T>,
  config: PiscachioConfig,
): Promise<T>;
export default async function piscachio<T>(
  fn: () => Promise<T>,
  {
    key,
    expireIn,
    staleIn,
    rush,
  }: PiscachioConfig,
) {
  const keyAsString = getKeyAsString(key);

  const cachedCall = await cache.handle(keyAsString, fn, { key, expireIn, staleIn, rush });

  if (cachedCall === null) return null;

  return cachedCall.value as T;
}

export function set<T>(
  value: T,
  config: Omit<PiscachioConfig, 'rush'>,
): T {
  const keyAsString = getKeyAsString(config.key);
  cache.set(keyAsString, value, config);
  return value;
}

function getKeyAsString(key: string | string[]): KeyString {
  if (!key) throw new Error('Piscachio key is required.');
  key = Array.isArray(key) ? key : [key];
  key.forEach(key => {
    if (key.includes('::')) throw new Error(`Piscachio key ${key} may not contain the "::" character.`);
  });
  return key.join('::');
}
