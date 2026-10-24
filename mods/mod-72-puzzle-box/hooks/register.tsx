/**
 * ============================================================================
 * MOD 72: Puzzle Box TH - 2048 และ Minesweeper ในแผง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: 2048 (Gabriele Cirulli, 2014) และ Minesweeper ของ Windows
 *
 * เกม:
 *   2048         w a s d เลื่อนทั้งกระดาน ตัวเลขเท่ากันชนกันรวมเป็นสองเท่า ไปให้ถึง 2048
 *   mines        w a s d เลื่อนเคอร์เซอร์ · j เปิดช่อง · k ปักธง (ตาแรกไม่มีวันเจอระเบิด)
 *   r เริ่มใหม่ · คลิกแผงก่อนให้แผงได้โฟกัส
 *
 * เทคนิค: 2048 ใช้วิธี "หมุนกระดาน" ให้ทุกทิศเหลือแค่การเลื่อนไปทางซ้ายแบบเดียว
 * Minesweeper เปิดช่องว่างต่อกันด้วย flood fill (ใช้คิว ไม่ใช้ recursion)
 */

import type { EngineInterface, Register } from 'claude-code'
import { Grid, drawGrid, rgb } from './grid'

type Kind = '2048' | 'mines'
const PANE = 'puzzle-box-th'

// ==========================================================================
// บทที่ 1: 2048
// ==========================================================================
let board: number[][] = []
let score2048 = 0
let won2048 = false

function addTile(): void {
  const empty: [number, number][] = []
  board.forEach((row, y) => row.forEach((v, x) => v === 0 && empty.push([x, y])))
  const pick = empty[Math.floor(Math.random() * empty.length)]
  if (pick) board[pick[1]]![pick[0]] = Math.random() < 0.9 ? 2 : 4
}

function new2048(): void {
  board = Array.from({ length: 4 }, () => [0, 0, 0, 0])
  score2048 = 0
  won2048 = false
  addTile()
  addTile()
}

function slideLeft(row: number[]): { row: number[]; gained: number } {
  const nums = row.filter(v => v)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      const v = (nums[i] ?? 0) * 2
      out.push(v)
      gained += v
      i++
    } else out.push(nums[i] ?? 0)
  }
  while (out.length < 4) out.push(0)
  return { row: out, gained }
}

// หมุนกระดานตามเข็ม: ใช้ซ้ำเพื่อให้ทุกทิศกลายเป็น "ซ้าย"
function rotate(b: number[][]): number[][] {
  return b[0]!.map((_, x) => b.map(row => row[x] ?? 0).reverse())
}

function move2048(dir: string): boolean {
  const turns = { a: 0, s: 1, d: 2, w: 3 }[dir]
  if (turns === undefined) return false
  let b = board
  for (let i = 0; i < turns; i++) b = rotate(b)
  let gained = 0
  b = b.map(r => {
    const s = slideLeft(r)
    gained += s.gained
    return s.row
  })
  for (let i = 0; i < (4 - turns) % 4; i++) b = rotate(b)
  const changed = JSON.stringify(b) !== JSON.stringify(board)
  if (changed) {
    board = b
    score2048 += gained
    if (b.some(r => r.includes(2048))) won2048 = true
    addTile()
  }
  return changed
}

function stuck2048(): boolean {
  if (board.some(r => r.includes(0))) return false
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (board[y]?.[x] === board[y]?.[x + 1] || board[y]?.[x] === board[y + 1]?.[x]) return false
  return true
}

const TILE: Record<number, [number, number]> = {
  2: [rgb(238, 228, 218), rgb(119, 110, 101)], 4: [rgb(237, 224, 200), rgb(119, 110, 101)], 8: [rgb(242, 177, 121), rgb(255, 255, 255)], 16: [rgb(245, 149, 99), rgb(255, 255, 255)],
  32: [rgb(246, 124, 95), rgb(255, 255, 255)], 64: [rgb(246, 94, 59), rgb(255, 255, 255)], 128: [rgb(237, 207, 114), rgb(255, 255, 255)], 256: [rgb(237, 204, 97), rgb(255, 255, 255)],
  512: [rgb(237, 200, 80), rgb(255, 255, 255)], 1024: [rgb(237, 197, 63), rgb(255, 255, 255)], 2048: [rgb(237, 194, 46), rgb(255, 255, 255)],
}

function draw2048(): Grid {
  const g = new Grid(37, 18, rgb(187, 173, 160))
  board.forEach((row, ty) =>
    row.forEach((v, tx) => {
      const [bg, fg] = TILE[v] ?? (v ? [rgb(60, 58, 50), rgb(255, 255, 255)] : [rgb(205, 193, 180), rgb(205, 193, 180)])
      const x0 = 1 + tx * 9
      const y0 = 1 + ty * 4 // แผ่นสูง 3 แถว เว้น 1 แถวให้เห็นขอบ
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 8; dx++) g.paint(x0 + dx, y0 + dy, bg)
      if (v) g.text(x0 + Math.floor((8 - String(v).length) / 2), y0 + 1, String(v), fg, bg)
    }),
  )
  g.text(1, 17, `score ${score2048}${won2048 ? '  2048!' : ''}${stuck2048() ? '  GAME OVER' : ''}`, rgb(255, 255, 255), rgb(187, 173, 160))
  return g
}

// ==========================================================================
// บทที่ 2: Minesweeper
// ==========================================================================
const MW = 12
const MH = 9
const MINES = 14
let mines: boolean[][] = []
let open: boolean[][] = []
let flags: boolean[][] = []
let cursor = { x: 0, y: 0 }
let placed = false
let boom = false

function newMines(): void {
  mines = Array.from({ length: MH }, () => new Array<boolean>(MW).fill(false))
  open = Array.from({ length: MH }, () => new Array<boolean>(MW).fill(false))
  flags = Array.from({ length: MH }, () => new Array<boolean>(MW).fill(false))
  cursor = { x: Math.floor(MW / 2), y: Math.floor(MH / 2) }
  placed = false
  boom = false
}

function around(x: number, y: number): [number, number][] {
  const out: [number, number][] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < MW && y + dy >= 0 && y + dy < MH) out.push([x + dx, y + dy])
  return out
}

function count(x: number, y: number): number {
  return around(x, y).filter(([ax, ay]) => mines[ay]?.[ax]).length
}

// วางระเบิดหลังตาแรก โดยเว้นช่องที่กดและรอบๆ = ตาแรกปลอดภัยเสมอ
function place(sx: number, sy: number): void {
  let n = 0
  while (n < MINES) {
    const x = Math.floor(Math.random() * MW)
    const y = Math.floor(Math.random() * MH)
    if (mines[y]![x] || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue
    mines[y]![x] = true
    n++
  }
  placed = true
}

function reveal(x: number, y: number): void {
  if (!placed) place(x, y)
  if (flags[y]?.[x] || open[y]?.[x]) return
  if (mines[y]?.[x]) {
    boom = true
    return
  }
  // flood fill ด้วยคิว: ช่องที่ไม่มีระเบิดรอบข้างเลย เปิดเพื่อนบ้านต่อ
  const queue: [number, number][] = [[x, y]]
  while (queue.length) {
    const [cx, cy] = queue.shift() ?? [0, 0]
    if (open[cy]?.[cx]) continue
    open[cy]![cx] = true
    if (count(cx, cy) === 0) for (const [nx, ny] of around(cx, cy)) if (!open[ny]?.[nx] && !mines[ny]?.[nx]) queue.push([nx, ny])
  }
}

function minesWon(): boolean {
  return placed && !boom && open.every((row, y) => row.every((o, x) => o || mines[y]?.[x]))
}

const NUM_COLORS = [rgb(0, 0, 0), rgb(66, 135, 245), rgb(56, 160, 70), rgb(230, 60, 60), rgb(110, 60, 200), rgb(160, 40, 40), rgb(40, 160, 160), rgb(40, 40, 40), rgb(120, 120, 120)]

function drawMines(): Grid {
  const g = new Grid(MW * 3 + 2, MH + 2, rgb(30, 34, 44))
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const isCursor = cursor.x === x && cursor.y === y
      const gx = 1 + x * 3
      let ch = ' '
      let fg = rgb(255, 255, 255)
      let bg = rgb(110, 120, 140)
      if (open[y]?.[x]) {
        bg = rgb(220, 224, 232)
        const n = count(x, y)
        ch = n ? String(n) : ' '
        fg = NUM_COLORS[n] ?? fg
      } else if ((boom || minesWon()) && mines[y]?.[x]) {
        ch = '*'
        bg = boom ? rgb(220, 50, 50) : rgb(60, 180, 90)
      } else if (flags[y]?.[x]) {
        ch = 'F'
        fg = rgb(255, 80, 80)
      }
      if (isCursor) bg = rgb(255, 210, 60)
      g.text(gx, y + 1, ` ${ch} `, fg, bg)
    }
  }
  const flagsLeft = MINES - flags.flat().filter(Boolean).length
  g.text(1, 0, `mines ${flagsLeft}  ${boom ? 'BOOM! r=again' : minesWon() ? 'CLEARED!' : 'j=open k=flag'}`, rgb(255, 255, 255))
  return g
}

// ==========================================================================
// บทที่ 3: ปุ่ม + คำสั่ง
// ==========================================================================
let kind: Kind | undefined
let best = { score2048: 0, minesWins: 0 }

function control(key: string): 'won' | 'lost' | undefined {
  if (kind === '2048') {
    if (stuck2048()) return undefined
    const wasWon = won2048
    move2048(key)
    if (!wasWon && won2048) return 'won'
    return stuck2048() ? 'lost' : undefined
  }
  if (kind === 'mines') {
    if (boom || minesWon()) return undefined
    const d = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[key]
    if (d) cursor = { x: Math.max(0, Math.min(MW - 1, cursor.x + (d[0] ?? 0))), y: Math.max(0, Math.min(MH - 1, cursor.y + (d[1] ?? 0))) }
    if (key === 'k' && !open[cursor.y]?.[cursor.x]) flags[cursor.y]![cursor.x] = !flags[cursor.y]?.[cursor.x]
    if (key === 'j') reveal(cursor.x, cursor.y)
    return boom ? 'lost' : minesWon() ? 'won' : undefined
  }
  return undefined
}

async function onResult($: EngineInterface, result: 'won' | 'lost' | undefined): Promise<void> {
  if (kind === '2048' && score2048 > best.score2048) best = { ...best, score2048 }
  if (kind === 'mines' && result === 'won') best = { ...best, minesWins: best.minesWins + 1 }
  if (result) {
    await $.store.set('best', best)
    $.ui.toast(result === 'won' ? (kind === '2048' ? '🎉 ถึง 2048 แล้ว! เล่นต่อได้' : '🎉 กู้ระเบิดสำเร็จ!') : kind === '2048' ? `🧱 เดินต่อไม่ได้แล้ว ได้ ${score2048} แต้ม` : '💥 ตูม!')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    best = { ...best, ...((await $.store.get('best')) as Partial<typeof best> | undefined) }
    await $.command.register({ name: 'puzzle', description: 'เกมฝึกสมอง 2048 และ Minesweeper ในแผง (/puzzle 2048 | mines | scores)', argumentHint: '2048|mines|scores' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    if (!kind) return <Text dimColor>/puzzle 2048 | mines</Text>
    const press = (key: string) => async () => {
      await onResult($, control(key))
      $.ui.invalidate('ui.render')
    }
    const keys = kind === '2048' ? ['w', 'a', 's', 'd'] : ['w', 'a', 's', 'd', 'j', 'k']
    const labels: Record<string, string> = { w: '↑', a: '←', s: '↓', d: '→', j: 'เปิด', k: 'ธง' }
    return (
      <Box flexDirection="column">
        {drawGrid(els, e.surface, kind === '2048' ? draw2048() : drawMines(), 'board', kind === '2048' ? `2048 คะแนน ${score2048}` : 'กระดาน Minesweeper') as never}
        <Box flexDirection="row" gap={1}>
          {keys.map(k => (
            <Button key={k} hotkey={k} label={labels[k] ?? k} onPress={press(k)} />
          ))}
          <Button
            key="r"
            hotkey="r"
            label="ใหม่"
            onPress={() => {
              if (kind === '2048') new2048()
              else newMines()
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'puzzle' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'scores') return { text: `🏆 2048 สูงสุด ${best.score2048} แต้ม · กู้ระเบิดสำเร็จ ${best.minesWins} ครั้ง` }
    if (sub !== '2048' && sub !== 'mines') return { text: '🧩 Puzzle Box (Mod 72)\n/puzzle 2048    w a s d เลื่อน\n/puzzle mines   w a s d เลื่อน · j เปิด · k ปักธง\n/puzzle scores  สถิติ\nr เริ่มใหม่ (คลิกแผงก่อนให้แผงได้โฟกัส)' }
    kind = sub
    if (sub === '2048') new2048()
    else newMines()
    await $.ui.open({ id: PANE, title: sub === '2048' ? '🧩 2048' : '💣 Minesweeper', focus: true, closeOnEscape: true })
    $.ui.invalidate('ui.render')
    return { text: sub === '2048' ? '🧩 2048 เริ่มแล้ว w a s d' : '💣 กู้ระเบิดเริ่มแล้ว (ตาแรกปลอดภัย)' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ปุ่ม u ย้อนกลับหนึ่งตาใน 2048
 * 2. ระดับความยากของ Minesweeper (ง่าย 10 / ยาก 30 ลูก)
 * 3. จับเวลาเกมกู้ระเบิด แล้วเก็บเวลาดีที่สุด
 */
