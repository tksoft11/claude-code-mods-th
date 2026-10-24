/**
 * ============================================================================
 * MOD 43: Timer TH - จับเวลาหลายตัวพร้อมกัน + บันทึกเวลาทำงาน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: นาฬิกาจับเวลาบนมือถือ และ Toggl Track
 *
 * หน้าที่ของ Mod นี้:
 * 1. นับถอยหลังหลายตัวพร้อมกัน เช่น "ต้มมาม่า 3m", "ประชุม 1h" ครบแล้วเด้งเตือน
 * 2. จับเวลาเดินหน้า (stopwatch) หยุดชั่วคราว/ต่อได้
 * 3. บันทึกเวลาทำงานแยกโปรเจกต์ แล้วสรุปรายวัน/รายสัปดาห์
 * 4. แผงแสดงทุกตัวแบบสด (timer วิ่งเฉพาะตอนมีตัวจับเวลาทำงานอยู่)
 *
 * หมายเหตุ: Mod 31 มี Pomodoro อยู่แล้ว ตัวนี้เน้นจับเวลาทั่วไปและเก็บสถิติงาน
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Clock {
  name: string
  kind: 'countdown' | 'stopwatch' | 'work'
  startedAt: number
  durationMs?: number // countdown เท่านั้น
  pausedAt?: number
  pausedTotal: number
}
interface WorkLog {
  project: string
  start: number
  end: number
}

const PANE = 'timer-th'
let clocks: Clock[] = []
let logs: WorkLog[] = []
let ticker: Timer | undefined

// ==========================================================================
// บทที่ 1: อ่านระยะเวลาแบบคน: 90s, 25m, 1h30m, 1:30:00
// ==========================================================================
function parseDuration(text: string): number | undefined {
  const colon = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text)
  if (colon) return ((Number(colon[1] ?? 0) * 60 + Number(colon[2])) * 60 + Number(colon[3])) * 1000
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text)
  if (!m || !text) return undefined
  const ms = ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000
  return ms > 0 ? ms : undefined
}

function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// เวลาที่เดินไปแล้ว (หักช่วงที่หยุดชั่วคราว)
function elapsed(c: Clock, now: number): number {
  return (c.pausedAt ?? now) - c.startedAt - c.pausedTotal
}

function line(c: Clock, now: number): string {
  const icon = c.kind === 'countdown' ? '⏳' : c.kind === 'work' ? '💼' : '⏱️'
  const value = c.kind === 'countdown' ? hms((c.durationMs ?? 0) - elapsed(c, now)) : hms(elapsed(c, now))
  return `${icon} ${c.name.padEnd(16)} ${value}${c.pausedAt ? ' ⏸️' : ''}`
}

// ==========================================================================
// บทที่ 2: tick ทุก 1 วิ - เช็ค countdown ที่ครบ แล้ววาดแผงใหม่
// ==========================================================================
function ensureTicker($: EngineInterface): void {
  if (clocks.length === 0) {
    ticker?.cancel()
    ticker = undefined
    return
  }
  if (!ticker) ticker = $.clock.every(1000, () => void tick($))
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const done = clocks.filter(c => c.kind === 'countdown' && !c.pausedAt && elapsed(c, now) >= (c.durationMs ?? 0))
  if (done.length) clocks = clocks.filter(c => !done.includes(c))
  ensureTicker($)
  $.ui.invalidate('ui.render')
  for (const c of done) {
    $.ui.toast(`⏰ หมดเวลา: ${c.name}`, { timeoutMs: 15_000 })
    // แจ้งเตือนของระบบ (บางที่ไม่มี เช่นตอนรันเทสต์) - พลาดก็ไม่เป็นไร
    try {
      void $.ui.notify(`หมดเวลา: ${c.name}`, { title: 'Timer' }).catch(() => undefined)
    } catch {}
  }
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('timer', { logs: logs.slice(-2000) })
}

// ==========================================================================
// บทที่ 3: รายงานเวลาทำงานแยกโปรเจกต์
// ==========================================================================
function report(now: number, days: number): string {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const inRange = logs.filter(l => l.end >= start.getTime())
  const byProject = new Map<string, number>()
  for (const l of inRange) byProject.set(l.project, (byProject.get(l.project) ?? 0) + (l.end - Math.max(l.start, start.getTime())))
  const total = [...byProject.values()].reduce((s, v) => s + v, 0)
  if (total === 0) return `📊 ${days === 1 ? 'วันนี้' : `${days} วันล่าสุด`} ยังไม่มีบันทึก (เริ่มด้วย /timer work <โปรเจกต์>)`
  const rows = [...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([p, ms]) => `  ${p.padEnd(16)} ${hms(ms).padStart(8)}  ${'█'.repeat(Math.max(1, Math.round((ms / total) * 20)))}`)
  return [`📊 เวลาทำงาน${days === 1 ? 'วันนี้' : ` ${days} วันล่าสุด`} รวม ${hms(total)}`, ...rows].join('\n')
}

const HELP = `⏱️ Timer TH (Mod 43)
========================================
/timer start <ชื่อ> <เวลา>   นับถอยหลัง เวลา: 90s 25m 1h30m 1:30:00
/timer stopwatch <ชื่อ>       จับเวลาเดินหน้า
/timer work <โปรเจกต์>        เริ่มบันทึกเวลาทำงาน
/timer stop <ชื่อ> | stop all  หยุด (งานจะถูกบันทึก)
/timer pause <ชื่อ> | resume <ชื่อ>
/timer | list                 ดูทั้งหมด + เปิดแผง
/timer report [today|week]    สรุปเวลาทำงานแยกโปรเจกต์`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('timer')) as { logs?: WorkLog[] } | undefined
    logs = saved?.logs ?? []
    clocks = []
    await $.command.register({ name: 'timer', description: 'จับเวลาหลายตัว นับถอยหลัง stopwatch และบันทึกเวลาทำงาน (/timer help)', argumentHint: 'start|stopwatch|work|stop|pause|report' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงแสดงตัวจับเวลา
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column">
        {clocks.length === 0 && <Text dimColor>ไม่มีตัวจับเวลา /timer start มาม่า 3m</Text>}
        {clocks.map(c => (
          <Text color={c.kind === 'countdown' && (c.durationMs ?? 0) - elapsed(c, now) < 60_000 ? '#e53935' : undefined}>{line(c, now)}</Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'timer' }, async ($, e) => {
    const [sub = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    const find = (name: string) => clocks.find(c => c.name === name)

    const add = async (c: Clock, msg: string) => {
      if (find(c.name)) return { text: `ℹ️ มี "${c.name}" อยู่แล้ว (/timer stop ${c.name})` }
      clocks.push(c)
      ensureTicker($)
      await $.ui.open({ id: PANE, title: '⏱️ Timer' })
      $.ui.invalidate('ui.render')
      return { text: msg }
    }

    switch (sub) {
      case 'start': {
        const duration = parseDuration(rest.at(-1) ?? '')
        const name = rest.slice(0, -1).join(' ')
        if (!duration || !name) return { text: 'วิธีใช้: /timer start มาม่า 3m  (90s 25m 1h30m 1:30:00)' }
        return add({ name, kind: 'countdown', startedAt: now, durationMs: duration, pausedTotal: 0 }, `⏳ เริ่มนับถอยหลัง "${name}" ${hms(duration)}`)
      }
      case 'stopwatch': {
        const name = rest.join(' ') || 'stopwatch'
        return add({ name, kind: 'stopwatch', startedAt: now, pausedTotal: 0 }, `⏱️ เริ่มจับเวลา "${name}"`)
      }
      case 'work': {
        const name = rest.join(' ')
        if (!name) return { text: 'วิธีใช้: /timer work เว็บลูกค้า A' }
        // ทำงานได้ทีละโปรเจกต์: เริ่มอันใหม่ = ปิดอันเก่าแล้วบันทึก
        const current = clocks.find(c => c.kind === 'work')
        if (current) {
          logs.push({ project: current.name, start: current.startedAt, end: now - current.pausedTotal })
          clocks = clocks.filter(c => c !== current)
          await save($)
        }
        return add({ name, kind: 'work', startedAt: now, pausedTotal: 0 }, `💼 เริ่มบันทึกเวลา "${name}"${current ? ` (บันทึก "${current.name}" ${hms(elapsed(current, now))} แล้ว)` : ''}`)
      }
      case 'stop': {
        const targets = rest[0] === 'all' ? [...clocks] : clocks.filter(c => c.name === rest.join(' '))
        if (targets.length === 0) return { text: `❌ ไม่พบ "${rest.join(' ')}"` }
        const lines: string[] = []
        for (const c of targets) {
          lines.push(`⏹️ ${c.name} ${hms(elapsed(c, now))}`)
          if (c.kind === 'work') logs.push({ project: c.name, start: c.startedAt, end: (c.pausedAt ?? now) - c.pausedTotal })
        }
        clocks = clocks.filter(c => !targets.includes(c))
        await save($)
        ensureTicker($)
        $.ui.invalidate('ui.render')
        return { text: lines.join('\n') }
      }
      case 'pause':
      case 'resume': {
        const c = find(rest.join(' '))
        if (!c) return { text: `❌ ไม่พบ "${rest.join(' ')}"` }
        if (sub === 'pause' && !c.pausedAt) c.pausedAt = now
        if (sub === 'resume' && c.pausedAt) {
          c.pausedTotal += now - c.pausedAt
          c.pausedAt = undefined
        }
        $.ui.invalidate('ui.render')
        return { text: `${sub === 'pause' ? '⏸️ หยุด' : '▶️ ต่อ'} ${c.name}` }
      }
      case 'report':
        return { text: report(now, rest[0] === 'week' ? 7 : 1) }
      case 'list':
        await $.ui.open({ id: PANE, title: '⏱️ Timer' })
        return { text: clocks.length ? clocks.map(c => line(c, now)).join('\n') : 'ไม่มีตัวจับเวลา /timer help' }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เริ่มบันทึกงานอัตโนมัติตามชื่อโฟลเดอร์โปรเจกต์ทุกครั้งที่เปิด Claude Code
 * 2. ส่งออกเวลาทำงานเป็น CSV ไว้คิดค่าแรงลูกค้า
 * 3. เตือนไปมือถือเมื่อหมดเวลา (ต่อกับ Mod 22)
 */
