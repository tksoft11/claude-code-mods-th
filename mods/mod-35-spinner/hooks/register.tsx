/**
 * ============================================================================
 * MOD 35: Spinner TH - เปลี่ยนตัวหมุนตอน Claude ทำงาน 20 แบบ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: cli-spinners (ชุด spinner ยอดนิยมของ terminal)
 *
 * หน้าที่ของ Mod นี้:
 * 1. วาด spinner ของ Claude Code ใหม่ด้วยแบบที่เลือก (ui.render ของ component "Spinner")
 * 2. 20 แบบ: คลาสสิก, จุด, แท่ง, สร้างสรรค์ และแบบไทย (ตุ๊กตุ๊ก ดอกบัว กาแฟ ไหว้)
 * 3. เปลี่ยนคำว่า "Thinking/Sauteing" เป็นคำกริยาไทยขำๆ ได้
 * 4. ปรับความเร็ว, สุ่มแบบ, ปิดกลับเป็นของเดิม
 *
 * เทคนิค: spinner ต้องขยับเอง จึงตั้ง timer ตอนเริ่ม turn ให้เรียก $.ui.invalidate ถี่ๆ
 * แล้วหยุดตอน turn จบ (ไม่ให้ timer วิ่งตลอดเวลา)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Style {
  id: string
  name: string
  group: 'คลาสสิก' | 'จุด' | 'แท่ง' | 'สร้างสรรค์' | 'ไทย'
  frames: string[]
  color: string
}

// ==========================================================================
// บทที่ 1: แต่ละแบบคือ "เฟรม" ที่วนแสดงทีละอัน
// ==========================================================================
const STYLES: Style[] = [
  { id: 'dots', name: 'จุดเบรลล์', group: 'จุด', frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], color: '#7c83fd' },
  { id: 'line', name: 'เส้นหมุน', group: 'คลาสสิก', frames: ['|', '/', '-', '\\'], color: '#90a4ae' },
  { id: 'arc', name: 'ส่วนโค้ง', group: 'คลาสสิก', frames: ['◜', '◠', '◝', '◞', '◡', '◟'], color: '#4fc3f7' },
  { id: 'circle', name: 'วงกลมครึ่ง', group: 'คลาสสิก', frames: ['◐', '◓', '◑', '◒'], color: '#7c83fd' },
  { id: 'square', name: 'สี่เหลี่ยมหมุน', group: 'คลาสสิก', frames: ['◰', '◳', '◲', '◱'], color: '#ba68c8' },
  { id: 'arrows', name: 'ลูกศร', group: 'คลาสสิก', frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'], color: '#ffb74d' },
  { id: 'bounce', name: 'ลูกบอลเด้ง', group: 'จุด', frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'], color: '#2ee6a6' },
  { id: 'pulse', name: 'จุดกระพริบ', group: 'จุด', frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙'], color: '#ff6b35' },
  { id: 'typing', name: 'กำลังพิมพ์', group: 'จุด', frames: ['   ', '.  ', '.. ', '...'], color: '#90a4ae' },
  { id: 'bars', name: 'แท่งคลื่น', group: 'แท่ง', frames: ['▁▃▅', '▂▄▆', '▃▅▇', '▄▆█', '▃▅▇', '▂▄▆'], color: '#7c83fd' },
  { id: 'grow', name: 'แท่งโต', group: 'แท่ง', frames: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'], color: '#4db6ac' },
  { id: 'progress', name: 'แถบเลื่อน', group: 'แท่ง', frames: ['[■□□□□]', '[□■□□□]', '[□□■□□]', '[□□□■□]', '[□□□□■]', '[□□□■□]', '[□□■□□]', '[□■□□□]'], color: '#64b5f6' },
  { id: 'moon', name: 'ข้างขึ้นข้างแรม', group: 'สร้างสรรค์', frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'], color: '#ffd54f' },
  { id: 'clock', name: 'นาฬิกา', group: 'สร้างสรรค์', frames: ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'], color: '#ffd54f' },
  { id: 'earth', name: 'โลกหมุน', group: 'สร้างสรรค์', frames: ['🌍', '🌎', '🌏'], color: '#4fc3f7' },
  { id: 'pacman', name: 'แพคแมน', group: 'สร้างสรรค์', frames: ['ᗧ···', ' ᗧ··', '  ᗧ·', '   ᗧ', '  ᗤ ', ' ᗤ  '], color: '#ffeb3b' },
  { id: 'tuktuk', name: 'ตุ๊กตุ๊กวิ่ง', group: 'ไทย', frames: ['🛺    ', ' 🛺   ', '  🛺  ', '   🛺 ', '    🛺', '   🛺 ', '  🛺  ', ' 🛺   '], color: '#26a69a' },
  { id: 'lotus', name: 'ดอกบัวบาน', group: 'ไทย', frames: ['🌱', '🪷', '🌸', '🪷'], color: '#f06292' },
  { id: 'coffee', name: 'กาแฟหยด', group: 'ไทย', frames: ['☕ ˚', '☕ ｡', '☕ °', '☕  '], color: '#a1887f' },
  { id: 'wai', name: 'สวัสดีครับ', group: 'ไทย', frames: ['🙏', '🙂', '🙏', '😊'], color: '#ffb74d' },
]

// คำกริยาไทยแทน "Sauteing", "Thinking" ของ Claude Code
const THAI_WORDS = ['กำลังคิด', 'กำลังต้มยำ', 'กำลังตำส้มตำ', 'กำลังชงชาไทย', 'กำลังเคี่ยวโค้ด', 'กำลังปั้นข้าวเหนียว', 'กำลังนวดแป้ง', 'กำลังรีดบั๊ก', 'กำลังพับกระทง', 'กำลังจัดระเบียบ']

let styleId = 'dots'
let thaiWords = false
let speedMs = 100
let ticker: Timer | undefined
let activeTurns = 0

function current(): Style | undefined {
  return STYLES.find(s => s.id === styleId)
}

// ==========================================================================
// บทที่ 2: ทำให้ขยับ - เปิด timer เฉพาะช่วงที่ Claude ทำงาน
// ==========================================================================
function startTicker($: EngineInterface): void {
  if (ticker || !current()) return
  ticker = $.clock.every(speedMs, () => $.ui.invalidate('ui.render'))
}

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('spinner', { styleId, thaiWords, speedMs })
}

function previewLine(s: Style): string {
  return `${s.id.padEnd(9)} ${s.name.padEnd(14)} ${s.frames.slice(0, 6).join(' ')}`
}

const HELP = `🌀 Spinner TH (Mod 35)
========================================
/spinner                 ดูทุกแบบ + แบบที่ใช้อยู่
/spinner use <id>        เปลี่ยนแบบ เช่น /spinner use tuktuk
/spinner random          สุ่มแบบ
/spinner thai on|off     ใช้คำกริยาไทยขำๆ แทนคำของ Claude
/spinner speed <ms>      ความเร็ว (60-400, ค่าเริ่มต้น 100)
/spinner off             กลับไปใช้ spinner เดิมของ Claude Code`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('spinner')) as { styleId?: string; thaiWords?: boolean; speedMs?: number } | undefined
    styleId = saved?.styleId ?? 'dots'
    thaiWords = saved?.thaiWords ?? false
    speedMs = saved?.speedMs ?? 100
    await $.command.register({ name: 'spinner', description: 'เปลี่ยน spinner ตอน Claude ทำงาน 20 แบบ (/spinner help)', argumentHint: 'use|random|thai|speed|off' })
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    activeTurns++
    startTicker($)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    activeTurns = Math.max(0, activeTurns - 1)
    if (activeTurns === 0) stopTicker()
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: วาด spinner ใหม่ - เลือกเฟรมจากเวลา เพื่อให้ทุกครั้งที่วาดได้เฟรมถัดไป
  // ==========================================================================
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const style = current()
    if (!style) return next(e) // ปิดอยู่ = ให้ Claude Code วาดของเดิม
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const frame = style.frames[Math.floor(now / speedMs) % style.frames.length] ?? ''
    // ข้อความพิเศษ (เช่น "รออนุญาต") ต้องแสดงตามเดิม คำกริยาไทยใช้แทนเฉพาะคำปกติ
    const word = e.props.message ?? (thaiWords ? (THAI_WORDS[Math.floor(now / 4000) % THAI_WORDS.length] ?? e.props.word) : e.props.word)
    return (
      <Box gap={1}>
        <Text color={style.color}>{frame}</Text>
        <Text>
          {word}
          {e.props.suffix}
        </Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /spinner
  // ==========================================================================
  on('command.run', { command: 'spinner' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'use': {
        const s = STYLES.find(x => x.id === arg)
        if (!s) return { text: `❌ ไม่มีแบบ "${arg ?? ''}" ดูรายชื่อด้วย /spinner` }
        styleId = s.id
        await save($)
        return { text: `🌀 เปลี่ยนเป็น ${s.name}: ${s.frames.join(' ')}` }
      }
      case 'random': {
        const s = STYLES[Math.floor(Math.random() * STYLES.length)] ?? STYLES[0]!
        styleId = s.id
        await save($)
        return { text: `🎲 ได้ ${s.name}: ${s.frames.join(' ')}` }
      }
      case 'thai':
        thaiWords = arg === 'on'
        await save($)
        return { text: thaiWords ? `🇹🇭 ใช้คำไทย เช่น "${THAI_WORDS.slice(0, 3).join('", "')}"` : 'ใช้คำของ Claude Code ตามเดิม' }
      case 'speed': {
        const ms = Number(arg)
        if (!Number.isInteger(ms) || ms < 60 || ms > 400) return { text: 'วิธีใช้: /spinner speed 120  (60-400 มิลลิวินาทีต่อเฟรม)' }
        speedMs = ms
        stopTicker()
        if (activeTurns > 0) startTicker($)
        await save($)
        return { text: `⏱️ เฟรมละ ${ms} ms` }
      }
      case 'off':
        styleId = 'off'
        stopTicker()
        await save($)
        return { text: '↩️ กลับไปใช้ spinner เดิมของ Claude Code แล้ว' }
      case 'help':
        return { text: HELP }
      default: {
        const groups = [...new Set(STYLES.map(s => s.group))]
        return {
          text: [
            `🌀 Spinner ที่ใช้อยู่: ${current()?.name ?? 'ของเดิม (ปิด)'}${thaiWords ? ' + คำไทย' : ''}`,
            ...groups.flatMap(g => [`\n${g}`, ...STYLES.filter(s => s.group === g).map(previewLine)]),
            '',
            '/spinner use <id> เพื่อเปลี่ยน | /spinner help',
          ].join('\n'),
        }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เปลี่ยนแบบตามสิ่งที่ Claude ทำ: e.props.mode เป็น 'thinking' ใช้ดอกบัว, 'tool-use' ใช้ตุ๊กตุ๊ก
 * 2. ใส่สีไล่ระดับตามเวลาที่รอ (ยิ่งนานยิ่งแดง)
 * 3. ให้ผู้ใช้สร้างแบบของตัวเอง: /spinner custom 🍜,🍲,🥘 แล้วเก็บใน $.store
 */
