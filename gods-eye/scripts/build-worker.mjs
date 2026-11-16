import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['worker/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['worker', 'browser', 'import'],
  outfile: 'worker/dist/index.js',
  legalComments: 'none',
  logLevel: 'info',
});
