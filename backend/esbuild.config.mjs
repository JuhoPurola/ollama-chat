import { build } from 'esbuild';
import { readdirSync } from 'fs';

const functions = readdirSync('src/functions').filter(f => f.endsWith('.ts'));

await build({
  entryPoints: functions.map(f => `src/functions/${f}`),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  external: ['@aws-sdk/*'],
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log('Backend build complete');
