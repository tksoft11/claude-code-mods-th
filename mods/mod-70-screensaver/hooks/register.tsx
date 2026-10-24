/**
 * ============================================================================
 * MOD 70: Screensaver TH - ภาพพักหน้าจอยุค 90 (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Windows 95 "3D Pipes / Starfield", โลโก้ DVD ที่ลุ้นว่าจะชนมุมไหม
 *
 * 5 ฉาก (คำนวณเองทุกเฟรม ไม่ใช้รูปภาพ):
 *   cube     ลูกบาศก์ 3D หมุน (หมุนจุด 8 มุมด้วยตรีโกณมิติ แล้วฉายลง 2 มิติ)
 *   stars    บินผ่านดวงดาว (ดาวเข้าใกล้ = ขยับเร็วขึ้น สว่างขึ้น)
 *   lava     โคมไฟลาวา (metaballs: รวมสนามของก้อนกลมหลายก้อน แล้วตัดที่ค่าหนึ่ง)
 *   dvd      โลโก้กระดอน ชนขอบแล้วเปลี่ยนสี ชนมุมพอดีมีฉลอง
 *   snow     หิมะตก แล้วกองพูนที่พื้น
 *
 * เปิดเองเมื่อไม่มีใครพิมพ์และ Claude ว่าง (ค่าเริ่มต้น 5 นาที) ปิดเองเมื่อคุณพิมพ์ prompt ใหม่
 */

import type { EngineInterface, Register, Timer } from 'claude-code'
import { Grid, drawGrid, hsl, rgb } from './grid'

type Scene = 'cube' | 'stars' | 'lava' | 'dvd' | 'snow'
const SCENES: Scene[] = ['cube', 'stars', 'lava', 'dvd', 'snow']
const PANE = 'screensaver-th'

let scene: Scene = 'cube'
let width = 60
let height = 20
let t = 0
let ticker: Timer | undefined
let watcher: Timer | undefined
let running = false
let idleMinutes = 5
let lastActivity = 0
let working = false

// สถานะของแต่ละฉาก
let stars: { x: number; y: number; z: number }[] = []
let flakes: { x: number; y: number; v: number }[] = []
let pile: number[] = []
let dvd = { x: 3, y: 2, vx: 1, vy: 0.5, hue: 0, corners: 0 }

// ==========================================================================
// บทที่ 1: ลูกบาศก์ 3D - หมุนรอบแกน X และ Y แล้วฉายแบบ perspective
// ==========================================================================
function drawLine(g: Grid, x0: number, y0: number, x1: number, y1: number, color: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0) * 2, 1)
  for (let i = 0; i <= steps; i++) g.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, '█', color)
}

function cube(g: Grid): void {
  const pts = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as [number, number, number])))
  const a = t * 0.05
  const b = t * 0.032
  const proj = pts.map(([x, y, z]) => {
    const y1 = y * Math.cos(a) - z * Math.sin(a)
    const z1 = y * Math.sin(a) + z * Math.cos(a)
    const x2 = x * Math.cos(b) + z1 * Math.sin(b)
    const z2 = -x * Math.sin(b) + z1 * Math.cos(b)
    const s = 1 / (3.2 - z2)
    // ช่องตัวอักษรสูงกว่ากว้างประมาณ 2 เท่า จึงคูณแกน x มากกว่า
    return [width / 2 + x2 * s * height * 1.25, height / 2 + y1 * s * height * 0.62] as [number, number]
  })
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  edges.forEach(([i, j], k) => {
    const p = proj[i ?? 0] ?? [0, 0]
    const q = proj[j ?? 0] ?? [0, 0]
    drawLine(g, p[0], p[1], q[0], q[1], hsl((t * 3 + k * 30) % 360, 0.8, 0.6))
  })
}

// ==========================================================================
// บทที่ 2: บินผ่านดวงดาว - ดาวแต่ละดวงมีความลึก z ยิ่งใกล้ยิ่งออกจากกลางเร็ว
// ==========================================================================
function starfield(g: Grid): void {
  if (stars.length === 0) stars = Array.from({ length: 120 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }))
  for (const s of stars) {
    s.z -= 0.015
    if (s.z <= 0.02) Object.assign(s, { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: 1 })
    const sx = width / 2 + (s.x / s.z) * (width / 4)
    const sy = height / 2 + (s.y / s.z) * (height / 4)
    const near = 1 - s.z
    g.set(sx, sy, near > 0.8 ? '●' : near > 0.5 ? '•' : '·', rgb(150 + near * 105, 150 + near * 105, 255))
  }
}

// ==========================================================================
// บทที่ 3: โคมไฟลาวา - metaballs (ผลรวม r²/d² ของแต่ละก้อน > 1 = เป็นลาวา)
// ==========================================================================
function lava(g: Grid): void {
  const balls = [0, 1, 2, 3, 4].map(i => ({
    x: width / 2 + Math.sin(t * 0.02 * (1 + i * 0.3) + i) * width * 0.18,
    y: height / 2 + Math.sin(t * 0.017 * (1 + i * 0.2) + i * 2) * height * 0.38,
    r: 2.2 + (i % 3) * 0.7,
  }))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = balls.reduce((s, b) => s + (b.r * b.r) / (((x - b.x) / 2) ** 2 + (y - b.y) ** 2 + 0.01), 0)
      if (v > 1) g.paint(x, y, hsl(330 - Math.min(60, v * 12), 0.95, 0.45 + Math.min(0.2, v * 0.03)))
      else g.paint(x, y, rgb(25, 5, 40 + y * 2))
    }
  }
}

// ==========================================================================
// บทที่ 4: โลโก้กระดอน - ชนขอบเปลี่ยนสี ชนมุมพร้อมกันสองด้าน = ฉลอง
// ==========================================================================
function bounce(g: Grid): void {
  const logo = [' ▄▄▄ ▄   ▄▄▄ ▄ ▄ ▄▄  ▄▄▄ ', ' █   █   █▄█ █ █ █ █ █▄  ', ' ▀▀▀ ▀▀▀ ▀ ▀ ▀▀▀ ▀▀  ▀▀▀ ']
  const w = logo[0]?.length ?? 24
  dvd.x += dvd.vx
  dvd.y += dvd.vy
  let hitX = false
  let hitY = false
  if (dvd.x <= 0 || dvd.x >= width - w) {
    dvd.vx = -dvd.vx
    dvd.x = Math.max(0, Math.min(width - w, dvd.x))
    hitX = true
  }
  if (dvd.y <= 0 || dvd.y >= height - logo.length) {
    dvd.vy = -dvd.vy
    dvd.y = Math.max(0, Math.min(height - logo.length, dvd.y))
    hitY = true
  }
  if (hitX || hitY) dvd.hue = (dvd.hue + 67) % 360
  if (hitX && hitY) dvd.corners++
  logo.forEach((row, i) => g.text(dvd.x, dvd.y + i, row, hsl(dvd.hue, 0.9, 0.6)))
  // สระ/วรรณยุกต์ไทยลง Raster ทีละช่องไม่ได้ (เป็นอักขระซ้อน) จึงใช้ภาษาอังกฤษในภาพ
  if (dvd.corners) g.text(1, height - 1, `CORNER HIT x${dvd.corners}!`, rgb(255, 255, 255))
}

// ==========================================================================
// บทที่ 5: หิมะ - ตกส่ายไปมา ตกถึงกองแล้วพูนขึ้น กองสูงเกินครึ่งจอก็ละลาย
// ==========================================================================
function snow(g: Grid): void {
  if (pile.length !== width) pile = new Array<number>(width).fill(0)
  if (flakes.length < width * 0.8) flakes.push({ x: Math.random() * width, y: 0, v: 0.2 + Math.random() * 0.3 })
  flakes = flakes.filter(f => {
    f.y += f.v
    f.x += Math.sin((t + f.v * 100) / 10) * 0.2
    const col = Math.max(0, Math.min(width - 1, Math.round(f.x)))
    if (f.y >= height - 1 - (pile[col] ?? 0)) {
      pile[col] = (pile[col] ?? 0) + 0.25
      return false
    }
    return true
  })
  if (Math.max(...pile) > height / 2) pile = pile.map(p => p * 0.5)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g.paint(x, y, rgb(10, 20 + y * 2, 45 + y * 3))
  pile.forEach((p, x) => {
    for (let k = 0; k < Math.floor(p); k++) g.set(x, height - 1 - k, '█', rgb(235, 240, 255))
  })
  for (const f of flakes) g.set(f.x, f.y, f.v > 0.4 ? '*' : '·', rgb(255, 255, 255))
}

function frame(): Grid {
  const g = new Grid(width, height, rgb(0, 0, 0))
  if (scene === 'cube') cube(g)
  else if (scene === 'stars') starfield(g)
  else if (scene === 'lava') lava(g)
  else if (scene === 'dvd') bounce(g)
  else snow(g)
  return g
}

async function start($: EngineInterface, s: Scene): Promise<void> {
  scene = s
  running = true
  await $.ui.open({ id: PANE, title: `💤 ${s}` })
  ticker?.cancel()
  ticker = $.clock.every(100, () => {
    t++
    $.ui.invalidate('ui.render')
  })
}

async function stop($: EngineInterface, close: boolean): Promise<void> {
  running = false
  ticker?.cancel()
  ticker = undefined
  if (close) await $.ui.close({ id: PANE }).catch(() => undefined)
}

function watch($: EngineInterface): void {
  watcher?.cancel()
  watcher = idleMinutes > 0 ? $.clock.every(15_000, () => {
    void $.clock.now().then(now => {
      if (!running && !working && now - lastActivity >= idleMinutes * 60_000) void start($, SCENES[Math.floor(Math.random() * SCENES.length)] ?? 'cube')
    })
  }) : undefined
}

const HELP = `💤 Screensaver TH (Mod 70)
========================================
/screensaver [ฉาก]       เปิดเลย: ${SCENES.join(' | ')} (ไม่ระบุ = สุ่ม)
/screensaver idle <นาที>  เปิดเองเมื่อว่างกี่นาที (0 = ไม่เปิดเอง, ตอนนี้: IDLE)
/screensaver stop         ปิด`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    idleMinutes = ((await $.store.get('idle')) as number | undefined) ?? 5
    lastActivity = await $.clock.now()
    watch($)
    await $.command.register({ name: 'screensaver', description: 'ภาพพักหน้าจอยุค 90: cube stars lava dvd snow เปิดเองเมื่อว่าง (/screensaver help)', argumentHint: `[${SCENES.join('|')}]|idle <นาที>|stop` })
    return next(e)
  })

  // กิจกรรมใดๆ = รีเซ็ตเวลาว่าง และพิมพ์ prompt ใหม่ = ปิดภาพพักหน้าจอ
  on('prompt.submit', async ($, e, next) => {
    lastActivity = await $.clock.now()
    if (running && e.origin.kind === 'composer') await stop($, true)
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) working = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      working = false
      lastActivity = await $.clock.now()
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const w = Math.max(30, Math.min(80, e.props.bodyColumns))
    const h = Math.max(10, Math.min(24, (e.props.scroll?.bodyRows ?? 20) - 1))
    if (w !== width || h !== height) {
      width = w
      height = h
      stars = []
      flakes = []
      pile = []
    }
    return drawGrid($.ui.resolve(e), e.surface, frame(), 'saver', `ภาพพักหน้าจอ ฉาก ${scene}`) as never
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await stop($, false)
    return next(e)
  })

  on('command.run', { command: 'screensaver' }, async ($, e) => {
    const [sub = '', value = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'stop') {
      await stop($, true)
      return { text: '☀️ ปิดภาพพักหน้าจอแล้ว' }
    }
    if (sub === 'idle') {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 120) return { text: 'วิธีใช้: /screensaver idle 5  (0 = ไม่เปิดเอง)' }
      idleMinutes = n
      await $.store.set('idle', n)
      watch($)
      return { text: n ? `⏰ จะเปิดเองเมื่อว่าง ${n} นาที` : 'ไม่เปิดเองแล้ว' }
    }
    if (sub === 'help') return { text: HELP.replace('IDLE', String(idleMinutes)) }
    const s = (SCENES as string[]).includes(sub) ? (sub as Scene) : SCENES[Math.floor(Math.random() * SCENES.length)] ?? 'cube'
    await start($, s)
    return { text: `💤 ${s} (/screensaver stop หรือพิมพ์ prompt ใหม่เพื่อปิด)` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ฉาก "3D Pipes" ท่อสีวิ่งต่อกันแบบ Windows 95
 * 2. สลับฉากเองทุก 1 นาที
 * 3. ฉากนาฬิกาตัวใหญ่ แสดงเวลาและงานล่าสุดของ Claude
 */
