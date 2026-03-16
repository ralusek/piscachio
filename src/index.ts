// Types
import { KeyString, PiscachioConfig, PiscachioInstance, PiscachioSetConfig } from './types';

import createCache from './cache';

const globalPiscachio = isolate();

export default globalPiscachio;
export const set = globalPiscachio.set;

export function isolate(): PiscachioInstance {
  const cache = createCache();

  async function piscachio<T>(
    fn: () => Promise<T>,
    config: PiscachioConfig & { rush: true },
  ): Promise<T | null>;
  async function piscachio<T>(
    fn: () => Promise<T>,
    config: PiscachioConfig,
  ): Promise<T>;
  async function piscachio<T>(
    fn: () => Promise<T>,
    config: PiscachioConfig,
  ) {
    const keyAsString = getKeyAsString(config.key);

    const value = await cache.handle(keyAsString, fn, config);

    return value as T;
  }

  function set<T>(
    value: T,
    config: PiscachioSetConfig,
  ): T {
    const keyAsString = getKeyAsString(config.key);
    cache.set(keyAsString, value, config);
    return value;
  }

  const instance = piscachio as PiscachioInstance;
  instance.set = set;

  return instance;
}

function getKeyAsString(key: string | string[]): KeyString {
  if (!key) throw new Error('Piscachio key is required.');
  key = Array.isArray(key) ? key : [key];
  key.forEach(key => {
    if (key.includes('::')) throw new Error(`Piscachio key ${key} may not contain the "::" character.`);
  });
  return key.join('::');
}
