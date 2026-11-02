// Bundles the host and CLI into one file with no runtime dependencies.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/cli/index.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'bundle',
  logLevel: 'warning',
})
console.log('Built dist/cli.mjs')
