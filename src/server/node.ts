// Runs the handler on Node's http module. Nothing is logged about any request,
// because paths can contain passwords.

import { createServer, type Server } from 'node:http'
import type { Handler } from './app.ts'

/**
 * Which address a request came from. Anyone can send their own X-Forwarded-For, and
 * each proxy appends the address it saw, so only entries added by your own proxies
 * can be believed: the one `hops` from the right, never the leftmost.
 */
export function clientAddress(forwardedFor: string | undefined, socketAddress: string | undefined, hops: number): string {
  if (hops > 0 && forwardedFor) {
    const entries = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean)
    const entry = entries[entries.length - hops]
    if (entry) return entry
  }
  return socketAddress || 'unknown'
}

export function listen(handler: Handler, port: number, maxBodyBytes: number, proxyHops: number): Promise<Server> {
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

      const forwarded = req.headers['x-forwarded-for']
      const ip = clientAddress(Array.isArray(forwarded) ? forwarded.join(',') : forwarded, req.socket.remoteAddress, proxyHops)
      const response = await handler(request, ip)

      const out: Record<string, string | string[]> = {}
      response.headers.forEach((v, k) => (out[k] = v))
      // Each cookie is its own header. Walking the headers keeps only the last of them.
      const cookies = response.headers.getSetCookie()
      if (cookies.length) out['set-cookie'] = cookies
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
