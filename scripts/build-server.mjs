// Bundles the host and CLI into one file with no runtime dependencies.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
copyFileSync('node_modules/@fontsource-variable/spline-sans-mono/LICENSE', join(out, 'OFL-SplineSansMono.txt'))
copyFileSync('NOTICE.md', join(out, 'NOTICE.txt'))
copyFileSync('LICENSE', join(out, 'LICENSE-Locus.txt'))
for (const f of readdirSync('licenses')) copyFileSync(join('licenses', f), join(out, f))
// Every package whose code reaches the Studio's bundle, read from a build's source maps. Their licences ask to travel with every copy, and these come straight from the packages for the same reason.
for (const name of ['react', 'react-dom', 'scheduler', 'pdfjs-dist', 'fflate', '@anthropic-ai/sdk', '@opentelemetry/api', 'standardwebhooks', '@stablelib/base64', 'fast-sha256', 'd3-contour', 'd3-array']) {
  const to = join(out, `LICENSE-${name.replace('@', '').replace('/', '-')}.txt`)
  const from = join('node_modules', name, 'LICENSE')
  if (existsSync(from)) copyFileSync(from, to)
  else {
    // A package that ships no licence text still says which one it's under.
    const { version, license, repository } = JSON.parse(readFileSync(join('node_modules', name, 'package.json'), 'utf8'))
    writeFileSync(to, `${name} ${version} is under the ${license} licence, according to its package.json. The package ships no licence text.\nSource: ${repository?.url ?? repository ?? 'not given'}\n`)
  }
}
console.log('Copied licences to', out)

// The website links to these, so every host serves the version of them that it runs, as plain text, whether or not the repository is public.
const docs = 'dist/studio/docs'
mkdirSync(docs, { recursive: true })
for (const f of ['SECURITY.md', 'SELF-HOSTING.md']) copyFileSync(join('docs', f), join(docs, f))
console.log('Copied the security policy and the self-hosting guide to', docs)
