// Bundles the host and CLI into one file with no runtime dependencies.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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

// What ships with the fonts and logos has to ship with every copy, including a Docker image holding only dist.
// The font licences come straight from the packages the fonts come from, with their copyright lines intact.
const out = 'dist/studio/licenses'
mkdirSync(out, { recursive: true })
copyFileSync('node_modules/@fontsource/geist/LICENSE', join(out, 'OFL-Geist.txt'))
copyFileSync('node_modules/@fontsource/lustria/LICENSE', join(out, 'OFL-Lustria.txt'))
copyFileSync('NOTICE.md', join(out, 'NOTICE.txt'))
copyFileSync('LICENSE', join(out, 'LICENSE-Vadere.txt'))
for (const f of readdirSync('licenses')) copyFileSync(join('licenses', f), join(out, f))
console.log('Copied licences to', out)
