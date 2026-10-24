/**
 * ============================================================================
 * MOD 71: Retro Arcade TH - ตู้เกมยุค 80 ในแผง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Pong (1972), Breakout (1976), Flappy Bird (2013)
 *
 * เกม:
 *   pong      ไม้ซ้ายเป็นของคุณ (w ขึ้น / s ลง) ไม้ขวาเป็น AI ใครได้ 5 แต้มก่อนชนะ
 *   breakout  a/d ขยับไม้ w ปล่อยลูก ทุบอิฐสีรุ้งให้หมด มี 3 ชีวิต
 *   flappy    w กระพือปีก บินลอดช่องท่อ ชนแล้วจบ
 *   p หยุด/เล่นต่อ · r เริ่มใหม่ · ปุ่มใช้ได้เมื่อแผงได้โฟกัส (คลิกแผง หรือ ctrl+x tab)
 *
 * เทคนิค: game loop ทุก 70ms คำนวณฟิสิกส์ แล้ววาดด้วย grid.tsx (Raster/SVG)
 * ปุ่มควบคุมใช้ Button ที่มี hotkey (แบบเดียวกับ Mod 13)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'
import { Grid, drawGrid, hsl, rgb } from './grid'

type Kind = 'pong' | 'breakout' | 'flappy'
const W = 48
const H = 18
const PANE = 'retro-arcade-th'

interface State {
  kind: Kind
  over: boolean
  score: number
  ai: number
  lives: number
  // ลูกบอล / นก
  bx: number
  by: number
  vx: number
  vy: number
  // ไม้ของผู้เล่น (pong: แกน y, breakout: แกน x)
  pad: number
  aiPad: number
  launched: boolean
  bricks: boolean[][]
  pipes: { x: number; gap: number; passed: boolean }[]
}

let game: State | undefined
let paused = false
let loop: Timer | undefined
let best: Record<Kind, number> = { pong: 0, breakout: 0, flappy: 0 }

function fresh(kind: Kind): State {
  return {
    kind,
    over: false,
    score: 0,
    ai: 0,
    lives: 3,
    bx: W / 2,
    by: kind === 'breakout' ? H - 3 : H / 2,
    vx: kind === 'pong' ? 1.2 : 0.8,
    vy: kind === 'flappy' ? 0 : -0.5,
    pad: kind === 'breakout' ? W / 2 - 4 : H / 2 - 2,
    aiPad: H / 2 - 2,
    launched: kind === 'pong', // breakout/flappy รอกด w ก่อนเริ่ม
    bricks: Array.from({ length: 5 }, () => new Array<boolean>(Math.floor(W / 4)).fill(true)),
    pipes: [],
  }
}

// ==========================================================================
// บทที่ 1: ฟิสิกส์ของแต่ละเกม (เรียกทุก 70ms)
// ==========================================================================
function pong(g: State): void {
  g.bx += g.vx
  g.by += g.vy
  if (g.by <= 0 || g.by >= H - 1) g.vy = -g.vy
  // AI ตามลูกช้ากว่าลูกนิดหน่อย จะได้ชนะได้
  g.aiPad += Math.sign(g.by - (g.aiPad + 2)) * 0.45
  g.aiPad = Math.max(0, Math.min(H - 4, g.aiPad))
  const hits = (pad: number) => g.by >= pad - 0.5 && g.by <= pad + 4.5
  if (g.bx <= 2 && g.vx < 0) {
    if (hits(g.pad)) {
      g.vx = -g.vx * 1.05
      g.vy += (g.by - (g.pad + 2)) * 0.25
    } else {
      g.ai++
      Object.assign(g, { bx: W / 2, by: H / 2, vx: 1.2, vy: 0.5 })
    }
  }
  if (g.bx >= W - 3 && g.vx > 0) {
    if (hits(g.aiPad)) g.vx = -g.vx
    else {
      g.score++
      Object.assign(g, { bx: W / 2, by: H / 2, vx: -1.2, vy: -0.5 })
    }
  }
  g.vy = Math.max(-1, Math.min(1, g.vy))
  if (g.score >= 5 || g.ai >= 5) g.over = true
}

function breakout(g: State): void {
  if (!g.launched) {
    g.bx = g.pad + 4
    g.by = H - 3
    return
  }
  g.bx += g.vx
  g.by += g.vy
  if (g.bx <= 0 || g.bx >= W - 1) g.vx = -g.vx
  if (g.by <= 0) g.vy = -g.vy
  // ชนอิฐ: อิฐแต่ละก้อนกว้าง 4 ช่อง เริ่มที่แถว 2
  const row = Math.floor(g.by) - 2
  const col = Math.floor(g.bx / 4)
  if (row >= 0 && row < g.bricks.length && g.bricks[row]?.[col]) {
    g.bricks[row]![col] = false
    g.vy = -g.vy
    g.score += (5 - row) * 10
  }
  if (g.by >= H - 2 && g.bx >= g.pad - 0.5 && g.bx <= g.pad + 8.5 && g.vy > 0) {
    g.vy = -Math.abs(g.vy)
    g.vx += (g.bx - (g.pad + 4)) * 0.12
    g.vx = Math.max(-1.3, Math.min(1.3, g.vx))
  }
  if (g.by > H) {
    g.lives--
    g.launched = false
    g.vx = 0.8
    g.vy = -0.5
    if (g.lives <= 0) g.over = true
  }
  if (g.bricks.every(r => r.every(b => !b))) {
    g.bricks = g.bricks.map(r => r.map(() => true))
    g.vy *= 1.15
  }
}

function flappy(g: State): void {
  if (!g.launched) return
  g.vy = Math.min(0.9, g.vy + 0.12)
  g.by += g.vy
  for (const p of g.pipes) {
    p.x -= 0.6
    if (!p.passed && p.x < 8) {
      p.passed = true
      g.score++
    }
  }
  g.pipes = g.pipes.filter(p => p.x > -3)
  const last = g.pipes.at(-1)
  if (!last || last.x < W - 18) g.pipes.push({ x: W, gap: 3 + Math.floor(Math.random() * (H - 9)), passed: false })
  // ชนพื้น/เพดาน/ท่อ (ช่องว่างสูง 5)
  const hitPipe = g.pipes.some(p => Math.abs(p.x + 1 - 10) < 2 && (g.by < p.gap || g.by > p.gap + 5))
  if (g.by < 0 || g.by >= H - 1 || hitPipe) g.over = true
}

// ==========================================================================
// บทที่ 2: วาดสนาม
// ==========================================================================
function frame(g: State): Grid {
  const grid = new Grid(W, H, rgb(8, 10, 20))
  if (g.kind === 'pong') {
    for (let y = 0; y < H; y += 2) grid.set(W / 2, y, '┊', rgb(70, 70, 90))
    for (let k = 0; k < 4; k++) {
      grid.set(1, g.pad + k, '█', rgb(80, 200, 255))
      grid.set(W - 2, g.aiPad + k, '█', rgb(255, 110, 110))
    }
    grid.set(g.bx, g.by, '●', rgb(255, 255, 255))
    grid.text(W / 2 - 6, 0, ` ${g.score}  :  ${g.ai} `, rgb(255, 255, 255))
  } else if (g.kind === 'breakout') {
    g.bricks.forEach((row, r) => row.forEach((alive, c) => alive && grid.text(c * 4, r + 2, '▆▆▆ ', hsl(r * 50, 0.85, 0.55))))
    for (let k = 0; k < 9; k++) grid.set(g.pad + k, H - 1, '▀', rgb(200, 220, 255))
    grid.set(g.bx, g.by, '●', rgb(255, 255, 255))
    grid.text(0, 0, `score ${g.score}   lives ${'♥'.repeat(g.lives)}`, rgb(255, 220, 120))
  } else {
    for (const p of g.pipes) {
      for (let y = 0; y < H; y++) if (y < p.gap || y > p.gap + 5) grid.text(p.x, y, '██', rgb(60, 190, 70))
    }
    grid.set(10, g.by, g.vy < 0 ? '^' : 'v', rgb(255, 220, 0))
    grid.set(9, g.by, '>', rgb(255, 160, 0))
    grid.text(0, 0, `score ${g.score}`, rgb(255, 255, 255))
  }
  if (g.over) grid.text(W / 2 - 9, H / 2, g.kind === 'pong' ? (g.score >= 5 ? '  YOU WIN!  r=again ' : '  GAME OVER r=again ') : '  GAME OVER r=again ', rgb(255, 255, 255), rgb(180, 30, 60))
  else if (!g.launched) grid.text(W / 2 - 8, H / 2 + 2, ' press w to start ', rgb(0, 0, 0), rgb(120, 220, 255))
  else if (paused) grid.text(W / 2 - 4, H / 2, ' PAUSE ', rgb(0, 0, 0), rgb(255, 220, 0))
  return grid
}

async function finish($: EngineInterface, g: State): Promise<void> {
  loop?.cancel()
  loop = undefined
  if (g.score > best[g.kind]) {
    best = { ...best, [g.kind]: g.score }
    await $.store.set('best', best)
    $.ui.toast(`🏆 สถิติใหม่ ${g.kind}: ${g.score}`)
  }
}

function startLoop($: EngineInterface): void {
  loop?.cancel()
  loop = $.clock.every(70, () => {
    const g = game
    if (!g || paused || g.over) return
    if (g.kind === 'pong') pong(g)
    else if (g.kind === 'breakout') breakout(g)
    else flappy(g)
    if (g.over) void finish($, g)
    $.ui.invalidate('ui.render')
  })
}

// ปุ่มควบคุม: ไม่รับ $ จึงอยู่นอก register ได้
function control(key: string): void {
  const g = game
  if (!g || g.over || paused) return
  if (g.kind === 'pong') g.pad = Math.max(0, Math.min(H - 4, g.pad + (key === 'w' ? -2 : key === 's' ? 2 : 0)))
  if (g.kind === 'breakout') {
    if (key === 'a') g.pad = Math.max(0, g.pad - 3)
    if (key === 'd') g.pad = Math.min(W - 9, g.pad + 3)
    if (key === 'w') g.launched = true
  }
  if (g.kind === 'flappy' && key === 'w') {
    g.launched = true
    g.vy = -0.9
  }
}

const HELP = `🕹️ Retro Arcade TH (Mod 71)
========================================
/arcade-play pong       w/s ขยับไม้ แข่งกับ AI ถึง 5 แต้ม
/arcade-play breakout   a/d ขยับไม้ w ปล่อยลูก
/arcade-play flappy     w กระพือปีก
/arcade-play scores     สถิติสูงสุด
/arcade-play close      ปิดเกม
ระหว่างเล่น: p หยุด · r เริ่มใหม่ (คลิกที่แผงก่อนให้แผงได้โฟกัส)`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    best = { ...best, ...((await $.store.get('best')) as Partial<Record<Kind, number>> | undefined) }
    await $.command.register({ name: 'arcade-play', description: 'ตู้เกมยุค 80: pong breakout flappy เล่นในแผงด้วยคีย์บอร์ด (/arcade-play help)', argumentHint: 'pong|breakout|flappy|scores' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const g = game
    if (!g) return <Text dimColor>/arcade-play pong | breakout | flappy</Text>
    const press = (key: string) => () => {
      control(key)
      $.ui.invalidate('ui.render')
    }
    const keys = g.kind === 'pong' ? [['w', '↑'], ['s', '↓']] : g.kind === 'breakout' ? [['a', '←'], ['d', '→'], ['w', 'ปล่อย']] : [['w', 'กระพือ']]
    return (
      <Box flexDirection="column">
        {drawGrid(els, e.surface, frame(g), 'game', `เกม ${g.kind} คะแนน ${g.score}`) as never}
        <Box flexDirection="row" gap={1}>
          {keys.map(([k, label]) => (
            <Button key={k} hotkey={k} label={label} onPress={press(k ?? '')} />
          ))}
          <Button
            key="p"
            hotkey="p"
            label={paused ? 'เล่นต่อ' : 'หยุด'}
            onPress={() => {
              paused = !paused
              $.ui.invalidate('ui.render')
            }}
          />
          <Button
            key="r"
            hotkey="r"
            label="ใหม่"
            onPress={() => {
              game = fresh(g.kind)
              paused = false
              startLoop($)
              $.ui.invalidate('ui.render')
            }}
          />
          <Text dimColor>{` best ${best[g.kind]}`}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      loop?.cancel()
      loop = undefined
    }
    return next(e)
  })

  on('command.run', { command: 'arcade-play' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'scores') return { text: `🏆 สถิติสูงสุด\n  pong ${best.pong} · breakout ${best.breakout} · flappy ${best.flappy}` }
    if (sub === 'close') {
      loop?.cancel()
      loop = undefined
      game = undefined
      await $.ui.close({ id: PANE }).catch(() => undefined)
      return { text: '👋 ปิดเกมแล้ว' }
    }
    if (sub !== 'pong' && sub !== 'breakout' && sub !== 'flappy') return { text: HELP }
    game = fresh(sub)
    paused = false
    const opened = await $.ui.open({ id: PANE, title: `🕹️ ${sub.toUpperCase()}`, focus: true, closeOnEscape: true })
    startLoop($)
    $.ui.invalidate('ui.render')
    return { text: `🕹️ ${sub} เริ่มแล้ว!${opened.isPlaced ? '' : ` (เปิดแผงไม่ได้: ${opened.reason})`}` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. Pong สองคนบนคีย์บอร์ดเดียวกัน (w/s กับ i/k)
 * 2. Breakout มีไอเทมตก: ไม้ยาวขึ้น ลูกแยกสามลูก
 * 3. Flappy ยากขึ้นตามแต้ม (ท่อเร็วขึ้น ช่องแคบลง)
 */
