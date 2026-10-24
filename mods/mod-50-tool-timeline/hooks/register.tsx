/**
 * ============================================================================
 * MOD 50: Tool Timeline TH - ไทม์ไลน์การทำงานของ Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: แท็บ Network/Performance ใน Chrome DevTools
 *
 * หน้าที่ของ Mod นี้:
 * 1. จับเวลาทุก tool ที่ Claude เรียก (Bash, Read, Edit, Grep, MCP ...)
 * 2. แต่งแถว tool ในแชต: เติมเวลาที่ใช้และแท่งเทียบกับตัวที่ช้าสุดของรอบ
 * 3. แต่งบรรทัด "Baked for 1m 4s" ท้ายรอบ: บอกว่า tool ไหนกินเวลามากสุด
 * 4. /timeline - กราฟแกนต์ของรอบล่าสุด เห็นว่าอะไรรันพร้อมกัน อะไรรอกัน
 * 5. /timeline stats - สถิติแยกตามชนิด tool ทั้ง session
 */

import type { EngineInterface, Register } from 'claude-code'

interface Span {
  id: string
  tool: string
  label: string
  start: number
  end?: number
  error?: boolean
  agent?: boolean
}

const PANE = 'tool-timeline-th'
const MIN_SHOW_MS = 1000 // เติมเวลาใต้แถวเฉพาะ tool ที่ใช้เวลาตั้งแต่ 1 วินาที
let current: Span[] = [] // รอบที่กำลังทำ
let lastTurn: Span[] = [] // รอบที่จบล่าสุด
let byId = new Map<string, Span>()
let totals = new Map<string, { count: number; ms: number; max: number }>()
let turnStart = 0
let enabled = true

// ==========================================================================
// บทที่ 1: ป้ายชื่อสั้นๆ ของแต่ละ tool (คำสั่ง Bash / ชื่อไฟล์ / pattern)
// ==========================================================================
function labelOf(e: Record<string, unknown>): string {
  const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  const file = pick('file_path') || pick('path') || pick('notebook_path')
  const raw = pick('command') || (file ? file.split(/[\\/]/).pop() ?? file : '') || pick('pattern') || pick('url') || pick('description') || pick('query')
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  return oneLine.length > 40 ? `${oneLine.slice(0, 39)}…` : oneLine
}

function secs(ms: number): string {
  return ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`
}

function duration(s: Span): number {
  return (s.end ?? s.start) - s.start
}

function slowest(spans: Span[]): Span | undefined {
  return spans.filter(s => s.end).sort((a, b) => duration(b) - duration(a))[0]
}

// ==========================================================================
// บทที่ 2: กราฟแกนต์ - แกนเวลาเดียวกัน แต่ละแถวคือหนึ่ง tool
// ==========================================================================
function gantt(spans: Span[], width: number): { label: string; bar: string; time: string; error?: boolean }[] {
  const done = spans.filter(s => s.end)
  if (done.length === 0) return []
  const t0 = Math.min(...done.map(s => s.start))
  const t1 = Math.max(...done.map(s => s.end ?? s.start))
  const scale = Math.max(1, t1 - t0) / width
  return done.map(s => {
    const from = Math.floor((s.start - t0) / scale)
    const len = Math.max(1, Math.round(duration(s) / scale))
    return {
      label: `${s.agent ? '↳' : ''}${s.tool} ${s.label}`.slice(0, 34),
      bar: ' '.repeat(Math.min(from, width - 1)) + '█'.repeat(Math.min(len, width - Math.min(from, width - 1))),
      time: secs(duration(s)),
      error: s.error,
    }
  })
}

const HELP = `⏱️ Tool Timeline TH (Mod 50)
========================================
/timeline          กราฟแกนต์ของรอบล่าสุด (เปิดแผง)
/timeline stats    สถิติแยกตาม tool ทั้ง session
/timeline on|off   เปิด/ปิดการเติมเวลาใต้แถว tool (ตอนนี้: STATE)`

function statsText(): string {
  if (totals.size === 0) return 'ยังไม่มีข้อมูล ให้ Claude ทำงานสักรอบก่อน'
  const rows = [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms)
  const all = rows.reduce((s, [, v]) => s + v.ms, 0)
  return [
    `📊 เวลาที่ใช้ใน tool ทั้ง session: ${secs(all)}`,
    `${'tool'.padEnd(14)} ${'ครั้ง'.padStart(5)} ${'รวม'.padStart(8)} ${'เฉลี่ย'.padStart(8)} ${'นานสุด'.padStart(8)}`,
    ...rows.map(([tool, v]) => `${tool.slice(0, 14).padEnd(14)} ${String(v.count).padStart(5)} ${secs(v.ms).padStart(8)} ${secs(v.ms / v.count).padStart(8)} ${secs(v.max).padStart(8)}  ${'▇'.repeat(Math.max(1, Math.round((v.ms / all) * 20)))}`),
  ].join('\n')
}

function finishTurn($: EngineInterface): void {
  if (current.length) lastTurn = current
  current = []
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    current = []
    lastTurn = []
    byId = new Map()
    totals = new Map()
    await $.command.register({ name: 'timeline', description: 'ไทม์ไลน์ของ tool ที่ Claude ใช้: เวลาแต่ละตัว ตัวที่ช้าสุด กราฟแกนต์ (/timeline help)', argumentHint: 'stats|on|off' })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      finishTurn($)
      turnStart = await $.clock.now()
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: จับเวลา - เริ่มก่อน next(e) จบหลัง next(e)
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const span: Span = { id: e.tool_use_id, tool: e.tool, label: labelOf(e as unknown as Record<string, unknown>), start: await $.clock.now(), agent: !!e.agentId }
    current.push(span)
    byId.set(span.id, span)
    if (byId.size > 2000) byId = new Map([...byId].slice(-1000))
    try {
      const r = await next(e)
      span.error = !!r.isError || r.deny !== undefined
      return r
    } finally {
      span.end = await $.clock.now()
      const t = totals.get(span.tool) ?? { count: 0, ms: 0, max: 0 }
      totals.set(span.tool, { count: t.count + 1, ms: t.ms + duration(span), max: Math.max(t.max, duration(span)) })
      $.ui.invalidate('ui.render')
    }
  })

  // ==========================================================================
  // บทที่ 4: แต่งแถว tool - ห่อของเดิมไว้ แล้วเติมเวลาต่อท้าย
  // ==========================================================================
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const span = byId.get(e.props.tool_use_id)
    if (!enabled || !span?.end || e.props.isRunning || duration(span) < MIN_SHOW_MS) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const peers = current.includes(span) ? current : lastTurn
    const max = Math.max(...peers.filter(s => s.end).map(duration), 1)
    const isSlowest = slowest(peers) === span && peers.length > 1
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text dimColor>
          {'  ⏱️ '}
          {secs(duration(span))} <Text color={isSlowest ? '#ff7043' : '#78909c'}>{'▇'.repeat(Math.max(1, Math.round((duration(span) / max) * 12)))}</Text>
          {isSlowest ? ' ช้าสุดของรอบ' : ''}
        </Text>
      </Box>
    )
  })

  // บรรทัดท้ายรอบ "Baked for 1m 4s" - เติมสรุปว่าเวลาหายไปไหน
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const spans = lastTurn.length ? lastTurn : current
    const worst = slowest(spans)
    if (!enabled || !worst || e.props.waitingFor) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const toolMs = spans.reduce((s, x) => s + duration(x), 0)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text dimColor>
          {`  🔧 ${spans.length} tool · รวม ${secs(toolMs)} · 🐢 ช้าสุด ${worst.tool} ${worst.label} ${secs(duration(worst))} · /timeline`}
        </Text>
      </Box>
    )
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) finishTurn($)
    return r
  })

  // ==========================================================================
  // บทที่ 5: แผงกราฟแกนต์
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const spans = current.length ? current : lastTurn
    const width = Math.max(10, Math.min(50, e.props.bodyColumns - 50))
    const rows = gantt(spans, width)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column">
        <Text bold>{current.length ? `▶️ รอบนี้ (ผ่านไป ${secs(now - turnStart)})` : '⏹️ รอบล่าสุด'}</Text>
        {rows.length === 0 && <Text dimColor>ยังไม่มี tool ในรอบนี้</Text>}
        {rows.map(r => (
          <Text>
            {r.label.padEnd(35)}
            <Text color={r.error ? '#e53935' : '#4fc3f7'}>{r.bar.padEnd(width)}</Text> {r.time}
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'timeline' }, async ($, e) => {
    const [sub = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        const spans = current.length ? current : lastTurn
        await $.ui.open({ id: PANE, title: '⏱️ Tool Timeline' })
        const rows = gantt(spans, 30)
        return { text: rows.length ? rows.map(r => `${r.label.padEnd(35)} ${r.bar.padEnd(30)} ${r.time}${r.error ? ' ❌' : ''}`).join('\n') : 'ยังไม่มีข้อมูล ให้ Claude ทำงานสักรอบก่อน' }
      }
      case 'stats':
        return { text: statsText() }
      case 'on':
      case 'off':
        enabled = sub === 'on'
        await $.store.set('enabled', enabled)
        $.ui.invalidate('ui.render')
        return { text: enabled ? '⏱️ เติมเวลาใต้แถว tool แล้ว' : 'ปิดการเติมเวลาแล้ว (แผงและ /timeline ยังใช้ได้)' }
      default:
        return { text: HELP.replace('STATE', enabled ? 'เปิด' : 'ปิด') }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เตือนเมื่อ tool เดิมช้าผิดปกติ (นานกว่าค่าเฉลี่ย 3 เท่า)
 * 2. ส่งออกไทม์ไลน์เป็นไฟล์ Chrome Trace (JSON) เปิดใน chrome://tracing
 * 3. แยกสีตาม subagent ให้เห็นงานที่รันขนานกัน
 */
