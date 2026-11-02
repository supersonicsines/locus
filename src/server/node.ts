// Runs the handler on Node's http module. Nothing is logged about any request,
// because paths can contain passwords.

import { createServer, type Server } from 'node:http'
import type { Handler } from './app.ts'

export function listen(handler: Handler, port: number, maxBodyBytes: number, trustProxy: boolean): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        // Leave some headroom so the handler can answer with a friendly "too large".
        if (size > maxBodyBytes * 1.5) {
          res.writeHead(413)
          res.end()
          req.destroy()
          return
        }
        chunks.push(chunk)
      }

      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue
        headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      const method = req.method ?? 'GET'
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
      })

      const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
      const response = await handler(request, forwarded || req.socket.remoteAddress || 'unknown')

      const out: Record<string, string> = {}
      response.headers.forEach((v, k) => (out[k] = v))
      res.writeHead(response.status, out)
      res.end(method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()))
    } catch (e) {
      // Name only. The message or a stack could carry a path with a password in it.
      console.error('Request failed:', e instanceof Error ? e.name : 'unknown error')
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve(server))
  })
}
