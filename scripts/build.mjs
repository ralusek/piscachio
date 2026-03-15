import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
const distDir = join(rootDir, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const sharedOptions = {
  bundle: true,
  entryPoints: ['src/index.ts'],
  platform: 'neutral',
  sourcemap: true,
  target: 'es2018',
};

await build({
  ...sharedOptions,
  format: 'cjs',
  outfile: 'dist/index.js',
});

await build({
  ...sharedOptions,
  format: 'esm',
  outfile: 'dist/index.mjs',
});

execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json'],
  { stdio: 'inherit' },
);
