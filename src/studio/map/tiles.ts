// Service tiles for the canvas: a logo on its tile, or a monogram.
//
// Each tile is drawn once at its exact device-pixel size, so it's crisp at any pixel ratio and costs no more
// than a bitmap copy per frame. Firefox won't draw an SVG on a canvas without a size, which the bundle's files
// all have. Safari can draw a blank if it's asked before the image has decoded, so this waits for decode().

import { monogramOf, type KnownService } from '../logos/lookup.ts'
import { logoSource, serviceFor, TILE_PADDING, TILE_RADIUS } from '../logos/store.ts'
import type { Palette } from './MapView.ts'

/** How many tiles may be drawn fresh in one frame, so zooming through sizes can't cause a hitch. */
const RASTER_BUDGET = 14
const REVEAL_MS = 180
const MAX_CACHED = 800

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export class TileCache {
  private tiles = new Map<string, HTMLCanvasElement>()
  private bySource = new Map<string, HTMLCanvasElement>()
  private images = new Map<string, HTMLImageElement | 'waiting'>()
  private revealed = new Map<string, number>()
  private budget = RASTER_BUDGET
  private sans = 'sans-serif'
  private palette: Palette | null = null
  private dpr = 1
  private reducedMotion = false

  constructor(private redraw: () => void) {
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  configure(palette: Palette, dpr: number, sans: string) {
    if (this.palette?.dark !== palette.dark || this.dpr !== dpr || this.sans !== sans) {
      this.tiles.clear()
      this.bySource.clear()
    }
    this.palette = palette
    this.dpr = dpr
    this.sans = sans
  }

  /** Forgets drawn tiles, for when fonts or logos arrive. */
  reset() {
    this.tiles.clear()
    this.bySource.clear()
  }

  beginFrame() {
    this.budget = RASTER_BUDGET
  }

  /** The logo's image once it has decoded, starting that off the first time it's asked for. */
  private image(service: KnownService): HTMLImageElement | null {
    const got = this.images.get(service.id)
    if (got === 'waiting') return null
    if (got) return got
    const src = logoSource(service)
    if (!src) return null
    this.images.set(service.id, 'waiting')
    const img = new Image()
    img.src = src
    img
      .decode()
      .then(() => {
        this.images.set(service.id, img)
        this.revealed.set(service.id, performance.now())
        this.redraw()
      })
      .catch(() => {
        // A logo that won't draw stays a monogram.
      })
    return null
  }

  private blank(px: number) {
    const c = document.createElement('canvas')
    c.width = px
    c.height = px
    return c
  }

  private drawLogo(service: KnownService, img: HTMLImageElement, px: number): HTMLCanvasElement {
    const c = this.blank(px)
    const x = c.getContext('2d')!
    const r = px * TILE_RADIUS
    // A hairline in the mark's own frame, so the tile holds its edge on paper and on dark.
    roundedRect(x, 0.5, 0.5, px - 1, px - 1, r)
    x.save()
    x.clip()
    // Logos are drawn for white. On dark land a white plate is the brightest thing on the map and outshouts the names, so there it's a paler grey: still the ground the mark was drawn for, a step down.
    x.fillStyle = service.tile ?? (this.palette?.dark ? '#bfc6cf' : '#ffffff')
    x.fillRect(0, 0, px, px)
    x.imageSmoothingEnabled = true
    x.imageSmoothingQuality = 'high'
    const pad = service.full ? 0 : Math.round(px * TILE_PADDING)
    x.drawImage(img, pad, pad, px - pad * 2, px - pad * 2)
    x.restore()
    roundedRect(x, 0.5, 0.5, px - 1, px - 1, r)
    x.lineWidth = 1
    x.strokeStyle = this.palette?.dark ? 'rgba(255,255,255,0.18)' : 'rgba(21,25,30,0.16)'
    x.stroke()
    return c
  }

  private drawMonogram(letter: string, px: number): HTMLCanvasElement {
    const p = this.palette!
    const c = this.blank(px)
    const x = c.getContext('2d')!
    const r = px * TILE_RADIUS
    roundedRect(x, 0.5, 0.5, px - 1, px - 1, r)
    x.fillStyle = p.paper
    x.fill()
    x.lineWidth = 1
    x.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.32 : 0.28})`
    x.stroke()
    x.fillStyle = `rgba(${p.inkRGB},0.74)`
    x.font = `500 ${px * 0.5}px ${this.sans}`
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(letter, px / 2, px / 2 + px * 0.03)
    return c
  }

  /**
   * What to draw for a service of this name at this size. The logo comes with a reveal of 0 to 1, for
   * cross-fading over the monogram when it arrives, so the swap moves nothing.
   */
  tile(name: string, cssSize: number, now: number): { mono: HTMLCanvasElement | null; logo: HTMLCanvasElement | null; reveal: number } {
    const px = Math.max(8, Math.round(cssSize * this.dpr))
    const service = serviceFor(name)
    const img = service?.svg ? this.image(service) : null
    let logo: HTMLCanvasElement | null = null
    let reveal = 1
    if (service && img) {
      logo = this.get(`l|${service.id}|${px}`, service.id, () => this.drawLogo(service, img, px))
      const since = now - (this.revealed.get(service.id) ?? -1e9)
      reveal = this.reducedMotion ? 1 : Math.max(0, Math.min(1, since / REVEAL_MS))
      if (reveal < 1) this.redraw()
    }
    // The monogram is only needed until the logo has fully arrived.
    const mono = logo && reveal >= 1 ? null : this.get(`m|${monogramOf(name)}|${px}`, `m|${monogramOf(name)}`, () => this.drawMonogram(monogramOf(name), px))
    return { mono, logo, reveal }
  }

  private get(key: string, source: string, make: () => HTMLCanvasElement): HTMLCanvasElement | null {
    const found = this.tiles.get(key)
    if (found) return found
    if (this.budget <= 0) {
      // Out of budget this frame: reuse this tile at another size, and come back for the sharp one.
      this.redraw()
      return this.bySource.get(source) ?? null
    }
    this.budget--
    // A long zoom on a big map leaves many sizes behind. They're cheap to draw again.
    if (this.tiles.size > MAX_CACHED) this.tiles.clear()
    const made = make()
    this.tiles.set(key, made)
    this.bySource.set(source, made)
    return made
  }
}
