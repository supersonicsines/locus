// The brand pack, brand/, mirrors the app and its own sources. These fail when one changed without `npm run brand`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
// @ts-expect-error: a plain ES module with no types
import { MARK, exportSvg, tiersData, siteMarkPaths } from '../brand/source/mark.js'
// @ts-expect-error: a plain ES module with no types
import { readTokens, tokensCss, tokensJson } from '../brand/source/tokens.mjs'

const root = resolve(import.meta.dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const bytes = (p: string) => readFileSync(resolve(root, p))
const again = 'is out of date: run npm run brand'

test('the pack’s interface is the app’s own stylesheets', () => {
  assert.equal(read('brand/ui/styles.css'), read('src/studio/styles.css'), `brand/ui/styles.css ${again}`)
  assert.equal(read('brand/ui/site.css'), read('src/studio/site/site.css'), `brand/ui/site.css ${again}`)
})

test('the tokens are the ones the app defines', () => {
  const tokens = readTokens(read('src/studio/styles.css'), read('src/studio/site/site.css'))
  assert.equal(read('brand/tokens/tokens.css'), tokensCss(tokens), `brand/tokens/tokens.css ${again}`)
  assert.equal(read('brand/tokens/tokens.json'), tokensJson(tokens), `brand/tokens/tokens.json ${again}`)
  for (const t of tokens) assert.ok(t.meaning, `--${t.name} has no meaning in brand/source/tokens.mjs`)
})

test('every mark in the pack is what mark.js draws', () => {
  const sizes: [number, string][] = [[1024, 'L'], [512, 'L'], [180, 'M'], [128, 'S'], [64, 'SL'], [32, 'XS'], [16, 'XXS']]
  for (const [size, tier] of sizes) {
    for (const kind of ['light', 'dark', 'reverse', 'oneink', ...(tier === 'L' || tier === 'S' ? ['bare'] : [])]) {
      const name = `locus-mark-${size}-${kind}`
      assert.equal(read(`brand/logo/mark/${name}.svg`), exportSvg(MARK, { size, tier, kind, id: name }), `${name}.svg ${again}`)
    }
  }
  for (const [size, tier] of [[1024, 'L'], [512, 'L'], [180, 'M']] as [number, string][]) {
    const name = `locus-mark-${size}-draw`
    assert.equal(read(`brand/logo/motion/${name}.svg`), exportSvg(MARK, { size, tier, kind: 'light', id: name, draw: true }), `${name}.svg ${again}`)
  }
  assert.equal(read('brand/logo/tiers.json'), JSON.stringify(tiersData(MARK), null, 1) + '\n', `brand/logo/tiers.json ${again}`)
})

test('the site draws the pack’s mark and uses its icons', () => {
  const tiers = JSON.parse(read('brand/logo/tiers.json'))
  assert.equal(read('src/studio/site/mark-paths.ts'), siteMarkPaths(tiers), `src/studio/site/mark-paths.ts ${again}`)
  for (const f of ['favicon.ico', 'apple-touch-icon.png']) assert.deepEqual(bytes(`src/studio/public/${f}`), bytes(`brand/logo/icon/${f}`), `src/studio/public/${f} ${again}`)
  assert.deepEqual(bytes('src/studio/public/social.png'), bytes('brand/logo/social/locus-social-light.png'), `src/studio/public/social.png ${again}`)
})

test('brand.json lists every file in the pack, and nothing that isn’t there', () => {
  const manifest = JSON.parse(read('brand/brand.json'))
  const listed = new Set<string>(manifest.files.map((f: { path: string }) => f.path))
  for (const p of listed) assert.ok(existsSync(resolve(root, 'brand', p)), `brand.json lists ${p}, which isn’t there`)
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]))
  for (const dir of ['logo', 'tokens', 'fonts', 'ui']) {
    for (const f of walk(resolve(root, 'brand', dir))) {
      const p = relative(resolve(root, 'brand'), f).split('\\').join('/')
      assert.ok(listed.has(p), `brand/${p} isn’t in brand.json ${again}`)
    }
  }
})
