// Where sealed maps live: a folder per name. There's no database and nothing
// else to leak. A site is ciphertext plus a hash of its publish token, and, on a
// host with Google sign-in, a keyed hash of the account that claimed it.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SiteMeta {
  tokenHash: string
  createdAt: string
  updatedAt: string
  version: number
  bytes: number
  /** A keyed hash of the Google account that claimed this name (auth.ts). Never an email or a name. */
  owner?: string
}

export class FileStore {
  private root: string
  /** How many sites there are, kept so the page's every load doesn't read every site's meta. Only this store adds or removes one. */
  private counted: number | null = null

  constructor(dataDir: string) {
    this.root = join(dataDir, 'sites')
    mkdirSync(this.root, { recursive: true })
  }

  private dir(name: string) {
    return join(this.root, name)
  }

  has(name: string): boolean {
    return existsSync(join(this.dir(name), 'meta.json'))
  }

  meta(name: string): SiteMeta | null {
    try {
      return JSON.parse(readFileSync(join(this.dir(name), 'meta.json'), 'utf8'))
    } catch {
      return null
    }
  }

  bundle(name: string): string | null {
    try {
      return readFileSync(join(this.dir(name), 'bundle.json'), 'utf8')
    } catch {
      return null
    }
  }

  list(): { name: string; meta: SiteMeta }[] {
    const out: { name: string; meta: SiteMeta }[] = []
    for (const name of readdirSync(this.root)) {
      if (!statSync(this.dir(name)).isDirectory()) continue
      const meta = this.meta(name)
      if (meta) out.push({ name, meta })
    }
    return out
  }

  count(): number {
    if (this.counted === null) this.counted = this.list().length
    return this.counted
  }

  /** Write the bundle first, then the meta that points at it, each atomically. */
  save(name: string, bundle: string, meta: SiteMeta): void {
    const dir = this.dir(name)
    if (!this.has(name)) this.counted = null
    mkdirSync(dir, { recursive: true })
    const write = (file: string, data: string) => {
      const tmp = join(dir, `.${file}.tmp`)
      writeFileSync(tmp, data, { mode: 0o600 })
      renameSync(tmp, join(dir, file))
    }
    write('bundle.json', bundle)
    write('meta.json', JSON.stringify(meta))
  }

  remove(name: string): boolean {
    if (!this.has(name)) return false
    rmSync(this.dir(name), { recursive: true, force: true })
    this.counted = null
    return true
  }
}
