/**
 * ============================================================================
 * MOD 48: Rainbow Friends TH - เพื่อนสายรุ้งวิ่งผ่านจอ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: มีมแมวบินลากสายรุ้งยุคอินเทอร์เน็ตแรกๆ
 *
 * หน้าที่ของ Mod นี้:
 * 1. ตัวละคร ASCII ที่ออกแบบเอง 5 ตัว (แมว ยูนิคอร์น ช้างน้อย ปลาทอง เมฆ)
 *    วิ่งผ่านแผงพร้อมลากสายรุ้งเป็นคลื่น
 * 2. /rainbow parade - ทุกตัวเดินขบวนพร้อมกัน
 * 3. /rainbow text <ข้อความ> - ข้อความสีรุ้งไล่สีวิ่ง
 *
 * หมายเหตุ: ต้นฉบับมีตัวการ์ตูนดัง (ชินจัง โดเรมอน พาวเวอร์พัฟ ฯลฯ) ซึ่งมีลิขสิทธิ์
 * ฉบับนี้ใช้ตัวละครที่วาดขึ้นใหม่ทั้งหมด
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Sprite {
  name: string
  color: string
  frames: [string[], string[]]
}

// ==========================================================================
// บทที่ 1: ตัวละคร - 2 เฟรมต่อตัว สลับกันเหมือนกำลังวิ่ง/ว่าย
// ==========================================================================
const SPRITES: Record<string, Sprite> = {
  cat: {
    name: 'แมวสายรุ้ง',
    color: '#bdbdbd',
    frames: [
      [' /\\_/\\ ', '( ^.^ )', ' /   \\ ', '(_)-(_)'],
      [' /\\_/\\ ', '( ^.^ )', ' \\   / ', ' (_)(_)'],
    ],
  },
  unicorn: {
    name: 'ยูนิคอร์น',
    color: '#f8bbd0',
    frames: [
      ['     \\  ', '  ,,_/o>', ' (    ) ', ' /|  |\\ '],
      ['     \\  ', '  ,,_/o>', ' (    ) ', '  |\\/|  '],
    ],
  },
  elephant: {
    name: 'ช้างน้อย',
    color: '#90a4ae',
    frames: [
      ['  ___   ', ' (o  )_ ', ' (    )\\', '  || || '],
      ['  ___   ', ' (o  )_ ', ' (    ) |', '  |\\ /| '],
    ],
  },
  fish: {
    name: 'ปลาทอง',
    color: '#ffa726',
    frames: [
      ['   __    ', '><(  o>  ', '   ~~  o '],
      ['   __    ', '>=(  o>  ', '   ~~ o  '],
    ],
  },
  cloud: {
    name: 'เมฆปุย',
    color: '#e3f2fd',
    frames: [
      ['  .--.   ', ' (    ). ', '(_______)', '  \' \' \'  '],
      ['  .--.   ', ' (    ). ', '(_______)', ' \' \' \'   '],
    ],
  },
}

const RAINBOW = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa']
const PANE = 'rainbow-friends-th'
const MAX_FRAMES = 2000 // ประมาณ 5 นาทีแล้วพัก (ไม่กินเครื่องตอนลืมปิดแผง)

let cast: string[] = ['cat']
let banner = ''
let frame = 0
let ticker: Timer | undefined

interface Cell {
  text: string
  color?: string
}

// ==========================================================================
// บทที่ 2: วาดหนึ่งเลน - สายรุ้งเป็นคลื่นด้านหลัง แล้ววางตัวละครทับ
// ==========================================================================
function lane(sprite: Sprite, offset: number, width: number): Cell[][] {
  const art = sprite.frames[frame % 4 < 2 ? 0 : 1]
  const spriteWidth = Math.max(...art.map(l => l.length))
  const travel = width + spriteWidth
  const x = ((Math.floor(frame / 2) + offset) % travel) - spriteWidth
  return art.map((row, y) => {
    const cells: Cell[] = []
    for (let col = 0; col < width; col++) {
      const inSprite = col >= x && col < x + spriteWidth
      const ch = inSprite ? row[col - x] ?? ' ' : ' '
      if (inSprite) cells.push(ch === ' ' ? { text: ' ' } : { text: ch, color: sprite.color })
      else if (col < x && col >= x - 30) {
        // คลื่น: แต่ละช่วง 3 คอลัมน์ยกขึ้นลงสลับกัน
        const wave = Math.floor((col + Math.floor(frame / 2)) / 3) % 2
        const band = Math.floor(((y + wave) * RAINBOW.length) / (art.length + 1))
        cells.push({ text: '█', color: RAINBOW[band % RAINBOW.length] })
      } else cells.push({ text: (col * 7 + y * 13 + frame) % 97 === 0 ? '✦' : ' ', color: '#fff59d' })
    }
    return cells
  })
}

// รวมช่องสีเดียวกันที่ติดกันเป็นก้อนเดียว (Text น้อยลง วาดเร็วขึ้น)
function merge(cells: Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of cells) {
    const prev = out.at(-1)
    if (prev && prev.color === c.color) prev.text += c.text
    else out.push({ ...c })
  }
  return out
}

function rainbowText(text: string): Cell[] {
  return [...text].map((ch, i) => ({ text: ch, color: RAINBOW[(i + Math.floor(frame / 2)) % RAINBOW.length] }))
}

function start($: EngineInterface): void {
  frame = 0
  ticker ??= $.clock.every(150, () => {
    frame++
    if (frame >= MAX_FRAMES) stop()
    $.ui.invalidate('ui.render')
  })
}

function stop(): void {
  ticker?.cancel()
  ticker = undefined
}

const HELP = `🌈 Rainbow Friends TH (Mod 48)
========================================
/rainbow [ตัว]          ให้เพื่อนวิ่งผ่านแผง: ${Object.entries(SPRITES).map(([k, s]) => `${k}=${s.name}`).join(' ')}
/rainbow parade         ทุกตัวเดินขบวน
/rainbow text <ข้อความ>  ข้อความสีรุ้ง
/rainbow list           ดูหน้าตาทุกตัว
/rainbow stop           หยุด`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'rainbow', description: 'เพื่อนสายรุ้งวิ่งผ่านจอ แมว ยูนิคอร์น ช้าง ปลาทอง เมฆ (/rainbow help)', argumentHint: '[ตัว]|parade|text <ข้อความ>|list|stop' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(30, Math.min(80, e.props.bodyColumns - 2))
    const lanes = cast.map(key => ({ key, sprite: SPRITES[key] })).filter((l): l is { key: string; sprite: Sprite } => !!l.sprite)
    return (
      <Box flexDirection="column">
        {banner && (
          <Text bold>
            {merge(rainbowText(banner)).map(c => (
              <Text color={c.color}>{c.text}</Text>
            ))}
          </Text>
        )}
        {lanes.map((l, i) => (
          <Box flexDirection="column" marginTop={1}>
            {lane(l.sprite, i * 17, width).map(row => (
              <Text>
                {merge(row).map(c => (c.color ? <Text color={c.color}>{c.text}</Text> : c.text))}
              </Text>
            ))}
            <Text dimColor>{l.sprite.name}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stop()
    return next(e)
  })

  on('command.run', { command: 'rainbow' }, async ($, e) => {
    const [sub = 'cat', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const show = async (msg: string) => {
      await $.ui.open({ id: PANE, title: '🌈 Rainbow Friends' })
      start($)
      $.ui.invalidate('ui.render')
      return { text: msg }
    }
    switch (sub) {
      case 'help':
        return { text: HELP }
      case 'stop':
        stop()
        await $.ui.close({ id: PANE })
        return { text: '👋 เพื่อนๆ กลับบ้านแล้ว' }
      case 'list':
        return { text: Object.entries(SPRITES).map(([k, s]) => `${s.name} (${k})\n${s.frames[0].join('\n')}`).join('\n\n') }
      case 'parade':
        cast = Object.keys(SPRITES)
        banner = ''
        return show('🌈 ขบวนพาเหรดสายรุ้งมาแล้ว!')
      case 'text': {
        const text = rest.join(' ').slice(0, 60)
        if (!text) return { text: 'วิธีใช้: /rainbow text สุขสันต์วันเกิด!' }
        banner = text
        return show(`🌈 ${text}`)
      }
      default:
        if (!SPRITES[sub]) return { text: `ไม่มีตัว "${sub}"\n${HELP}` }
        cast = [sub]
        return show(`🌈 ${SPRITES[sub].name} มาแล้ว!`)
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้เพื่อนวิ่งผ่านเองทุกครั้งที่ Claude ทำงานเสร็จ (ดัก turn.complete)
 * 2. วาดตัวละครของคุณเองแล้วเพิ่มลงใน SPRITES
 * 3. เปลี่ยนชุดสีตามเทศกาล: สงกรานต์ ลอยกระทง ปีใหม่
 */
