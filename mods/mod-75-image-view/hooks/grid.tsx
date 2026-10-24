/**
 * grid.tsx - ตารางตัวอักษรมีสี วาดได้ทุกหน้าจอ
 * terminal: ใช้ Raster (ช่องสีจริง เร็ว) / desktop, vscode, mobile: แปลงเป็น SVG
 * ไฟล์นี้ไม่รับ $ (ตัวตรวจของ engine ไม่ให้ส่ง $ ข้ามไฟล์) รับแค่ element ที่ resolve มาแล้ว
 */

export const DEFAULT = 0x01000000 // สีเริ่มต้นของ terminal

export class Grid {
  readonly w: number
  readonly h: number
  readonly ch: string[]
  readonly fg: number[]
  readonly bg: number[]

  constructor(w: number, h: number, bg = DEFAULT) {
    this.w = w
    this.h = h
    this.ch = new Array<string>(w * h).fill(' ')
    this.fg = new Array<number>(w * h).fill(DEFAULT)
    this.bg = new Array<number>(w * h).fill(bg)
  }

  set(x: number, y: number, ch: string, fg = DEFAULT, bg?: number): void {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return
    const i = yi * this.w + xi
    this.ch[i] = ch
    this.fg[i] = fg
    if (bg !== undefined) this.bg[i] = bg
  }

  paint(x: number, y: number, bg: number): void {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return
    this.bg[yi * this.w + xi] = bg
  }

  text(x: number, y: number, s: string, fg = DEFAULT, bg?: number): void {
    ;[...s].forEach((c, i) => this.set(x + i, y, c, fg, bg))
  }
}

// สี RGB เป็นตัวเลข 0xRRGGBB
export function rgb(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (c(r) << 16) | (c(g) << 8) | c(b)
}

export function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return rgb(f(0) * 255, f(8) * 255, f(4) * 255)
}

// ==========================================================================
// Raster ต้องการ base64 ของ u32 little-endian [codePoint, fg, bg] ต่อช่อง
// ==========================================================================
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += B64[a >> 2] ?? ''
    out += B64[((a & 3) << 4) | (b >> 4)] ?? ''
    out += i + 1 < bytes.length ? (B64[((b & 15) << 2) | (c >> 6)] ?? '') : '='
    out += i + 2 < bytes.length ? (B64[c & 63] ?? '') : '='
  }
  return out
}

export function rasterCells(g: Grid): string {
  const bytes = new Uint8Array(g.w * g.h * 12)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < g.w * g.h; i++) {
    view.setUint32(i * 12, (g.ch[i] ?? ' ').codePointAt(0) ?? 32, true)
    view.setUint32(i * 12 + 4, g.fg[i] ?? DEFAULT, true)
    view.setUint32(i * 12 + 8, g.bg[i] ?? DEFAULT, true)
  }
  return base64(bytes)
}

// ==========================================================================
// SVG: รวมช่องที่สีเดียวกันติดกันเป็นก้อนเดียว ให้ไฟล์เล็ก (จำกัด 131,072 ตัวอักษร)
// ==========================================================================
const CW = 8.4
const CH = 16

function hex(c: number, fallback: string): string {
  return c === DEFAULT ? fallback : `#${c.toString(16).padStart(6, '0')}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function svgOf(g: Grid, background = '#0b0e14', foreground = '#d8dee9'): string {
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(g.w * CW)}" height="${g.h * CH}" viewBox="0 0 ${g.w * CW} ${g.h * CH}"><rect width="100%" height="100%" fill="${background}"/>`]
  for (let y = 0; y < g.h; y++) {
    // พื้นหลัง
    let x = 0
    while (x < g.w) {
      const c = g.bg[y * g.w + x] ?? DEFAULT
      let end = x + 1
      while (end < g.w && g.bg[y * g.w + end] === c) end++
      if (c !== DEFAULT) parts.push(`<rect x="${(x * CW).toFixed(1)}" y="${y * CH}" width="${((end - x) * CW).toFixed(1)}" height="${CH}" fill="${hex(c, background)}"/>`)
      x = end
    }
    // ตัวอักษร
    x = 0
    while (x < g.w) {
      const i = y * g.w + x
      if ((g.ch[i] ?? ' ') === ' ') {
        x++
        continue
      }
      const c = g.fg[i] ?? DEFAULT
      let end = x + 1
      while (end < g.w && g.fg[y * g.w + end] === c && (g.ch[y * g.w + end] ?? ' ') !== ' ') end++
      const run = g.ch.slice(i, y * g.w + end).join('')
      parts.push(`<text x="${(x * CW).toFixed(1)}" y="${y * CH + 12}" fill="${hex(c, foreground)}" textLength="${((end - x) * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${esc(run)}</text>`)
      x = end
    }
  }
  parts.push('</svg>')
  const svg = parts.join('')
  return svg.replace('<svg ', '<svg font-family="Consolas, Menlo, monospace" font-size="14" xml:space="preserve" ')
}

// ==========================================================================
// วาดตามหน้าจอ: els = $.ui.resolve(e), surface = e.surface
// ==========================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawGrid(els: any, surface: string, g: Grid, key: string, alt: string): unknown {
  if (surface === 'terminal' && els.Raster) {
    const Raster = els.Raster
    return <Raster key={key} columns={g.w} rows={g.h} cells={rasterCells(g)} />
  }
  if (els.Svg) {
    const Svg = els.Svg
    return <Svg source={svgOf(g)} alt={alt} />
  }
  const Text = els.Text
  return <Text>{alt}</Text>
}
