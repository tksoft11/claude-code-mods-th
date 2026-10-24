/**
 * ============================================================================
 * MOD 69: Aquarium TH - ตู้ปลาในแผงข้างแชต (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: asciiquarium และตู้ปลาหน้าร้านอาหารไทย
 *
 * หน้าที่ของ Mod นี้:
 * 1. /aquarium - เปิดตู้ปลา: ปลาหลายพันธุ์ว่ายไปมา ฟองอากาศลอยขึ้น สาหร่ายโยกตามน้ำ
 * 2. /aquarium feed - โรยอาหาร ปลาจะว่ายเข้าไปกิน (กินแล้วโตขึ้นนิดหน่อย)
 * 3. /aquarium add [จำนวน] - เพิ่มปลา (จำจำนวนไว้ข้าม session)
 * 4. /aquarium night - โหมดกลางคืน น้ำมืด ปลาว่ายช้า
 *
 * เทคนิค: เก็บตำแหน่ง/ความเร็วของปลาไว้ในตัวแปร ขยับทุก 150ms แล้ววาดใหม่ (grid.tsx)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'
import { Grid, drawGrid, rgb } from './grid'

interface Fish {
  x: number
  y: number
  vx: number
  phase: number
  kind: number
  color: number
  fed: number
}
interface Bubble {
  x: number
  y: number
}
interface Food {
  x: number
  y: number
}

const PANE = 'aquarium-th'
// แต่ละพันธุ์: หันขวา / หันซ้าย
const KINDS: [string, string][] = [
  ['><>', '<><'],
  ['><(((º>', '<º)))><'],
  ['>=>', '<=<'],
  ['><((°>', '<°))><'],
  ['>-))°>', '<°((-<'],
]
const FISH_COLORS = [rgb(255, 140, 0), rgb(255, 215, 0), rgb(255, 99, 132), rgb(120, 220, 255), rgb(170, 255, 120), rgb(220, 160, 255)]

let fish: Fish[] = []
let bubbles: Bubble[] = []
let food: Food[] = []
let width = 0
let height = 0
let tick = 0
let night = false
let count = 6
let ticker: Timer | undefined

function spawn(n: number): void {
  for (let i = 0; i < n; i++) {
    const right = Math.random() < 0.5
    fish.push({ x: Math.random() * Math.max(10, width - 8), y: 1 + Math.random() * Math.max(2, height - 5), vx: (right ? 1 : -1) * (0.2 + Math.random() * 0.4), phase: Math.random() * 6, kind: Math.floor(Math.random() * KINDS.length), color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)] ?? rgb(255, 140, 0), fed: 0 })
  }
}

// ==========================================================================
// บทที่ 1: ขยับทุกอย่างหนึ่งจังหวะ
// ==========================================================================
function step(): void {
  tick++
  const speed = night ? 0.4 : 1
  for (const f of fish) {
    // มีอาหาร: ว่ายเข้าหาเม็ดที่ใกล้ที่สุด
    const target = food.length ? food.reduce((best, p) => (Math.abs(p.x - f.x) + Math.abs(p.y - f.y) < Math.abs(best.x - f.x) + Math.abs(best.y - f.y) ? p : best)) : undefined
    if (target) {
      f.vx = Math.sign(target.x - f.x || 1) * Math.max(0.3, Math.abs(f.vx))
      f.y += Math.sign(target.y - f.y) * 0.25
    } else {
      f.y += Math.sin((tick + f.phase * 10) / 12) * 0.08
    }
    f.x += f.vx * speed
    const len = (KINDS[f.kind]?.[0] ?? '><>').length
    if (f.x < 0 || f.x > width - len) {
      f.vx = -f.vx
      f.x = Math.max(0, Math.min(width - len, f.x))
    }
    f.y = Math.max(0.5, Math.min(height - 3, f.y))
    if (Math.random() < 0.01) bubbles.push({ x: f.x + (f.vx > 0 ? len : 0), y: f.y })
  }
  // อาหาร: จมลงช้าๆ ถ้าปลาอยู่ใกล้ = โดนกิน
  food = food.filter(p => {
    p.y += 0.15
    const eater = fish.find(f => Math.abs(f.x + 1 - p.x) < 2 && Math.abs(f.y - p.y) < 1)
    if (eater) eater.fed++
    return !eater && p.y < height - 2
  })
  bubbles = bubbles.filter(b => {
    b.y -= 0.35
    b.x += Math.sin(b.y) * 0.1
    return b.y > 0
  })
  if (Math.random() < 0.08) bubbles.push({ x: 2 + Math.random() * (width - 4), y: height - 2 })
}

// ==========================================================================
// บทที่ 2: วาดตู้ - น้ำไล่สีตามความลึก ทรายด้านล่าง สาหร่ายโยก
// ==========================================================================
function frame(): Grid {
  const g = new Grid(width, height)
  for (let y = 0; y < height; y++) {
    const depth = y / height
    const water = night ? rgb(5, 15 + depth * 10, 40 - depth * 15) : rgb(10, 90 - depth * 50, 160 - depth * 70)
    for (let x = 0; x < width; x++) g.paint(x, y, water)
  }
  for (let x = 0; x < width; x++) g.set(x, height - 1, x % 3 === 0 ? '▓' : '▒', rgb(194, 160, 100), rgb(150, 120, 70))
  // สาหร่าย 4 ต้น โยกซ้ายขวา
  for (const sx of [3, Math.floor(width * 0.3), Math.floor(width * 0.62), width - 5]) {
    const hgt = 3 + (sx % 4)
    for (let k = 0; k < hgt; k++) g.set(sx + (Math.floor((tick + k * 3) / 8) % 2), height - 2 - k, (tick + k) % 16 < 8 ? '(' : ')', night ? rgb(30, 90, 40) : rgb(40, 200, 90))
  }
  for (const b of bubbles) g.set(b.x, b.y, b.y < height / 3 ? '°' : b.y < height * 0.7 ? 'o' : 'O', rgb(200, 235, 255))
  for (const p of food) g.set(p.x, p.y, '·', rgb(255, 230, 150))
  for (const f of fish) {
    const shape = (KINDS[f.kind] ?? ['><>', '<><'])[f.vx > 0 ? 0 : 1]
    g.text(f.x, f.y, shape, night ? rgb(120, 120, 150) : f.color)
  }
  g.text(1, 0, `fish ${fish.length}`, rgb(200, 235, 255))
  return g
}

function stop(): void {
  ticker?.cancel()
  ticker = undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    count = ((await $.store.get('count')) as number | undefined) ?? 6
    await $.command.register({ name: 'aquarium', description: 'ตู้ปลาในแผง: ปลาว่าย ฟองลอย ให้อาหาร เพิ่มปลา (/aquarium [feed|add|night|day|stop])', argumentHint: 'feed|add [n]|night|day|stop' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const w = Math.max(24, Math.min(80, e.props.bodyColumns))
    const h = Math.max(10, Math.min(22, (e.props.scroll?.bodyRows ?? 18) - 1))
    if (w !== width || h !== height) {
      width = w
      height = h
      fish = []
      spawn(count)
    }
    return drawGrid($.ui.resolve(e), e.surface, frame(), 'tank', `ตู้ปลา มีปลา ${fish.length} ตัว`) as never
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stop()
    return next(e)
  })

  on('command.run', { command: 'aquarium' }, async ($, e) => {
    const [sub = '', value = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    const open = async () => {
      await $.ui.open({ id: PANE, title: night ? '🌙 Aquarium' : '🐠 Aquarium' })
      if (!ticker) ticker = $.clock.every(150, () => {
        step()
        $.ui.invalidate('ui.render')
      })
    }
    switch (sub) {
      case 'stop':
        stop()
        await $.ui.close({ id: PANE })
        return { text: '🫧 ปิดตู้ปลาแล้ว' }
      case 'feed':
        for (let i = 0; i < 8; i++) food.push({ x: 2 + Math.random() * Math.max(4, width - 4), y: 0 })
        await open()
        return { text: '🍤 โรยอาหารแล้ว ปลากำลังว่ายมา' }
      case 'add': {
        const n = Math.max(1, Math.min(20, Number(value) || 1))
        count = Math.min(40, count + n)
        spawn(n)
        await $.store.set('count', count)
        await open()
        return { text: `🐠 เพิ่มปลา ${n} ตัว (ทั้งหมด ${count})` }
      }
      case 'night':
      case 'day':
        night = sub === 'night'
        await open()
        return { text: night ? '🌙 ปิดไฟตู้ ปลาว่ายช้าลง' : '☀️ เปิดไฟตู้แล้ว' }
      default:
        await open()
        return { text: `🐠 เปิดตู้ปลาแล้ว (ปลา ${count} ตัว)\n/aquarium feed · add [n] · night · day · stop` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ปลาตัวใหม่เกิดทุกครั้งที่ Claude ทำงานเสร็จ (ดัก turn.complete)
 * 2. ปลาที่กินอิ่มบ่อยจะตัวใหญ่ขึ้น (เปลี่ยนพันธุ์)
 * 3. ฉลามโผล่มาเมื่อเทสต์พัง 🦈
 */
