/**
 * ============================================================================
 * MOD 24: App Scheduler TH - ตั้งเวลาเปิดเว็บ แอป หรือไฟล์อัตโนมัติ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: นาฬิกาปลุก และ Task Scheduler ของ Windows
 *
 * หน้าที่ของ Mod นี้:
 * 1. ตั้งเวลาเปิดเว็บ (URL), แอป หรือไฟล์: ทุกวัน, วันทำงาน, วันที่เลือก หรือครั้งเดียว
 * 2. มีเว็บยอดนิยมให้เลือก (preset) เช่น gmail, youtube, line, tradingview
 * 3. เช็คทุก 30 วินาที ถึงเวลาก็เปิดให้และเด้งบอก
 * 4. สั่งเปิดทันทีได้ ดูรอบถัดไป เปิด/ปิด/ลบรายการได้
 *
 * ข้อจำกัด: ทำงานเฉพาะตอนเปิด Claude Code อยู่ (Mod ไม่มีโปรแกรมเบื้องหลังของตัวเอง)
 * ถ้าต้องการให้เปิดแม้ไม่ได้เปิด Claude Code ใช้ Task Scheduler ของ Windows หรือ cron แทน
 *
 * หมายเหตุ: ใช้ชื่อ /autoopen เพราะ /schedule เป็นคำสั่งที่มีอยู่แล้ว
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

type Repeat = { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'days'; days: number[] } | { kind: 'once'; date: string }
interface Job {
  id: number
  name: string
  target: string
  time: string // "09:00"
  repeat: Repeat
  enabled: boolean
  nextRun: number // ms
  runs: number
}

const PRESETS: Record<string, string> = {
  gmail: 'https://mail.google.com',
  youtube: 'https://www.youtube.com',
  line: 'https://chat.line.biz',
  facebook: 'https://www.facebook.com',
  shopee: 'https://shopee.co.th',
  tradingview: 'https://www.tradingview.com',
  notion: 'https://www.notion.so',
  calendar: 'https://calendar.google.com',
  github: 'https://github.com',
}
const DAY_NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, อา: 0, จ: 1, อ: 2, พ: 3, พฤ: 4, ศ: 5, ส: 6 }
const DAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

let jobs: Job[] = []
let nextId = 0
let loop: Timer | undefined
let isWindows = false
let isMac = false

// ==========================================================================
// บทที่ 1: คำนวณเวลารอบถัดไป (เวลาท้องถิ่นของเครื่อง)
// ==========================================================================
function nextRunOf(job: Pick<Job, 'time' | 'repeat'>, after: number): number {
  const [h = 0, m = 0] = job.time.split(':').map(Number)
  if (job.repeat.kind === 'once') {
    const [y = 1970, mo = 1, d = 1] = job.repeat.date.split('-').map(Number)
    const at = new Date(y, mo - 1, d, h, m).getTime()
    return at > after ? at : 0 // 0 = ผ่านไปแล้ว ไม่มีรอบต่อไป
  }
  const start = new Date(after)
  for (let add = 0; add <= 7; add++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + add, h, m)
    if (day.getTime() <= after) continue
    const dow = day.getDay()
    const ok = job.repeat.kind === 'daily' || (job.repeat.kind === 'weekdays' && dow >= 1 && dow <= 5) || (job.repeat.kind === 'days' && job.repeat.days.includes(dow))
    if (ok) return day.getTime()
  }
  return 0
}

function repeatText(r: Repeat): string {
  if (r.kind === 'daily') return 'ทุกวัน'
  if (r.kind === 'weekdays') return 'จ-ศ'
  if (r.kind === 'days') return r.days.map(d => DAY_TH[d]).join(',')
  return `ครั้งเดียว ${r.date}`
}

function when(ms: number): string {
  if (!ms) return '-'
  const d = new Date(ms)
  return `${DAY_TH[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "weekdays 09:00", "daily 18:30", "mon,wed 07:00", "once 2026-12-31 23:59", "once 14:30"
function parseWhen(words: string[], now: number): { time: string; repeat: Repeat } | string {
  const [kind = '', a, b] = words
  const isTime = (t?: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t ?? '')
  if ((kind === 'daily' || kind === 'weekdays') && isTime(a)) return { time: a ?? '', repeat: { kind } }
  if (kind === 'once') {
    if (isTime(a)) {
      // ไม่ใส่วันที่ = วันนี้ (ถ้าเลยเวลาแล้ว = พรุ่งนี้)
      const [h = 0, m = 0] = (a ?? '').split(':').map(Number)
      const today = new Date(now)
      const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m)
      if (at.getTime() <= now) at.setDate(at.getDate() + 1)
      return { time: a ?? '', repeat: { kind: 'once', date: `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}` } }
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(a ?? '') && isTime(b)) return { time: b ?? '', repeat: { kind: 'once', date: a ?? '' } }
  }
  const days = kind.split(',').map(d => DAY_NAMES[d.toLowerCase()])
  if (days.length && days.every(d => d !== undefined) && isTime(a)) return { time: a ?? '', repeat: { kind: 'days', days: days as number[] } }
  return 'รูปแบบเวลาไม่ถูก ใช้: daily 09:00 | weekdays 09:00 | mon,wed 18:00 | once 14:30 | once 2026-12-31 23:59'
}

// ==========================================================================
// บทที่ 2: เปิดเว็บ/แอป/ไฟล์ด้วยโปรแกรมของระบบ (ส่ง target ผ่าน env กันคำสั่งแทรก)
// ==========================================================================
async function openTarget($: EngineInterface, target: string): Promise<void> {
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:AS_TARGET"]
    : isMac
      ? ['open', target]
      : ['xdg-open', target]
  const run = await $.process.run(argv, { env: { AS_TARGET: target }, timeoutMs: 20_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `exit ${run.exitCode}`)
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('jobs', { jobs, nextId })
}

// ==========================================================================
// บทที่ 3: วนเช็คทุก 30 วินาที - ถึงเวลาแล้วเปิด แล้วคำนวณรอบถัดไป
// ==========================================================================
async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  let changed = false
  for (const job of jobs) {
    if (!job.enabled || !job.nextRun || job.nextRun > now) continue
    // พลาดไปนานเกิน 10 นาที (เช่น ปิดเครื่องไว้) ไม่เปิดย้อนหลัง แค่เลื่อนไปรอบถัดไป
    if (now - job.nextRun < 10 * 60_000) {
      try {
        await openTarget($, job.target)
        job.runs++
        $.ui.toast(`⏰ เปิด ${job.name} ตามเวลา ${job.time}`)
      } catch (err) {
        $.ui.toast(`❌ เปิด ${job.name} ไม่ได้: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    job.nextRun = nextRunOf(job, now)
    if (!job.nextRun) job.enabled = false // ครั้งเดียวเสร็จแล้ว
    changed = true
  }
  if (changed) await save($)
}

function listText(): string {
  if (jobs.length === 0) return '⏰ ยังไม่มีรายการ ลอง /autoopen add gmail weekdays 09:00'
  return ['⏰ ตารางเปิดอัตโนมัติ', '----------------------------------------', ...jobs.map(j => `${j.enabled ? '🟢' : '⚪'} #${j.id} ${j.name.padEnd(12)} ${j.time} ${repeatText(j.repeat).padEnd(10)} ถัดไป ${when(j.nextRun)}  (เปิดแล้ว ${j.runs} ครั้ง)\n     ${j.target}`)].join('\n')
}

const HELP = `⏰ App Scheduler TH (Mod 24)
========================================
/autoopen add <ชื่อ|preset> [เว็บ/ไฟล์/แอป] <เวลา>
   เช่น /autoopen add gmail weekdays 09:00
        /autoopen add งาน https://notion.so daily 08:30
        /autoopen add รายงาน C:\\work\\report.xlsx mon,fri 09:00
        /autoopen add ประชุม https://meet.google.com once 14:30
   เวลา: daily HH:MM | weekdays HH:MM | mon,wed HH:MM | once HH:MM | once YYYY-MM-DD HH:MM
/autoopen list | next
/autoopen run <id>          เปิดเดี๋ยวนี้
/autoopen on <id> | off <id> | delete <id>
/autoopen presets
⚠️ ทำงานเฉพาะตอนเปิด Claude Code อยู่`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    const saved = (await $.store.get('jobs')) as { jobs?: Job[]; nextId?: number } | undefined
    jobs = saved?.jobs ?? []
    nextId = saved?.nextId ?? 0
    // รอบที่ผ่านไปตอนปิด Claude Code -> คำนวณรอบใหม่
    const now = await $.clock.now()
    for (const j of jobs) if (j.enabled && j.nextRun && now - j.nextRun > 10 * 60_000) j.nextRun = nextRunOf(j, now)
    loop?.cancel()
    loop = $.clock.every(30_000, () => void tick($))
    await $.command.register({ name: 'autoopen', description: 'ตั้งเวลาเปิดเว็บ แอป หรือไฟล์อัตโนมัติ (/autoopen help)', argumentHint: 'add|list|run|on|off|delete' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /autoopen
  // ==========================================================================
  on('command.run', { command: 'autoopen' }, async ($, e) => {
    const [sub = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    const find = (arg?: string) => jobs.find(j => j.id === Number(arg))

    switch (sub) {
      case 'add': {
        const [name = '', ...more] = rest
        // คำถัดจากชื่อเป็นคำบอกเวลา (daily, weekdays, once, mon,wed) = ไม่ได้ใส่ target มา -> ใช้ preset
        const startsWithWhen = /^(daily|weekdays|once)$/i.test(more[0] ?? '') || (more[0] ?? '').split(',').every(d => DAY_NAMES[d.toLowerCase()] !== undefined)
        const preset = PRESETS[name.toLowerCase()]
        const target = preset && startsWithWhen ? preset : more.shift()
        if (!name || !target) return { text: HELP }
        const parsed = parseWhen(more, now)
        if (typeof parsed === 'string') return { text: `❌ ${parsed}` }
        const job: Job = { id: nextId++, name, target, ...parsed, enabled: true, nextRun: nextRunOf(parsed, now), runs: 0 }
        if (!job.nextRun) return { text: '❌ เวลานั้นผ่านไปแล้ว' }
        jobs.push(job)
        await save($)
        return { text: `✅ #${job.id} เปิด ${name} ${repeatText(job.repeat)} ${job.time}\n   ครั้งถัดไป ${when(job.nextRun)}\n   ${target}` }
      }
      case 'list':
        return { text: listText() }
      case 'next': {
        const upcoming = jobs.filter(j => j.enabled && j.nextRun).sort((a, b) => a.nextRun - b.nextRun)[0]
        if (!upcoming) return { text: 'ไม่มีรายการที่รออยู่' }
        const mins = Math.round((upcoming.nextRun - now) / 60_000)
        return { text: `⏭️ ถัดไป: ${upcoming.name} ${when(upcoming.nextRun)} (อีก ${mins < 60 ? `${mins} นาที` : `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`})` }
      }
      case 'run': {
        const job = find(rest[0])
        if (!job) return { text: `❌ ไม่พบ #${rest[0] ?? ''}` }
        try {
          await openTarget($, job.target)
          job.runs++
          await save($)
          return { text: `🚀 เปิด ${job.name} แล้ว` }
        } catch (err) {
          return { text: `❌ เปิดไม่ได้: ${err instanceof Error ? err.message : String(err)}` }
        }
      }
      case 'on':
      case 'off': {
        const job = find(rest[0])
        if (!job) return { text: `❌ ไม่พบ #${rest[0] ?? ''}` }
        job.enabled = sub === 'on'
        if (job.enabled) job.nextRun = nextRunOf(job, now)
        await save($)
        return { text: `${job.enabled ? '🟢 เปิด' : '⚪ ปิด'} #${job.id} ${job.name}${job.enabled ? ` ถัดไป ${when(job.nextRun)}` : ''}` }
      }
      case 'delete': {
        const job = find(rest[0])
        if (!job) return { text: `❌ ไม่พบ #${rest[0] ?? ''}` }
        jobs = jobs.filter(j => j !== job)
        await save($)
        return { text: `🗑️ ลบ #${job.id} ${job.name} แล้ว` }
      }
      case 'presets':
        return { text: ['📌 Preset (ใช้ชื่อแทน URL ได้เลย)', ...Object.entries(PRESETS).map(([k, v]) => `  ${k.padEnd(12)} ${v}`)].join('\n') }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้ทำงานแม้ไม่ได้เปิด Claude Code: สร้าง Task ใน Windows ด้วย $.process.run(['schtasks', '/Create', ...])
 * 2. เปิดหลายอย่างพร้อมกันเป็นชุด เช่น "เริ่มงาน" = Gmail + Notion + Calendar
 * 3. ส่งแจ้งเตือนไปมือถือก่อนถึงเวลา 5 นาที (ต่อกับ Mod 22)
 */
