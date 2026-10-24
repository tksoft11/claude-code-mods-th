/**
 * ============================================================================
 * MOD 68: Matrix Rain TH - ฝนตัวอักษรแบบ The Matrix (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ฉากเปิดของหนัง The Matrix (1999)
 *
 * หน้าที่ของ Mod นี้:
 * 1. /matrix - เปิดแผงที่มีตัวอักษรคาตาคานะ/ตัวเลขสีเขียวไหลลงมา หัวสายสว่าง หางค่อยๆ จาง
 * 2. /matrix <ข้อความ> - ข้อความของคุณ "ถอดรหัส" ค่อยๆ ปรากฏกลางจอ
 * 3. /matrix red|blue|green - เปลี่ยนสี (เลือกยาเม็ดไหน?)
 *
 * เทคนิค: ตารางสี (grid.tsx) วาดเป็น Raster บน terminal และเป็น SVG บน VS Code/Desktop/มือถือ
 * timer เดินเฉพาะตอนแผงเปิด ปิดแผงแล้วหยุดเอง
 */

import type { EngineInterface, Register, Timer } from 'claude-code'
import { DEFAULT, Grid, drawGrid, rgb } from './grid'

interface Drop {
  y: number
  speed: number
  length: number
}

const PANE = 'matrix-rain-th'
// คาตาคานะครึ่งความกว้าง (กว้าง 1 ช่องเท่าตัวอักษรอังกฤษ) + ตัวเลข
const GLYPHS = [...'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:.=*+-<>']
const COLORS: Record<string, [number, number, number]> = { green: [0, 255, 70], red: [255, 50, 60], blue: [60, 150, 255] }

let drops: Drop[] = []
let glyphs: string[] = []
let width = 0
let height = 0
let tick = 0
let message = ''
let messageAt = 0
let color: [number, number, number] = COLORS.green ?? [0, 255, 70]
let ticker: Timer | undefined

function glyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '0'
}

// ==========================================================================
// บทที่ 1: สร้าง/ปรับขนาดสนาม - แต่ละคอลัมน์มีหยดฝนหนึ่งสาย
// ==========================================================================
function resize(w: number, h: number): void {
  if (w === width && h === height) return
  width = w
  height = h
  // กระจายหยดทั่วจอตั้งแต่เฟรมแรก จะได้ไม่เห็นจอดำตอนเปิด
  drops = Array.from({ length: w }, () => ({ y: Math.random() * h * 1.3 - h * 0.3, speed: 0.3 + Math.random() * 0.7, length: 4 + Math.floor(Math.random() * (h * 0.7)) }))
  glyphs = Array.from({ length: w * h }, glyph)
}

function step(): void {
  tick++
  for (const d of drops) {
    d.y += d.speed
    if (d.y - d.length > height) {
      d.y = -Math.random() * 6
      d.speed = 0.3 + Math.random() * 0.7
      d.length = 4 + Math.floor(Math.random() * (height * 0.7))
    }
  }
  // ตัวอักษรกระพริบเปลี่ยนเองทีละนิด เหมือนในหนัง
  for (let i = 0; i < Math.max(1, Math.floor(glyphs.length / 25)); i++) glyphs[Math.floor(Math.random() * glyphs.length)] = glyph()
}

// ==========================================================================
// บทที่ 2: วาดหนึ่งเฟรม - หัวสายเกือบขาว หางจางลงตามระยะ
// ==========================================================================
function frame(): Grid {
  const g = new Grid(width, height, rgb(0, 0, 0))
  const [r, gr, b] = color
  drops.forEach((d, x) => {
    for (let k = 0; k < d.length; k++) {
      const y = Math.floor(d.y) - k
      if (y < 0 || y >= height) continue
      const fade = 1 - k / d.length
      const c = k === 0 ? rgb(200 + r * 0.2, 255, 200 + b * 0.2) : rgb(r * fade, gr * fade, b * fade)
      g.set(x, y, glyphs[y * width + x] ?? '0', c)
    }
  })
  // ข้อความถอดรหัส: แต่ละตัวอักษรค่อยๆ "ล็อก" เข้าที่จากซ้ายไปขวา
  if (message) {
    const text = message.slice(0, width - 4)
    const x0 = Math.floor((width - [...text].length) / 2)
    const y0 = Math.floor(height / 2)
    const revealed = Math.floor((tick - messageAt) / 2)
    ;[...text].forEach((c, i) => g.set(x0 + i, y0, i < revealed ? c : glyph(), i < revealed ? rgb(255, 255, 255) : rgb(r, gr, b), rgb(0, 0, 0)))
  }
  return g
}

function stop(): void {
  ticker?.cancel()
  ticker = undefined
}

function start($: EngineInterface): void {
  stop()
  ticker = $.clock.every(90, () => {
    step()
    $.ui.invalidate('ui.render')
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'matrix', description: 'ฝนตัวอักษรแบบ The Matrix ในแผง + ถอดรหัสข้อความ (/matrix [ข้อความ|red|blue|green|stop])', argumentHint: '[ข้อความ]|red|blue|green|stop' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    resize(Math.max(20, Math.min(80, e.props.bodyColumns)), Math.max(10, Math.min(24, (e.props.scroll?.bodyRows ?? 20) - 1)))
    return drawGrid(els, e.surface, frame(), 'rain', 'ฝนตัวอักษรสีเขียวไหลลงมาแบบหนัง The Matrix') as never
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stop()
    return next(e)
  })

  on('command.run', { command: 'matrix' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'stop') {
      stop()
      await $.ui.close({ id: PANE })
      return { text: '💊 กลับสู่โลกจริงแล้ว' }
    }
    if (COLORS[arg]) color = COLORS[arg] ?? color
    else if (arg) {
      message = arg.slice(0, 60)
      messageAt = tick
    }
    await $.ui.open({ id: PANE, title: '🟩 The Matrix' })
    start($)
    return { text: arg === 'red' ? '🔴 ยาเม็ดแดง: ไปดูว่ารูกระต่ายลึกแค่ไหน' : arg === 'blue' ? '🔵 ยาเม็ดน้ำเงิน: ตื่นมาบนเตียงตามเดิม' : message ? `📡 กำลังถอดรหัส: ${message}` : 'Wake up, Neo… 🟩 (/matrix stop เพื่อปิด)' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ใช้ $.ui.blit บน terminal เพื่อวาดเฉพาะ Raster ไม่ต้อง redraw ทั้งแผง (ลื่นขึ้น)
 * 2. ให้ฝนตกเร็วขึ้นตอน Claude กำลังทำงาน และช้าลงตอนว่าง
 * 3. ซ่อนข้อความลับในฝน ให้คนดูหาเจอ
 */
