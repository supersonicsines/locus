// The logo workbench: a static server for workbench/logo on port 4800, with the app's one face at /font.woff2.
// node:http only, no dependencies. `npm run workbench`, then open http://localhost:4800
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../workbench/logo/', import.meta.url))
const FONT = fileURLToPath(
  new URL('../node_modules/@fontsource-variable/spline-sans-mono/files/spline-sans-mono-latin-wght-normal.woff2', import.meta.url),
)
const PORT = Number(process.env.PORT) || 4800

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file
  if (path === '/font.woff2') file = FONT
  else {
    const rel = normalize(path === '/' ? 'index.html' : path.slice(1))
    if (rel.startsWith('..') || rel.includes(`${sep}..`)) {
      res.writeHead(403).end()
      return
    }
    file = ROOT + rel
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Logo workbench on http://localhost:${PORT}`))
