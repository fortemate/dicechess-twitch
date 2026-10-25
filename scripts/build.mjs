import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/host/main.ts'],
    outdir: 'dist/host',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
  }),
  build({
    entryPoints: ['src/client/operator.ts', 'src/client/obs.ts'],
    outdir: 'dist/client',
    bundle: true,
    format: 'esm',
    target: 'es2023',
  }),
  ...['operator.html', 'obs.html', 'styles.css'].map((file) =>
    copyFile(`src/client/${file}`, `dist/client/${file}`),
  ),
]);
