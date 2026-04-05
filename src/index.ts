// Types
import { KeyString, PiscachioConfig, PiscachioInstance, PiscachioPeekPayload, PiscachioSetConfig } from './types';

import createCache from './cache';

const globalPiscachio = isolate();

export default globalPiscachio;
export const set = globalPiscachio.set;
export const peek = globalPiscachio.peek;
export const forceStale = globalPiscachio.forceStale;
export const expire = globalPiscachio.expire;

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
    validateConfig(config);
    const keyAsString = getKeyAsString(config.key);

    const value = await cache.handle(keyAsString, fn, config);

    return value as T;
  }

  function set<T>(
    value: T,
    config: PiscachioSetConfig,
  ): T {
    validateConfig(config);
    const keyAsString = getKeyAsString(config.key);
    cache.set(keyAsString, value, config);
    return value;
  }

  function peek<T>(key: string | string[]): PiscachioPeekPayload<T> {
    return cache.peek(getKeyAsString(key));
  }

  function forceStale(key: string | string[]): void {
    cache.forceStale(getKeyAsString(key));
  }

  function expire(key: string | string[]): void {
    cache.expire(getKeyAsString(key));
  }

  const instance = piscachio as PiscachioInstance;
  instance.set = set;
  instance.peek = peek;
  instance.forceStale = forceStale;
  instance.expire = expire;

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

function validateConfig(config: Pick<PiscachioConfig, 'expireIn'>): void {
  if (config.expireIn === undefined) return;
  if (config.expireIn === Infinity) return;
  if (!Number.isFinite(config.expireIn) || config.expireIn < 0) {
    throw new Error('Piscachio expireIn must be a non-negative finite number or Infinity.');
  }
}
