/**
 * ============================================================================
 * MOD 100: Activity Calendar TH - ปฏิทินกิจกรรมแบบ GitHub ข้ามทุก session (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: mosaic (KOZMOS) และ heatmap ใน awesome-claude-code-mods
 *
 * 🎉 Mod ตัวที่ 100 ของ Claude Code Mods TH
 *
 * หน้าที่ของ Mod นี้:
 * 1. นับกิจกรรมรายวันข้ามทุก session: prompt, tool, ไฟล์ที่แก้, นาทีที่ Claude ทำงาน, ค่าใช้จ่าย
 * 2. /calendar เปิดแผงตารางแบบ GitHub contribution 26 สัปดาห์ สีเขียวเข้มตามความขยัน
 * 3. สถิติ: streak ปัจจุบัน, streak ยาวสุด, วันที่ขยันที่สุด, รวมทั้งหมด
 * 4. เปลี่ยนสิ่งที่นับได้: /calendar prompts | tools | edits | minutes | cost
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'activity-calendar-th'
const WEEKS = 26
const DAY_MS = 86_400_000

interface Day {
  prompts: number
  tools: number
  edits: number
  minutes: number
  cost: number
}

type Metric = keyof Day

const METRIC: Record<Metric, string> = { prompts: 'prompt', tools: 'tool', edits: 'การแก้ไฟล์', minutes: 'นาทีทำงาน', cost: 'ดอลลาร์' }
const SHADES = ['#2d333b', '#0e4429', '#006d32', '#26a641', '#39d353']
const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

let days: Record<string, Day> = {}
let metric: Metric = 'prompts'
let turnStart = 0
let sessionCost = 0

function key(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function empty(): Day {
  return { prompts: 0, tools: 0, edits: 0, minutes: 0, cost: 0 }
}

// ==========================================================================
// บทที่ 1: นับลงวันนี้
// ==========================================================================
async function bump($: EngineInterface, field: Metric, by = 1): Promise<void> {
  const k = key(await $.clock.now())
  const d = days[k] ?? empty()
  days[k] = { ...d, [field]: d[field] + by }
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('days', days)
}

// ==========================================================================
// บทที่ 2: ตารางและสถิติ
// ==========================================================================
function value(k: string): number {
  return days[k]?.[metric] ?? 0
}

function level(v: number, max: number): number {
  if (v <= 0) return 0
  return Math.min(4, Math.ceil((v / max) * 4))
}

// คืนวันจันทร์ของสัปดาห์แรกในตาราง
function gridStart(now: number): number {
  const d = new Date(new Date(now).toDateString()).getTime()
  const dow = (new Date(d).getDay() + 6) % 7 // จันทร์ = 0
  return d - dow * DAY_MS - (WEEKS - 1) * 7 * DAY_MS
}

function stats(now: number): { total: number; active: number; streak: number; longest: number; best?: [string, number] } {
  const keys = Object.keys(days).sort()
  let total = 0
  let active = 0
  let best: [string, number] | undefined
  for (const k of keys) {
    const v = value(k)
    total += v
    if (v > 0) active++
    if (v > 0 && (!best || v > best[1])) best = [k, v]
  }
  // streak: นับวันติดกันที่มีกิจกรรม (ใช้ prompt เป็นเกณฑ์ว่า "ได้ทำงาน")
  const worked = (ms: number): boolean => (days[key(ms)]?.prompts ?? 0) > 0
  let streak = 0
  let cursor = new Date(new Date(now).toDateString()).getTime()
  if (!worked(cursor)) cursor -= DAY_MS
  while (worked(cursor)) {
    streak++
    cursor -= DAY_MS
  }
  let longest = 0
  let run = 0
  let prev = 0
  for (const k of keys.filter(k => (days[k]?.prompts ?? 0) > 0)) {
    const t = new Date(`${k}T00:00:00`).getTime()
    run = prev && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }
  return { total, active, streak, longest, best }
}

function fmt(v: number): string {
  return metric === 'cost' ? `$${v.toFixed(2)}` : metric === 'minutes' ? `${Math.round(v)}` : String(v)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    days = ((await $.store.get('days')) as Record<string, Day> | undefined) ?? {}
    metric = ((await $.store.get('metric')) as Metric | undefined) ?? 'prompts'
    sessionCost = 0
    await $.command.register({ name: 'calendar', description: 'ปฏิทินกิจกรรมแบบ GitHub ข้ามทุก session + streak (/calendar help)', argumentHint: 'prompts|tools|edits|minutes|cost' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: เก็บตัวเลขจาก event
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') await bump($, 'prompts')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) {
      await bump($, 'tools')
      if (!r.isError && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit')) await bump($, 'edits')
    }
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turnStart = await $.clock.now()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && turnStart) {
      await bump($, 'minutes', ((await $.clock.now()) - turnStart) / 60_000)
      turnStart = 0
      await save($)
    }
    return r
  })

  // ค่าใช้จ่ายที่ engine รายงานเป็นยอดรวมของ session: บวกเฉพาะส่วนที่เพิ่มขึ้น
  on('session.measure', async ($, e, next) => {
    if (e.cost && e.cost.usd > sessionCost) {
      await bump($, 'cost', e.cost.usd - sessionCost)
      sessionCost = e.cost.usd
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await save($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: วาดตาราง 7 แถว × 26 สัปดาห์
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const start = gridStart(now)
    const today = key(now)
    const cells = Array.from({ length: WEEKS * 7 }, (_, i) => key(start + (Math.floor(i / 7) * 7 + (i % 7)) * DAY_MS))
    const max = Math.max(1, ...cells.map(value))
    // แถวชื่อเดือน: ใส่ชื่อเดือนที่คอลัมน์ที่ขึ้นเดือนใหม่
    let monthRow = ''
    let lastMonth = -1
    for (let w = 0; w < WEEKS; w++) {
      const m = new Date(start + w * 7 * DAY_MS).getMonth()
      if (m !== lastMonth && monthRow.length <= w * 2) {
        monthRow = monthRow.padEnd(w * 2) + MONTH[m]
        lastMonth = m
      }
    }
    const s = stats(now)
    return (
      <Box flexDirection="column">
        <Text dimColor>{`   ${monthRow}`}</Text>
        {DOW.map((label, row) => (
          <Text>
            <Text dimColor>{label.padEnd(3)}</Text>
            {Array.from({ length: WEEKS }, (_, w) => {
              const k = cells[w * 7 + row]!
              const future = k > today
              return <Text color={future ? '#1c2128' : SHADES[level(value(k), max)]}>{k === today ? '◆ ' : '■ '}</Text>
            })}
          </Text>
        ))}
        <Text>
          <Text dimColor>{'   น้อย '}</Text>
          {SHADES.map(c => (
            <Text color={c}>■ </Text>
          ))}
          <Text dimColor>{` มาก · นับ${METRIC[metric]}`}</Text>
        </Text>
        <Box flexDirection="column" marginTop={1}>
          <Text>{`🔥 streak ${s.streak} วัน · ยาวสุด ${s.longest} วัน · ทำงาน ${s.active} วัน`}</Text>
          <Text>{`📊 รวม ${fmt(s.total)} ${METRIC[metric]}${s.best ? ` · ขยันสุด ${s.best[0]} (${fmt(s.best[1])})` : ''}`}</Text>
          <Text dimColor>🎉 Mod ที่ 100 · ขอบคุณที่ใช้ Claude Code Mods TH 🇹🇭</Text>
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'calendar' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub in METRIC) {
      metric = sub as Metric
      await $.store.set('metric', metric)
    } else if (sub) {
      return { text: '📅 Activity Calendar TH (Mod 100)\n/calendar                เปิดปฏิทินกิจกรรม 26 สัปดาห์\n/calendar prompts|tools|edits|minutes|cost   เลือกสิ่งที่นับ' }
    }
    await save($)
    await $.ui.open({ id: PANE, title: '📅 ปฏิทินกิจกรรม' })
    $.ui.invalidate('ui.render')
    const s = stats(await $.clock.now())
    return { text: `📅 นับ${METRIC[metric]} · 🔥 streak ${s.streak} วัน (ยาวสุด ${s.longest}) · รวม ${fmt(s.total)} · ทำงาน ${s.active} วัน` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. แยกตามโปรเจกต์: เก็บ cwd ด้วย แล้วกรองดูทีละโปรเจกต์
 * 2. ส่งออกเป็นรูป SVG ไว้แปะ README ของโปรไฟล์ GitHub
 * 3. เตือนตอนค่ำถ้าวันนี้ยังไม่ได้ทำงาน จะได้ไม่เสีย streak (ต่อกับ Mod 96)
 */
