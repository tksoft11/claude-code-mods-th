/**
 * ============================================================================
 * MOD 59: Spinner Arcade TH - เกมใต้ spinner + สีปลอบใจ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เกมไดโนเสาร์ของ Chrome ตอนเน็ตหลุด และแพคแมน
 *
 * หน้าที่ของ Mod นี้:
 * 1. เมื่อ Claude ทำงานนานเกิน 5 วินาที จะมีแพคแมนวิ่งกินจุดอยู่ใต้ spinner
 *    ยิ่งรอนาน ยิ่งได้แต้ม (สะสมข้าม session มีสถิติสูงสุด)
 * 2. ถ้ารอบนี้มี tool พังหลายครั้ง แถบจะเปลี่ยนเป็นสีพาสเทลนุ่มๆ พร้อมคำปลอบใจ
 * 3. วาดต่อท้าย spinner ของเดิม (ห่อ next(e)) จึงใช้ร่วมกับ Mod 35 Spinner ได้
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const WIDTH = 28
const SHOW_AFTER_MS = 5000
const PALETTE = { normal: { pac: '#fdd835', dot: '#90a4ae', ghost: '#ef5350' }, soft: { pac: '#f8bbd0', dot: '#e1bee7', ghost: '#b3e5fc' } }
const COMFORT = ['ไม่เป็นไรนะ ค่อยๆ แก้ไปด้วยกัน 🌸', 'บั๊กก็แค่ปริศนาที่ยังไม่เฉลย ☕', 'หายใจลึกๆ เดี๋ยวก็เจอ 🍃', 'พังบ้างแปลว่ากำลังลองของใหม่ ✨', 'Claude ยังสู้อยู่ ไม่ต้องห่วง 💪']

let enabled = true
let turnStart = 0
let running = false
let errors = 0
let score = 0 // แต้มของรอบนี้
let total = 0
let best = 0
let ticker: Timer | undefined

// ==========================================================================
// บทที่ 1: วาดหนึ่งเฟรม - คำนวณจากเวลาที่ผ่านไปล้วนๆ (ไม่ต้องเก็บสถานะเกม)
// ==========================================================================
function frame(elapsed: number): { before: string; pac: string; after: string; eaten: number } {
  const step = Math.floor(elapsed / 250)
  const pos = step % WIDTH // แพคแมนวิ่งจากซ้ายไปขวาแล้ววนใหม่
  const ghostAt = pos - 5 // ผีตามหลัง 5 ช่อง
  const before = Array.from({ length: pos }, (_, i) => (i === ghostAt ? 'ᗣ' : ' ')).join('')
  // ข้างหน้ามีจุดทุกช่องคู่ (ช่องที่กินไปแล้วอยู่ข้างหลัง จึงว่าง)
  const after = Array.from({ length: WIDTH - pos - 1 }, (_, i) => ((pos + 1 + i) % 2 === 0 ? '·' : ' ')).join('')
  return { before, pac: step % 2 === 0 ? 'ᗧ' : 'O', after, eaten: Math.floor(step / 2) }
}

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function endTurn($: EngineInterface): Promise<void> {
  if (!running) return
  running = false
  stopTicker()
  if (score > 0) {
    total += score
    best = Math.max(best, score)
    await $.store.set('arcade', { total, best })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('arcade')) as { total?: number; best?: number; enabled?: boolean } | undefined
    total = saved?.total ?? 0
    best = saved?.best ?? 0
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    await $.command.register({ name: 'arcade', description: 'เกมแพคแมนใต้ spinner ตอนรอ Claude + สีปลอบใจเมื่อเจอ error (/arcade)', argumentHint: 'on|off|reset' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: จังหวะของรอบ - timer วิ่งเฉพาะระหว่างที่ Claude ทำงาน
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnStart = await $.clock.now()
      running = true
      errors = 0
      score = 0
      if (enabled) {
        stopTicker()
        ticker = $.clock.every(250, () => $.ui.invalidate('ui.render'))
      }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (running && !e.agentId && r.isError) errors++
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await endTurn($)
    return r
  })

  // ==========================================================================
  // บทที่ 3: วาดใต้ spinner เดิม - ห่อ next(e) ไว้ ใครวาด spinner ก็ยังแสดงตามเดิม
  // ==========================================================================
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!enabled || !running) return next(e)
    const elapsed = (await $.clock.now()) - turnStart
    if (elapsed < SHOW_AFTER_MS || e.props.message) return next(e) // รอนานก่อน และไม่บังข้อความพิเศษ (เช่นรออนุญาต)
    const { Box, Text } = $.ui.resolve(e)
    const f = frame(elapsed - SHOW_AFTER_MS)
    score = f.eaten
    const soft = errors >= 2
    const c = soft ? PALETTE.soft : PALETTE.normal
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          {'  '}
          <Text color={c.ghost}>{f.before}</Text>
          <Text color={c.pac} bold>
            {f.pac}
          </Text>
          <Text color={c.dot}>{f.after}</Text>
          <Text dimColor>{`  ⭐ ${score}`}</Text>
        </Text>
        {soft && <Text color="#f48fb1">{`  ${COMFORT[Math.floor(elapsed / 6000) % COMFORT.length]}`}</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'arcade' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await $.store.set('enabled', enabled)
      if (!enabled) stopTicker()
      return { text: enabled ? '🕹️ เปิดเกมใต้ spinner แล้ว (โผล่เมื่อรอนานเกิน 5 วิ)' : 'ปิดเกมแล้ว' }
    }
    if (sub === 'reset') {
      total = 0
      best = 0
      await $.store.set('arcade', { total, best })
      return { text: '🧹 ล้างแต้มแล้ว' }
    }
    return { text: `🕹️ Spinner Arcade (Mod 59) ${enabled ? 'เปิด' : 'ปิด'}\n  แต้มสะสม ⭐ ${total} · รอบที่รอนานสุด ⭐ ${best}\n\n/arcade on|off   เปิด/ปิด\n/arcade reset    ล้างแต้ม\n\nแพคแมนจะโผล่ใต้ spinner เมื่อ Claude ทำงานนานเกิน 5 วินาที และเปลี่ยนเป็นสีพาสเทลเมื่อรอบนั้นพังหลายครั้ง` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ปลดล็อกตัวละครใหม่เมื่อแต้มสะสมถึง 1,000 (ผี, เชอร์รี่)
 * 2. เปลี่ยนเกมตามเวลา: กลางคืนเป็นดาวตก กลางวันเป็นแพคแมน
 * 3. เก็บสถิติว่ารอ Claude ไปรวมกี่นาทีต่อวัน
 */
