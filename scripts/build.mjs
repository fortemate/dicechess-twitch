import { build } from 'esbuild';
import { mkdir, copyFile, cp, rm, readFile } from 'node:fs/promises';

const { engines } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
if (process.versions.node !== engines.node) {
  throw new Error(
    `Use pinned Node.js ${engines.node}; this process is ${process.versions.node}. Check your PATH or run with mise.`,
  );
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await Promise.all([
  build({
    entryPoints: {
      main: 'src/host/main.ts',
      'candidate-worker': 'src/host/candidate-worker.ts',
      'rules-worker': 'src/host/rules-worker.ts',
      'candidate-generator': 'src/engine/generator.ts',
    },
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
  cp('src/client/pieces', 'dist/client/pieces', { recursive: true }),
  cp('src/client/brand', 'dist/client/brand', { recursive: true }),
]);
