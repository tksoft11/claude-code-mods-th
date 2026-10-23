/**
 * ============================================================================
 * MOD 05: Cache Tax TH - ดูค่า Prompt Cache เป็นบาท (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/karanb192/cache-tax
 *
 * ความรู้ที่หลายคนไม่รู้ (ราคาตัวอย่างของ model ระดับ Sonnet ต่อ 1 ล้าน token):
 * - Input ปกติ ~$3
 * - เขียนเข้า Cache ~$3.75 (แพงกว่าปกตินิดหน่อย)
 * - อ่านจาก Cache ~$0.30 (ถูกกว่าปกติ 10 เท่า!)
 * ถ้า /clear บ่อย cache จะหาย ต้องจ่ายเต็มราคาใหม่ Mod นี้ช่วยให้เห็นตัวเลข
 *
 * หน้าที่ของ Mod นี้:
 * 1. อ่าน usage ของทุก turn (turn.complete) แล้วแยก cache read/write
 * 2. คำนวณเงิน, Hit Rate และเงินที่ประหยัดได้ แสดงเป็นบาท
 * 3. แสดง Hit Rate เป็นไฟสีใน status line
 * 4. เตือนก่อน /clear ว่า cache จะหาย
 */

import type { EngineInterface, Register, TurnUsage } from 'claude-code'

// ราคาโดยประมาณ (USD ต่อ 1 ล้าน token) - ตรวจราคาล่าสุดที่ anthropic.com/pricing แล้วแก้ได้เลย
const PRICE = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
const THB_PER_USD = 36.5

type CacheStats = {
  turns: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

const EMPTY: CacheStats = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
let session: CacheStats = { ...EMPTY } // ของ session นี้ (เริ่มใหม่เมื่อ reload)

// ==========================================================================
// บทที่ 1: คำนวณเงิน
// ==========================================================================
function costUSD(s: CacheStats): number {
  return (
    (s.input / 1e6) * PRICE.input +
    (s.output / 1e6) * PRICE.output +
    (s.cacheWrite / 1e6) * PRICE.cacheWrite +
    (s.cacheRead / 1e6) * PRICE.cacheRead
  )
}

// ถ้าไม่มี cache เลย token ที่อ่านจาก cache ต้องจ่ายราคา input เต็ม
function savedUSD(s: CacheStats): number {
  return (s.cacheRead / 1e6) * (PRICE.input - PRICE.cacheRead)
}

// ==========================================================================
// บทที่ 2: Hit Rate = สัดส่วน input ที่อ่านจาก cache
// ==========================================================================
function hitRate(s: CacheStats): number {
  const totalInput = s.input + s.cacheRead + s.cacheWrite
  return totalInput === 0 ? 0 : (s.cacheRead / totalInput) * 100
}

function hitLight(rate: number): string {
  if (rate >= 60) return '🟢'
  if (rate >= 30) return '🟡'
  return '🔴'
}

function add(a: CacheStats, u: TurnUsage): CacheStats {
  return {
    turns: a.turns + 1,
    input: a.input + u.input_tokens,
    output: a.output + u.output_tokens,
    cacheRead: a.cacheRead + u.cache_read_input_tokens,
    cacheWrite: a.cacheWrite + u.cache_creation_input_tokens,
  }
}

const thb = (usd: number) => `${(usd * THB_PER_USD).toFixed(2)}฿`
const n = (x: number) => x.toLocaleString('en-US')

function buildReport(title: string, s: CacheStats): string {
  const rate = hitRate(s)
  const advice =
    s.turns === 0
      ? 'ยังไม่มีข้อมูล ลองคุยกับ Claude สักรอบก่อน'
      : rate >= 70
        ? '✅ Hit Rate สูงมาก ใช้ cache คุ้มแล้ว'
        : rate >= 30
          ? '💡 พอใช้ได้ ลองใช้ /compact แทน /clear เมื่อยังทำงานเรื่องเดิม'
          : '⚠️ Hit Rate ต่ำ อาจ /clear บ่อยเกินไป หรือเว้นนานเกิน 5 นาทีจน cache หมดอายุ'

  return [
    `💰 ${title}`,
    '----------------------------------------',
    `📊 ${s.turns} turn | input ${n(s.input)} | output ${n(s.output)}`,
    `  ├─ อ่านจาก Cache (ถูก): ${n(s.cacheRead)} tokens`,
    `  ├─ เขียนเข้า Cache: ${n(s.cacheWrite)} tokens`,
    `  └─ Hit Rate: ${hitLight(rate)} ${rate.toFixed(1)}%`,
    '',
    '💵 ค่าใช้จ่ายโดยประมาณ:',
    `  ├─ รวมทั้งหมด: $${costUSD(s).toFixed(4)} (~${thb(costUSD(s))})`,
    `  ├─ ค่าเขียน Cache: ~${thb((s.cacheWrite / 1e6) * PRICE.cacheWrite)}`,
    `  └─ ประหยัดได้เพราะ cache: ~${thb(savedUSD(s))}`,
    '',
    `💡 ${advice}`,
  ].join('\n')
}

// ยอดสะสมทุก session เก็บใน $.store (อยู่ข้าม session และข้ามการ reload)
async function readLifetime($: EngineInterface): Promise<CacheStats> {
  const saved = await $.store.get('lifetime')
  return saved && typeof saved === 'object' ? { ...EMPTY, ...(saved as Partial<CacheStats>) } : { ...EMPTY }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    session = { ...EMPTY }
    await $.command.register({ name: 'cache', description: 'ดูรายงานค่า Prompt Cache เป็นบาท (/cache all, /cache clear)', argumentHint: '[all|clear]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: turn.complete - ได้ usage ของทั้ง turn (รวมทุก request ใน turn)
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage && !e.agentId) {
      // agentId มีค่า = turn ของ subagent; ที่นี่นับเฉพาะ turn หลัก
      session = add(session, usage)
      await $.store.set('lifetime', add(await readLifetime($), usage))

      const rate = hitRate(session)
      $.ui.status(`${hitLight(rate)} Cache ${rate.toFixed(0)}% | ${thb(costUSD(session))}`)
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: เตือนก่อน /clear - ดักคำสั่ง built-in แล้วปล่อยให้ทำงานต่อ
  // ==========================================================================
  on('command.run', { command: 'clear' }, ($, e, next) => {
    if (session.cacheRead + session.cacheWrite > 0) {
      $.ui.toast('⚠️ /clear ทำให้ cache ของบทสนทนานี้ใช้ต่อไม่ได้ ถ้ายังทำเรื่องเดิมอยู่ /compact คุ้มกว่า')
    }
    return next(e) // ต้อง next ไม่งั้น /clear จะไม่ทำงาน
  })

  on('command.run', { command: 'cache' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      session = { ...EMPTY }
      await $.store.delete('lifetime')
      $.ui.status(undefined)
      return { text: '🧹 ล้างสถิติ cache แล้ว' }
    }
    if (arg === 'all') return { text: buildReport('Cache Tax Report - สะสมทุก session', await readLifetime($)) }
    return { text: buildReport('Cache Tax Report - session นี้', session) }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ตั้งงบรายวัน: ถ้าเกิน 500 บาท ให้ $.ui.notify("ใช้เกินงบแล้ว!") เด้งแจ้งเตือนของระบบ
 * 2. ส่งยอดเข้าแชตทีม ด้วย $.http.fetch ไปยัง webhook ของ Slack/Discord/LINE Messaging API
 * 3. แยกราคาตาม usage.model เพราะแต่ละ model ราคาไม่เท่ากัน
 */
