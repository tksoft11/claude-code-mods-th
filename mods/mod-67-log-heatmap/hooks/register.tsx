/**
 * ============================================================================
 * MOD 67: Log Heatmap TH - แผนที่ความร้อนของ log (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Grafana และกราฟ heatmap ใน Kibana แต่ย่อให้อยู่ในแผงข้างแชต
 *
 * หน้าที่ของ Mod นี้:
 * 1. /heatmap <ไฟล์.log> - อ่าน log แยกเวลาและระดับ (ERROR / WARN / INFO / DEBUG)
 * 2. วาดตาราง เวลา × ระดับ ด้วยบล็อก ░▒▓█ ยิ่งเข้มยิ่งเยอะ (แดง = error, เหลือง = warn, เขียว = info)
 * 3. สรุป error ที่เจอบ่อยสุด 5 แบบ (ตัดตัวเลข/id ออกก่อนจัดกลุ่ม)
 * 4. /heatmap docker <ชื่อ container> - ใช้ log ของ Docker แทนไฟล์
 *
 * รองรับเวลาแบบ ISO (2026-10-24T10:11:12), "2026-10-24 10:11:12", Apache [24/Oct/2026:10:11:12]
 * และ syslog (Oct 24 10:11:12) ถ้าบรรทัดไหนไม่มีเวลา จะใช้เวลาของบรรทัดก่อนหน้า
 */

import type { EngineInterface, Register } from 'claude-code'

type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
interface Entry {
  t: number
  level: Level
  text: string
}
interface Heat {
  source: string
  buckets: number
  bucketMs: number
  start: number
  grid: Record<Level, number[]>
  top: { text: string; n: number }[]
  total: Record<Level, number>
  lines: number
}

const LEVELS: Level[] = ['ERROR', 'WARN', 'INFO', 'DEBUG']
const COLORS: Record<Level, string> = { ERROR: '#e53935', WARN: '#fdd835', INFO: '#43a047', DEBUG: '#78909c' }
const SHADES = [' ', '░', '▒', '▓', '█']
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const PANE = 'log-heatmap-th'
const MAX_BYTES = 5_000_000

let heat: Heat | undefined

// ==========================================================================
// บทที่ 1: อ่านเวลาและระดับจากแต่ละบรรทัด
// ==========================================================================
function timeOf(line: string, year: number): number | undefined {
  const iso = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(line)
  if (iso) return new Date(+iso[1]!, +iso[2]! - 1, +iso[3]!, +iso[4]!, +iso[5]!, +iso[6]!).getTime()
  const apache = /\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/.exec(line)
  if (apache) return new Date(+apache[3]!, MONTHS[apache[2]!.toLowerCase()] ?? 0, +apache[1]!, +apache[4]!, +apache[5]!, +apache[6]!).getTime()
  const syslog = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(line)
  if (syslog && MONTHS[syslog[1]!.toLowerCase()] !== undefined) return new Date(year, MONTHS[syslog[1]!.toLowerCase()]!, +syslog[2]!, +syslog[3]!, +syslog[4]!, +syslog[5]!).getTime()
  return undefined
}

function levelOf(line: string): Level {
  if (/\b(?:ERROR|ERR|FATAL|CRIT(?:ICAL)?|PANIC|EMERG|ALERT)\b|\bException\b|Traceback|"\s5\d\d\s/i.test(line)) return 'ERROR'
  if (/\bWARN(?:ING)?\b|"\s4\d\d\s/i.test(line)) return 'WARN'
  if (/\b(?:DEBUG|TRACE)\b/i.test(line)) return 'DEBUG'
  return 'INFO'
}

// error ที่เหมือนกันแต่ต่างตัวเลข/id ให้นับเป็นแบบเดียวกัน
function normalize(line: string): string {
  return line
    .replace(/^.*?\b(?:ERROR|ERR|FATAL|CRITICAL|PANIC)\b[:\]\s-]*/i, '')
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function parse(text: string, year: number): Entry[] {
  const out: Entry[] = []
  let last: number | undefined
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const t = timeOf(line, year) ?? last
    if (t === undefined) continue
    last = t
    out.push({ t, level: levelOf(line), text: line })
  }
  return out
}

// ==========================================================================
// บทที่ 2: แบ่งช่วงเวลาให้พอดีความกว้าง (นาที / 5 นาที / ชั่วโมง / วัน)
// ==========================================================================
function build(source: string, entries: Entry[], width: number): Heat | undefined {
  if (entries.length === 0) return undefined
  const start = Math.min(...entries.map(e => e.t))
  const end = Math.max(...entries.map(e => e.t))
  const steps = [60_000, 5 * 60_000, 15 * 60_000, 3600_000, 6 * 3600_000, 86_400_000]
  const bucketMs = steps.find(s => (end - start) / s < width) ?? 86_400_000
  const buckets = Math.max(1, Math.floor((end - start) / bucketMs) + 1)
  const grid = Object.fromEntries(LEVELS.map(l => [l, new Array<number>(buckets).fill(0)])) as Record<Level, number[]>
  const total = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 }
  const counts = new Map<string, number>()
  for (const e of entries) {
    const row = grid[e.level]
    const i = Math.floor((e.t - start) / bucketMs)
    row[i] = (row[i] ?? 0) + 1
    total[e.level]++
    if (e.level === 'ERROR') counts.set(normalize(e.text), (counts.get(normalize(e.text)) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text, n]) => ({ text, n }))
  return { source, buckets, bucketMs, start, grid, top, total, lines: entries.length }
}

function shade(n: number, max: number): string {
  if (n === 0) return SHADES[0] ?? ' '
  return SHADES[Math.min(4, Math.max(1, Math.ceil((n / Math.max(1, max)) * 4)))] ?? '█'
}

function label(ms: number, bucketMs: number): string {
  const d = new Date(ms)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return bucketMs >= 86_400_000 ? `${d.getDate()}/${d.getMonth() + 1}` : bucketMs >= 3600_000 ? `${d.getDate()}/${d.getMonth() + 1} ${hm}` : hm
}

function unit(ms: number): string {
  return ms >= 86_400_000 ? '1 วัน' : ms >= 3600_000 ? `${ms / 3600_000} ชม.` : `${ms / 60_000} นาที`
}

function summary(h: Heat): string {
  const worst = h.grid.ERROR.indexOf(Math.max(...h.grid.ERROR))
  const rows = LEVELS.filter(l => h.total[l] > 0).map(l => {
    const max = Math.max(...h.grid[l])
    return `${l.padEnd(5)} │${h.grid[l].map(n => shade(n, max)).join('')}│ ${h.total[l]}`
  })
  return [
    `🌡️ ${h.source} · ${h.lines.toLocaleString('en-US')} บรรทัด · ช่องละ ${unit(h.bucketMs)}`,
    `      ${label(h.start, h.bucketMs)}${' '.repeat(Math.max(1, h.buckets - 10))}${label(h.start + (h.buckets - 1) * h.bucketMs, h.bucketMs)}`,
    ...rows,
    h.total.ERROR ? `\n🔥 error หนาแน่นสุดช่วง ${label(h.start + worst * h.bucketMs, h.bucketMs)} (${h.grid.ERROR[worst]} ครั้ง)` : '\n✅ ไม่พบ error',
    ...(h.top.length ? ['', '❌ error ที่เจอบ่อยสุด', ...h.top.map(t => `  ${String(t.n).padStart(5)}×  ${t.text}`)] : []),
  ].join('\n')
}

// ==========================================================================
// บทที่ 3: แหล่ง log - ไฟล์ หรือ docker logs
// ==========================================================================
async function load($: EngineInterface, args: string[]): Promise<{ source: string; text: string } | string> {
  if (args[0] === 'docker') {
    const name = args[1]
    if (!name) return 'วิธีใช้: /heatmap docker <ชื่อ container>'
    const r = await $.process.run(['docker', 'logs', '--timestamps', '--tail', '20000', name], { timeoutMs: 60_000 }).catch(() => undefined)
    if (!r || r.exitCode !== 0) return `อ่าน log ของ ${name} ไม่ได้: ${r?.stderr.trim().split('\n')[0] ?? 'ไม่พบคำสั่ง docker'}`
    return { source: `docker:${name}`, text: `${r.stdout}\n${r.stderr}` }
  }
  const raw = args.join(' ').replace(/^["']|["']$/g, '')
  if (!raw) return 'วิธีใช้: /heatmap logs/app.log'
  const root = (await $.session.cwd()).replace(/[\\/]$/, '')
  const path = /^(?:[A-Za-z]:[\\/]|\/)/.test(raw) ? raw : `${root}${root.includes('\\') ? '\\' : '/'}${raw}`
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) return `ไม่พบไฟล์ ${path}`
  const text = await $.fs.read(path)
  // ไฟล์ใหญ่: ใช้เฉพาะส่วนท้าย (log ใหม่สุด)
  return { source: raw.split(/[\\/]/).pop() ?? raw, text: text.length > MAX_BYTES ? text.slice(-MAX_BYTES) : text }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    heat = undefined
    await $.command.register({ name: 'heatmap', description: 'แผนที่ความร้อนของ log: พังช่วงไหน error อะไรบ่อย (/heatmap <ไฟล์> | docker <ชื่อ>)', argumentHint: '<ไฟล์.log>|docker <container>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผง heatmap - แต่ละช่องเป็นสีตามระดับ ความเข้มตามจำนวน
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!heat) return <Text dimColor>/heatmap logs/app.log</Text>
    const hm = heat
    return (
      <Box flexDirection="column">
        <Text bold>{`🌡️ ${hm.source} · ช่องละ ${unit(hm.bucketMs)}`}</Text>
        <Text dimColor>{`      ${label(hm.start, hm.bucketMs)} → ${label(hm.start + (hm.buckets - 1) * hm.bucketMs, hm.bucketMs)}`}</Text>
        {LEVELS.filter(l => hm.total[l] > 0).map(l => {
          const max = Math.max(...hm.grid[l])
          return (
            <Text>
              {`${l.padEnd(5)} `}
              <Text color={COLORS[l]}>{hm.grid[l].map(n => shade(n, max)).join('')}</Text>
              {` ${hm.total[l]}`}
            </Text>
          )
        })}
        {hm.top.slice(0, 3).map(t => (
          <Text color="#ef9a9a" wrap="truncate-end">{`${t.n}× ${t.text}`}</Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'heatmap' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args.length === 0 || args[0] === 'help') return { text: '🌡️ Log Heatmap (Mod 67)\n/heatmap <ไฟล์.log>           แผนที่ความร้อนจากไฟล์ log\n/heatmap docker <container>   จาก docker logs' }
    const src = await load($, args)
    if (typeof src === 'string') return { text: `❌ ${src}` }
    const built = build(src.source, parse(src.text, new Date(await $.clock.now()).getFullYear()), 60)
    if (!built) return { text: '🤷 ไม่พบบรรทัดที่มีเวลาใน log นี้' }
    heat = built
    await $.ui.open({ id: PANE, title: '🌡️ Log Heatmap' })
    $.ui.invalidate('ui.render')
    return { text: summary(built) }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. /heatmap watch - เฝ้าไฟล์ log แล้วอัปเดตแผงทุก 10 วินาที
 * 2. คลิกช่องที่แดงที่สุด แล้วให้ Claude อ่าน log ช่วงนั้นวิเคราะห์สาเหตุ
 * 3. รองรับ log แบบ JSON (ฟิลด์ level / time)
 */
