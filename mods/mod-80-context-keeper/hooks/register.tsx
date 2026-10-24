/**
 * ============================================================================
 * MOD 80: Context Keeper TH - เฝ้า context และ prompt cache (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: cache-clock, compact-adviser, auto-handoff ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. แถบเหนือช่องพิมพ์: context ใช้ไปกี่ % และ prompt cache จะเย็นในอีกกี่นาที
 * 2. ที่ปรึกษา compact: พอ context เกินเกณฑ์ (ค่าเริ่มต้น 70%) แนะนำให้ /compact ตอนงานจบช่วง
 *    ไม่ใช่กลางงาน และ /ctx compact สั่ง compact พร้อมบอกว่าให้เก็บอะไรไว้
 * 3. ส่งต่องาน (handoff): ให้ fork ของ session เขียนบันทึกส่งต่องานลง .claude/handoff.md
 *    fork อ่าน transcript เดิมจาก cache จึงถูกกว่าการสรุปใหม่ทั้งหมด
 *    แล้ว /clear + /ctx resume เพื่อเริ่ม session สะอาดที่รู้งานเดิม
 * 4. โหมดอัตโนมัติ: เมื่อเกินเกณฑ์ handoff (ค่าเริ่มต้น 85%) เขียนบันทึกให้เองครั้งเดียว
 *
 * ตัวเลข context มาจาก event session.measure ของ engine เวลา cache นับจากคำตอบล่าสุด
 * (cache ของ Claude อยู่ 5 นาที หรือ 1 ชั่วโมงถ้าเปิดแบบยาว ตั้งได้ด้วย /ctx ttl)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const HANDOFF_FILE = '.claude/handoff.md'

let settings = { band: true, warn: 70, handoffAt: 85, auto: false, ttl: 5 }
let percent: number | undefined
let tokens: number | undefined
let windowSize = 0
let working = false
let lastReplyAt = 0
// เตือนไปแล้วหรือยังใน session นี้ (กันเด้งซ้ำทุก turn)
let warned = false
let autoDone = false
let ticker: Timer | undefined

// ==========================================================================
// บทที่ 1: สีและหลอดตามระดับ context
// ==========================================================================
function color(p: number): string {
  if (p >= settings.handoffAt) return '#e53935'
  if (p >= settings.warn) return '#fb8c00'
  if (p >= 50) return '#fdd835'
  return '#7cb342'
}

function bar(p: number, width = 12): string {
  const filled = Math.round((Math.min(100, Math.max(0, p)) / 100) * width)
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ==========================================================================
// บทที่ 2: นาฬิกา cache - นับถอยหลังจากคำตอบล่าสุด
// ==========================================================================
function cacheLeft(now: number): number | undefined {
  if (working || lastReplyAt === 0) return undefined
  return lastReplyAt + settings.ttl * 60_000 - now
}

function startTicker($: EngineInterface): void {
  ticker?.cancel()
  // วาดใหม่ทุก 5 วินาทีพอให้ตัวเลขนับถอยหลังขยับ ไม่ถี่จนเปลือง
  ticker = $.clock.every(5_000, () => {
    if (!working && lastReplyAt > 0) $.ui.invalidate('ui.render')
  })
}

// ==========================================================================
// บทที่ 3: เขียนบันทึกส่งต่องานด้วย fork ของ session
// ==========================================================================
const HANDOFF_PROMPT = `เขียน "บันทึกส่งต่องาน" ให้ Claude ตัวใหม่ที่จะเริ่ม session สะอาดแล้วทำงานนี้ต่อได้ทันที
ใช้ภาษาไทย รูปแบบ Markdown หัวข้อตามนี้ (ข้ามหัวข้อที่ไม่มีเนื้อหา):
## เป้าหมาย
## ทำเสร็จแล้ว
## ไฟล์ที่เกี่ยวข้อง (path จริง และแก้อะไรไป)
## กำลังทำ / ขั้นต่อไป
## ข้อตกลงและข้อควรระวัง (สิ่งที่ผู้ใช้สั่งหรือไม่ชอบ)
ไม่เกิน 40 บรรทัด เขียนเฉพาะข้อเท็จจริงจากบทสนทนานี้ ตอบเป็นบันทึกอย่างเดียว ไม่ต้องเกริ่น`

async function root($: EngineInterface): Promise<string> {
  return (await $.session.cwd()).replace(/[\\/]$/, '')
}

async function writeHandoff($: EngineInterface): Promise<string> {
  const r = await $.model.fork({ prompt: HANDOFF_PROMPT })
  if (!r.isAnswered) return `❌ เขียนบันทึกไม่สำเร็จ (${r.reason === 'nothing-to-fork' ? 'ยังไม่มีบทสนทนาให้สรุป' : r.reason})`
  const now = new Date(await $.clock.now())
  const body = `<!-- handoff จาก Context Keeper TH · ${now.toLocaleString('th-TH')} · context ${percent ?? '?'}% -->\n${r.text.trim()}\n`
  const path = `${await root($)}/${HANDOFF_FILE}`
  await $.fs.write(path, body)
  return `📝 เขียนบันทึกส่งต่องานแล้ว: ${HANDOFF_FILE}\nขั้นต่อไป: พิมพ์ /clear แล้ว /ctx resume เพื่อเริ่มใหม่โดยรู้งานเดิม`
}

// ==========================================================================
// บทที่ 4: ตรวจเกณฑ์ตอนจบ turn (จุดที่ compact ได้ปลอดภัยที่สุด)
// ==========================================================================
async function checkThresholds($: EngineInterface): Promise<void> {
  if (percent === undefined) return
  if (settings.auto && !autoDone && percent >= settings.handoffAt) {
    autoDone = true
    const msg = await writeHandoff($)
    $.ui.toast(`🧠 context ${percent}% ${msg}`, { timeoutMs: 20_000 })
    return
  }
  if (!warned && percent >= settings.warn) {
    warned = true
    $.ui.toast(`🧠 context ใช้ไป ${percent}% แล้ว ถ้างานช่วงนี้จบแล้ว ลอง /ctx compact หรือ /ctx handoff`, { timeoutMs: 15_000 })
  }
}

function summary(now: number): string {
  const lines = ['🧠 Context Keeper TH (Mod 80)', '========================================']
  if (percent === undefined) lines.push('⏳ ยังไม่มีตัวเลข รอคำตอบแรกของ Claude ก่อนนะ')
  else lines.push(`context  ${bar(percent, 20)} ${percent}%  (${(tokens ?? 0).toLocaleString('en-US')} / ${windowSize.toLocaleString('en-US')} tokens)`)
  const left = cacheLeft(now)
  if (left !== undefined) lines.push(left > 0 ? `cache    อุ่นอยู่ เย็นในอีก ${clock(left)} (ttl ${settings.ttl} นาที)` : `cache    ❄️ เย็นแล้ว ข้อความถัดไปจะอ่าน context ใหม่ทั้งหมด (แพงขึ้น)`)
  lines.push(`เกณฑ์    เตือน ${settings.warn}% · handoff ${settings.handoffAt}% · อัตโนมัติ ${settings.auto ? 'เปิด' : 'ปิด'}`)
  return lines.join('\n')
}

const HELP = `🧠 Context Keeper TH (Mod 80)
========================================
/ctx                     ดู context และเวลา cache
/ctx compact [สิ่งที่ต้องเก็บ]   compact ตอนนี้ เช่น /ctx compact เก็บแผนและไฟล์ที่แก้
/ctx handoff             เขียนบันทึกส่งต่องานลง ${HANDOFF_FILE}
/ctx resume              ใส่บันทึกส่งต่องานลงช่องพิมพ์ (ใช้หลัง /clear)
/ctx auto on|off         เขียน handoff ให้เองเมื่อถึงเกณฑ์
/ctx warn 70 85          ตั้งเกณฑ์เตือนและเกณฑ์ handoff (%)
/ctx ttl 5|60            อายุ prompt cache (นาที)
/ctx band on|off         แถบเหนือช่องพิมพ์`

async function save($: EngineInterface): Promise<void> {
  await $.store.set('settings', settings)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = { ...settings, ...((await $.store.get('settings')) as Partial<typeof settings> | undefined) }
    warned = false
    autoDone = false
    working = false
    lastReplyAt = 0
    await $.command.register({ name: 'ctx', description: 'เฝ้า context และ prompt cache: compact, handoff, resume (/ctx help)', argumentHint: 'compact | handoff | resume | auto on|off | warn | ttl' })
    startTicker($)
    // มีบันทึกส่งต่องานค้างจากรอบก่อน? บอกให้รู้
    const path = `${await root($)}/${HANDOFF_FILE}`
    if (await $.fs.exists(path)) $.ui.toast(`📝 มีบันทึกส่งต่องาน ${HANDOFF_FILE} อยู่ พิมพ์ /ctx resume เพื่อทำงานต่อ`, { timeoutMs: 10_000 })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: รับตัวเลขจาก engine + ดูว่า Claude ทำงานอยู่ไหม
  // ==========================================================================
  on('session.measure', async ($, e, next) => {
    percent = e.context.percent
    tokens = e.context.tokens
    windowSize = e.context.window
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    working = false
    lastReplyAt = await $.clock.now()
    if (e.reason === 'answer') await checkThresholds($)
    $.ui.invalidate('ui.render')
    return r
  })

  // หลัง compact ตัวเลขเดิมใช้ไม่ได้แล้ว เริ่มนับเตือนใหม่
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      warned = false
      autoDone = false
    }
    return r
  })

  // ==========================================================================
  // บทที่ 6: แถบเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!settings.band || e.props.hasSurvey || percent === undefined) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const left = cacheLeft(await $.clock.now())
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          <Text dimColor>🧠 context </Text>
          <Text color={color(percent)}>{bar(percent)}</Text>
          <Text color={color(percent)}> {percent}%</Text>
          {left !== undefined && (left > 0 ? <Text color={left < 60_000 ? '#fb8c00' : '#4fc3f7'}>{`  ☕ cache เย็นใน ${clock(left)}`}</Text> : <Text color="#90a4ae">{'  ❄️ cache เย็นแล้ว'}</Text>)}
          {percent >= settings.warn && <Text dimColor>{'  · /ctx compact หรือ /ctx handoff'}</Text>}
        </Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 7: คำสั่ง /ctx
  // ==========================================================================
  on('command.run', { command: 'ctx' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '':
        if (percent === undefined) {
          const u = await $.session.usage().catch(() => undefined)
          if (u) {
            percent = u.context.percent
            tokens = u.context.tokens
            windowSize = u.context.window
          }
        }
        return { text: summary(await $.clock.now()) }
      case 'compact': {
        const instructions = rest.join(' ') || undefined
        const r = await $.session.compact(instructions ? { instructions } : undefined).catch((err: unknown) => ({ error: String(err) }))
        if ('error' in r) return { text: `❌ compact ไม่ได้ตอนนี้ (รอ Claude ทำงานเสร็จก่อน): ${r.error}` }
        if ('skip' in r && r.skip) return { text: `⏸ มี mod อื่นขอข้าม compact: ${r.skip}` }
        return { text: `✅ compact แล้ว${instructions ? ` (เก็บ: ${instructions})` : ''}` }
      }
      case 'handoff':
        return { text: await writeHandoff($) }
      case 'resume': {
        const path = `${await root($)}/${HANDOFF_FILE}`
        if (!(await $.fs.exists(path))) return { text: `ไม่พบ ${HANDOFF_FILE} สร้างด้วย /ctx handoff ก่อน` }
        const note = (await $.fs.read(path)).replace(/^<!--.*?-->\n/, '')
        const filled = await $.prompt.fill({ text: `ทำงานต่อจากบันทึกส่งต่องานนี้ (อ่านไฟล์ที่เกี่ยวข้องก่อนแก้):\n\n${note}` })
        return { text: filled.isFilled ? '📋 ใส่บันทึกลงช่องพิมพ์แล้ว ตรวจแล้วกด Enter ได้เลย' : `📋 บันทึกส่งต่องาน:\n\n${note}` }
      }
      case 'auto':
        if (rest[0] !== 'on' && rest[0] !== 'off') return { text: 'วิธีใช้: /ctx auto on|off' }
        settings = { ...settings, auto: rest[0] === 'on' }
        await save($)
        return { text: `🤖 handoff อัตโนมัติที่ ${settings.handoffAt}%: ${settings.auto ? 'เปิด' : 'ปิด'}` }
      case 'warn': {
        const [w, h] = rest.map(Number)
        if (!(w! > 0 && w! < 100) || (h !== undefined && !(h > w! && h <= 100))) return { text: `วิธีใช้: /ctx warn 70 85  (ตอนนี้ ${settings.warn}% / ${settings.handoffAt}%)` }
        settings = { ...settings, warn: w!, handoffAt: h ?? settings.handoffAt }
        warned = false
        await save($)
        return { text: `🔔 เตือนที่ ${settings.warn}% · handoff ที่ ${settings.handoffAt}%` }
      }
      case 'ttl': {
        const m = Number(rest[0])
        if (m !== 5 && m !== 60) return { text: `วิธีใช้: /ctx ttl 5|60  (ตอนนี้ ${settings.ttl} นาที)` }
        settings = { ...settings, ttl: m }
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `☕ นับอายุ cache ${m} นาที` }
      }
      case 'band':
        if (rest[0] !== 'on' && rest[0] !== 'off') return { text: 'วิธีใช้: /ctx band on|off' }
        settings = { ...settings, band: rest[0] === 'on' }
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `แถบเหนือช่องพิมพ์: ${settings.band ? 'แสดง' : 'ซ่อน'}` }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เตือนก่อน cache เย็น 1 นาที ด้วยเสียง (ดู $.audio.play ใน Mod 45)
 * 2. แสดงว่าอะไรกิน context มากที่สุดด้วย $.session.usage({ breakdown: 'summary' })
 * 3. ใส่ handoff เข้า Mod 52 Project Memory ให้จำข้าม session อัตโนมัติ
 */
