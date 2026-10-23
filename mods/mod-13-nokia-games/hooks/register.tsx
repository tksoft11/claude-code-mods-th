/**
 * ============================================================================
 * MOD 13: Nokia Games TH - เกมงูและ Tetris จอเขียวแบบ Nokia 3310 (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เกม Snake บนมือถือ Nokia 3310 และ Tetris
 *
 * หน้าที่ของ Mod นี้:
 * 1. /game snake เล่นเกมงู, /game tetris เล่น Tetris ในแผงข้าง Claude Code
 * 2. จอสีเขียวแบบ Nokia (#9bbc0f) ตัวหนังสือเขียวเข้ม (#0f380f)
 * 3. เกมขยับเองด้วย timer และควบคุมด้วยปุ่ม w a s d บนคีย์บอร์ด
 * 4. เก็บ High Score ข้าม session ด้วย $.store
 *
 * แนวคิดสำคัญ (สอนทำเกม):
 * - Game state = ข้อมูลล้วนๆ (ตำแหน่งงู, กระดาน) ไม่ผูกกับการวาด
 * - Game loop = $.clock.every เรียก tick() ทุกช่วงเวลา แล้วสั่งวาดใหม่
 * - Input = ปุ่ม (Button) ที่มี hotkey -> กดตัวอักษรบนคีย์บอร์ดได้เลยเมื่อแผงถูกโฟกัส
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const PANE = 'nokia-games-th'
const NOKIA_SCREEN = '#9bbc0f' // สีพื้นจอ Nokia 3310
const NOKIA_INK = '#0f380f' // สีตัวหนังสือ/พิกเซล

type Point = { x: number; y: number }
type Direction = 'up' | 'down' | 'left' | 'right'

// ==========================================================================
// บทที่ 1: Game state ของเกมงู
// ==========================================================================
interface SnakeGame {
  kind: 'snake'
  width: number
  height: number
  snake: Point[] // ตัวแรก = หัว
  direction: Direction
  nextDirection: Direction // ทิศที่กดไว้ ใช้ตอน tick ถัดไป (กันกดสองทีแล้วหันกลับชนตัวเอง)
  food: Point
  score: number
  isOver: boolean
}

function randomCell(width: number, height: number, avoid: Point[]): Point {
  // สุ่มจนกว่าจะได้ช่องที่ไม่ทับตัวงู
  for (;;) {
    const p = { x: Math.floor(Math.random() * width), y: Math.floor(Math.random() * height) }
    if (!avoid.some(a => a.x === p.x && a.y === p.y)) return p
  }
}

function createSnake(width = 20, height = 12): SnakeGame {
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }]
  return { kind: 'snake', width, height, snake, direction: 'right', nextDirection: 'right', food: randomCell(width, height, snake), score: 0, isOver: false }
}

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

// ==========================================================================
// บทที่ 2: ขยับงูหนึ่งก้าว (เรียกทุก tick)
// ==========================================================================
function tickSnake(g: SnakeGame): void {
  // ห้ามหันกลับ 180 องศา
  if (g.nextDirection !== OPPOSITE[g.direction]) g.direction = g.nextDirection

  const head = g.snake[0] ?? { x: 0, y: 0 }
  const next = { ...head }
  if (g.direction === 'up') next.y -= 1
  if (g.direction === 'down') next.y += 1
  if (g.direction === 'left') next.x -= 1
  if (g.direction === 'right') next.x += 1

  // ชนขอบ หรือชนตัวเอง (ไม่นับหางที่กำลังจะขยับออก) = จบเกม
  const body = g.snake.slice(0, -1)
  const hitWall = next.x < 0 || next.x >= g.width || next.y < 0 || next.y >= g.height
  if (hitWall || body.some(s => s.x === next.x && s.y === next.y)) {
    g.isOver = true
    return
  }

  g.snake.unshift(next)
  if (next.x === g.food.x && next.y === g.food.y) {
    g.score += 10 // กินอาหาร: ไม่ตัดหาง งูจึงยาวขึ้น
    g.food = randomCell(g.width, g.height, g.snake)
  } else {
    g.snake.pop()
  }
}

// วาดเป็นบรรทัดข้อความ ช่องละ 2 ตัวอักษรให้ดูเป็นสี่เหลี่ยมจัตุรัส
function drawSnake(g: SnakeGame): string[] {
  const rows: string[] = []
  for (let y = 0; y < g.height; y++) {
    let row = ''
    for (let x = 0; x < g.width; x++) {
      const at = g.snake.findIndex(s => s.x === x && s.y === y)
      row += at === 0 ? '██' : at > 0 ? '▓▓' : g.food.x === x && g.food.y === y ? '<>' : '  '
    }
    rows.push(row)
  }
  return rows
}

// ==========================================================================
// บทที่ 3: Game state ของ Tetris
// ==========================================================================
const SHAPES: number[][][] = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[1, 1, 1], [0, 1, 0]], // T
  [[1, 1, 0], [0, 1, 1]], // S
  [[0, 1, 1], [1, 1, 0]], // Z
  [[1, 1, 1], [1, 0, 0]], // J
  [[1, 1, 1], [0, 0, 1]], // L
]

interface Piece {
  shape: number[][]
  x: number
  y: number
}

interface TetrisGame {
  kind: 'tetris'
  width: number
  height: number
  board: number[][] // 1 = มีบล็อก
  piece: Piece
  score: number
  lines: number
  isOver: boolean
}

function randomPiece(width: number): Piece {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)] ?? [[1]]
  return { shape, x: Math.floor((width - (shape[0]?.length ?? 1)) / 2), y: 0 }
}

function createTetris(): TetrisGame {
  const width = 10
  const height = 16
  return { kind: 'tetris', width, height, board: Array.from({ length: height }, () => Array<number>(width).fill(0)), piece: randomPiece(width), score: 0, lines: 0, isOver: false }
}

// ชิ้นนี้วางที่ตำแหน่งนี้ได้ไหม (ไม่ทะลุขอบ ไม่ทับบล็อกเดิม)
function fits(g: TetrisGame, p: Piece): boolean {
  return p.shape.every((row, dy) =>
    row.every((cell, dx) => {
      if (!cell) return true
      const x = p.x + dx
      const y = p.y + dy
      return x >= 0 && x < g.width && y < g.height && (y < 0 || !g.board[y]?.[x])
    }),
  )
}

// หมุน 90 องศาตามเข็มนาฬิกา: แถวกลายเป็นคอลัมน์
function rotate(shape: number[][]): number[][] {
  const first = shape[0] ?? []
  return first.map((_, x) => shape.map(row => row[x] ?? 0).reverse())
}

// ==========================================================================
// บทที่ 4: Tetris - ตกหนึ่งช่อง ถ้าตกไม่ได้ให้วางลงกระดานแล้วลบแถวที่เต็ม
// ==========================================================================
function tickTetris(g: TetrisGame): void {
  const down = { ...g.piece, y: g.piece.y + 1 }
  if (fits(g, down)) {
    g.piece = down
    return
  }

  // วางชิ้นลงกระดาน
  g.piece.shape.forEach((row, dy) =>
    row.forEach((cell, dx) => {
      const boardRow = g.board[g.piece.y + dy]
      if (cell && boardRow) boardRow[g.piece.x + dx] = 1
    }),
  )

  // ลบแถวที่เต็ม แล้วเติมแถวว่างด้านบน
  const kept = g.board.filter(row => row.some(cell => !cell))
  const cleared = g.height - kept.length
  g.board = [...Array.from({ length: cleared }, () => Array<number>(g.width).fill(0)), ...kept]
  g.lines += cleared
  g.score += [0, 40, 100, 300, 1200][cleared] ?? 0

  // ชิ้นใหม่วางไม่ได้ตั้งแต่บนสุด = จบเกม
  g.piece = randomPiece(g.width)
  if (!fits(g, g.piece)) g.isOver = true
}

function moveTetris(g: TetrisGame, action: 'left' | 'right' | 'rotate' | 'down' | 'drop'): void {
  if (action === 'drop') {
    while (fits(g, { ...g.piece, y: g.piece.y + 1 })) g.piece = { ...g.piece, y: g.piece.y + 1 }
    tickTetris(g)
    return
  }
  if (action === 'down') return tickTetris(g)
  const moved: Piece =
    action === 'rotate' ? { ...g.piece, shape: rotate(g.piece.shape) } : { ...g.piece, x: g.piece.x + (action === 'left' ? -1 : 1) }
  if (fits(g, moved)) g.piece = moved
}

function drawTetris(g: TetrisGame): string[] {
  return g.board.map((row, y) =>
    row
      .map((cell, x) => {
        const py = y - g.piece.y
        const px = x - g.piece.x
        const isPiece = g.piece.shape[py]?.[px] === 1
        return cell || isPiece ? '[]' : ' .'
      })
      .join(''),
  )
}

// ==========================================================================
// บทที่ 5: Game loop + High Score
// ==========================================================================
type Game = SnakeGame | TetrisGame
type Score = { game: string; score: number; date: number }

let game: Game | undefined
let isPaused = false
let loop: Timer | undefined
let scores: Score[] = []

const SPEED_MS = { snake: 220, tetris: 600 }

function stopLoop(): void {
  loop?.cancel()
  loop = undefined
}

function startLoop($: EngineInterface): void {
  stopLoop()
  if (!game) return
  loop = $.clock.every(SPEED_MS[game.kind], () => {
    if (!game || isPaused || game.isOver) return
    if (game.kind === 'snake') tickSnake(game)
    else tickTetris(game)
    if (game.isOver) void finish($, game)
    $.ui.invalidate('ui.render')
  })
}

async function finish($: EngineInterface, g: Game): Promise<void> {
  stopLoop()
  const best = scores.filter(s => s.game === g.kind).reduce((m, s) => Math.max(m, s.score), 0)
  scores = [...scores, { game: g.kind, score: g.score, date: await $.clock.now() }].sort((a, b) => b.score - a.score).slice(0, 30)
  await $.store.set('scores', scores)
  $.ui.toast(g.score > best && g.score > 0 ? `🏆 สถิติใหม่! ${g.kind} ${g.score} คะแนน` : `💀 GAME OVER - ${g.score} คะแนน`)
}

async function startGame($: EngineInterface, next: Game): Promise<string> {
  game = next
  isPaused = false
  // focus: true = แผงรับคีย์บอร์ด ปุ่ม hotkey w a s d จึงใช้ได้ทันที
  const opened = await $.ui.open({ id: PANE, title: '📱 NOKIA 3310', focus: true, closeOnEscape: true })
  startLoop($)
  $.ui.invalidate('ui.render')
  return opened.isPlaced ? '' : `\n(เปิดแผงไม่ได้ในหน้าจอนี้: ${opened.reason})`
}

// รับคำสั่งควบคุม ใช้ทั้งจากปุ่มในแผงและจากคำสั่ง /game up
function control(action: string): void {
  if (!game || game.isOver) return
  if (game.kind === 'snake') {
    const map: Record<string, Direction> = { up: 'up', w: 'up', down: 'down', s: 'down', left: 'left', a: 'left', right: 'right', d: 'right' }
    const dir = map[action]
    if (dir) game.nextDirection = dir
    return
  }
  const map: Record<string, 'left' | 'right' | 'rotate' | 'down' | 'drop'> = { left: 'left', a: 'left', right: 'right', d: 'right', up: 'rotate', w: 'rotate', rotate: 'rotate', down: 'down', s: 'down', drop: 'drop', x: 'drop' }
  const move = map[action]
  if (move && !isPaused) moveTetris(game, move)
  if (game.isOver) stopLoop()
}

function scoreBoard(): string {
  if (scores.length === 0) return '🏆 ยังไม่มี High Score เล่นด้วย /game snake หรือ /game tetris'
  const lines = ['🏆 High Scores']
  for (const kind of ['snake', 'tetris']) {
    const top = scores.filter(s => s.game === kind).slice(0, 5)
    if (top.length === 0) continue
    lines.push(`\n🎮 ${kind}:`)
    top.forEach((s, i) => lines.push(`  ${i + 1}. ${s.score} คะแนน - ${new Date(s.date).toLocaleDateString('th-TH')}`))
  }
  return lines.join('\n')
}

const HELP = `📱 Nokia Games TH (Mod 13)
========================================
/game snake [กว้าง] [สูง]   เกมงู (ค่าเริ่มต้น 20x12)
/game tetris                Tetris
/game pause | resume | quit
/game scores [clear]        High Score
/game demo                  ดูหน้าจอตัวอย่างแบบข้อความ

ในแผง (กดบนคีย์บอร์ดได้เลย):
  งู:     w ขึ้น  a ซ้าย  s ลง  d ขวา
  Tetris: a ซ้าย  d ขวา  w หมุน  s ลงเร็ว  x ทิ้งลงสุด
  p หยุด/เล่นต่อ   r เริ่มใหม่   Esc ปิดแผง
หรือใช้คำสั่ง /game up | down | left | right | drop`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('scores')
    scores = Array.isArray(saved) ? (saved as Score[]) : []
    await $.command.register({ name: 'game', description: 'เกม Nokia: /game snake, /game tetris (/game help)', argumentHint: 'snake|tetris|scores|help' })
    return next(e)
  })

  // ปิดแผง (Esc) = หยุดเกม จะได้ไม่มี timer วิ่งค้าง
  on('ui.close', ($, e, next) => {
    if (e.id === PANE && game && !game.isOver) {
      isPaused = true
      stopLoop()
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 6: วาดจอ Nokia + ปุ่มควบคุมที่มี hotkey
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!game) return <Text dimColor>เริ่มเกมด้วย /game snake หรือ /game tetris</Text>

    const g = game
    const rows = g.kind === 'snake' ? drawSnake(g) : drawTetris(g)
    const status = g.isOver ? '💀 GAME OVER (r = เล่นใหม่)' : isPaused ? '⏸ หยุดอยู่ (p = เล่นต่อ)' : g.kind === 'snake' ? `ยาว ${g.snake.length}` : `${g.lines} แถว`
    const press = (action: string) => () => {
      control(action)
      $.ui.invalidate('ui.render')
    }
    const restart = () => void startGame($, g.kind === 'snake' ? createSnake(g.width, g.height) : createTetris())
    const togglePause = () => {
      if (g.isOver) return
      isPaused = !isPaused
      $.ui.invalidate('ui.render')
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" backgroundColor={NOKIA_SCREEN} borderStyle="bold" borderColor={NOKIA_INK} paddingX={1}>
          <Text color={NOKIA_INK} bold>
            {`NOKIA  ${g.kind.toUpperCase()}  SCORE ${g.score}`}
          </Text>
          {rows.map(row => (
            <Text color={NOKIA_INK}>{row}</Text>
          ))}
          <Text color={NOKIA_INK}>{status}</Text>
        </Box>
        <Box gap={1} flexWrap="wrap">
          <Button key="w" hotkey="w" label={g.kind === 'snake' ? '↑' : '⟳'} onPress={press('w')} />
          <Button key="a" hotkey="a" label="←" onPress={press('a')} />
          <Button key="s" hotkey="s" label="↓" onPress={press('s')} />
          <Button key="d" hotkey="d" label="→" onPress={press('d')} />
          {g.kind === 'tetris' && <Button key="x" hotkey="x" label="ทิ้ง" onPress={press('x')} />}
          <Button key="p" hotkey="p" label={isPaused ? 'เล่นต่อ' : 'หยุด'} onPress={togglePause} />
          <Button key="r" hotkey="r" label="ใหม่" onPress={restart} />
        </Box>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 7: คำสั่ง /game
  // ==========================================================================
  on('command.run', { command: 'game' }, async ($, e) => {
    const [sub = 'help', a1, a2] = e.args.trim().split(/\s+/).filter(Boolean)

    switch (sub) {
      case 'snake': {
        const width = Math.min(30, Math.max(8, Number(a1) || 20))
        const height = Math.min(20, Math.max(6, Number(a2) || 12))
        return { text: `🐍 เริ่มเกมงู ${width}x${height} กด w a s d ในแผงเพื่อบังคับ${await startGame($, createSnake(width, height))}` }
      }
      case 'tetris':
        return { text: `🧱 เริ่ม Tetris กด a d เลื่อน, w หมุน, x ทิ้งลงสุด${await startGame($, createTetris())}` }
      case 'pause':
        isPaused = true
        $.ui.invalidate('ui.render')
        return { text: '⏸️ หยุดเกมแล้ว' }
      case 'resume':
        if (!game || game.isOver) return { text: 'ไม่มีเกมที่เล่นค้างอยู่' }
        isPaused = false
        if (!loop) startLoop($)
        await $.ui.open({ id: PANE, title: '📱 NOKIA 3310', focus: true, closeOnEscape: true })
        return { text: '▶️ เล่นต่อ' }
      case 'quit':
        stopLoop()
        game = undefined
        await $.ui.close({ id: PANE })
        return { text: '👋 ออกจากเกมแล้ว' }
      case 'scores':
        if (a1 === 'clear') {
          scores = []
          await $.store.delete('scores')
          return { text: '🧹 ล้าง High Score แล้ว' }
        }
        return { text: scoreBoard() }
      case 'demo': {
        const demo = createSnake(16, 6)
        for (let i = 0; i < 3; i++) tickSnake(demo)
        return { text: ['📱 NOKIA 3310 - ตัวอย่างจอเกมงู', ...drawSnake(demo).map(r => `|${r}|`), '/game snake เพื่อเล่นจริง'].join('\n') }
      }
      case 'up':
      case 'down':
      case 'left':
      case 'right':
      case 'drop':
        control(sub)
        $.ui.invalidate('ui.render')
        return { text: `🎮 ${sub}` }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ทำให้งูเร็วขึ้นทุก 50 คะแนน: เรียก startLoop ใหม่ด้วยค่า SPEED_MS ที่น้อยลง
 * 2. วาดด้วย Raster (terminal) แทนข้อความ จะได้พิกเซลสีแบบจอจริง
 * 3. ให้ Claude เล่นงูเอง: หาทางไปอาหารด้วย BFS แล้วเรียก control() ทุก tick
 */
