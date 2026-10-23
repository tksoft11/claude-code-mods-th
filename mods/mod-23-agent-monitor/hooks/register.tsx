/**
 * ============================================================================
 * MOD 23: Agent Monitor TH - Task Manager ของ subagent (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Task Manager ของ Windows และหน้าจอสถานะแบบ J.A.R.V.I.S.
 *
 * เวลา Claude แตกงานให้ subagent (เช่น Explore, general-purpose) หลายตัวพร้อมกัน
 * เราไม่รู้ว่าตัวไหนทำอะไร ใช้ tool ไปกี่ครั้ง กิน token เท่าไหร่ Mod นี้แสดงให้ดูสดๆ
 *
 * หน้าที่ของ Mod นี้:
 * 1. แผงแสดง agent ทุกตัว (รวมงานหลัก): สถานะ, เวลาที่ใช้, จำนวน tool, tool ล่าสุด, token
 * 2. /agentmon log <id> ดู tool ที่ agent นั้นเรียกล่าสุด
 * 3. /agentmon stop <id> หยุดงานรอบปัจจุบันของ agent ที่ทำนานเกิน
 * 4. /agentmon stats สรุปรวมทั้ง session
 *
 * หมายเหตุ: ใช้ชื่อ /agentmon เพราะ /agents เป็นคำสั่งเดิมของ Claude Code
 */

import type { AgentInfo, AgentStatus, EngineInterface, Register } from 'claude-code'

interface Track {
  id: string // 'main' = งานหลัก
  firstSeen: number
  tools: number
  errors: number
  lastTool: string
  log: { at: number; tool: string; ok: boolean }[]
  tokens: number
  turnId?: string // turn ที่กำลังทำ (ใช้หยุดงาน)
  label?: string // ชื่อ/งานของ agent (จำไว้ เพราะ agent ที่จบแล้วจะหายจาก $.agent.list())
}

const PANE = 'agent-monitor-th'
const STATUS_ICON: Record<AgentStatus | 'main', string> = { pending: '⏳', running: '🟢', waiting: '🟡', idle: '⚪', completed: '✅', failed: '❌', killed: '⛔', main: '🧠' }
let tracks = new Map<string, Track>()
// คำอธิบายงานจากตอนที่งานหลักเรียก tool Agent รอผูกกับ subagent ตัวใหม่ที่โผล่มา
let pendingLabels: string[] = []

// ==========================================================================
// บทที่ 1: เก็บสถิติแยกตาม agent - event มี agentId บอกว่ามาจาก agent ไหน
// ==========================================================================
async function track($: EngineInterface, agentId: string | undefined): Promise<Track> {
  const id = agentId ?? 'main'
  let t = tracks.get(id)
  if (!t) {
    t = { id, firstSeen: await $.clock.now(), tools: 0, errors: 0, lastTool: '-', log: [], tokens: 0, label: id === 'main' ? undefined : pendingLabels.shift() }
    tracks.set(id, t)
  }
  return t
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}วิ` : `${Math.floor(s / 60)}น ${s % 60}วิ`
}

// ==========================================================================
// บทที่ 2: รวมข้อมูลจาก $.agent.list() (สถานะจริงจาก engine) กับสถิติที่เราเก็บ
// ==========================================================================
interface Row {
  id: string
  icon: string
  label: string
  track?: Track
  status: AgentStatus | 'main'
}

async function rows($: EngineInterface): Promise<Row[]> {
  const agents: AgentInfo[] = await $.agent.list().catch(() => [])
  const main = tracks.get('main')
  const result: Row[] = [{ id: 'main', icon: STATUS_ICON.main, label: 'งานหลัก', track: main, status: 'main' }]
  for (const a of agents) {
    const label = `${a.name ?? a.type}: ${a.description}`.slice(0, 60)
    const t = tracks.get(a.id)
    if (t) t.label = label
    result.push({ id: a.id, icon: STATUS_ICON[a.status], label, track: t, status: a.status })
  }
  // agent ที่จบแล้วไม่อยู่ใน list แต่เรายังมีสถิติ -> แสดงเป็น "จบแล้ว"
  for (const t of tracks.values()) {
    if (t.id !== 'main' && !agents.some(a => a.id === t.id)) result.push({ id: t.id, icon: STATUS_ICON.completed, label: `${t.label ?? 'subagent'} (จบแล้ว)`, track: t, status: 'completed' })
  }
  return result
}

function rowText(r: Row, now: number): string {
  const t = r.track
  const stats = t ? `🔧${t.tools}${t.errors ? ` ❌${t.errors}` : ''} 🪙${t.tokens.toLocaleString('en-US')} ⏱️${elapsed(now - t.firstSeen)} · ${t.lastTool}` : 'ยังไม่มีข้อมูล'
  return `${r.icon} ${r.id === 'main' ? 'main' : r.id.slice(0, 8)}  ${r.label}\n    ${stats}`
}

const HELP = `🤖 Agent Monitor TH (Mod 23)
========================================
/agentmon              รายการ agent + เปิดแผง
/agentmon log <id>     tool ที่ agent นั้นเรียกล่าสุด (ใช้ id 8 ตัวแรกได้)
/agentmon stop <id>    หยุดงานรอบปัจจุบันของ agent
/agentmon stats        สรุปรวม
/agentmon clear        ล้างสถิติ`

function findTrack(prefix: string | undefined): Track | undefined {
  if (!prefix) return undefined
  return tracks.get(prefix) ?? [...tracks.values()].find(t => t.id.startsWith(prefix))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    tracks = new Map()
    pendingLabels = []
    await $.command.register({ name: 'agentmon', description: 'Task Manager ของ subagent: สถานะ tool และ token (/agentmon help)', argumentHint: 'log|stop|stats' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ฟัง event ของทุก agent
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    const t = await track($, e.agentId)
    t.turnId = e.turnId
    if (e.agentId && !t.label) {
      const info = (await $.agent.list().catch(() => [])).find(a => a.id === e.agentId)
      if (info) t.label = `${info.name ?? info.type}: ${info.description}`.slice(0, 60)
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Agent') pendingLabels.push(`${e.subagent_type ?? 'agent'}: ${e.description}`.slice(0, 60))
    const t = await track($, e.agentId)
    t.lastTool = `${e.tool}…`
    $.ui.invalidate('ui.render')
    const ran = await next(e)
    const ok = ran.deny === undefined && !ran.isError
    t.tools++
    if (!ok) t.errors++
    t.lastTool = e.tool
    t.log = [...t.log, { at: await $.clock.now(), tool: e.tool, ok }].slice(-30)
    $.ui.invalidate('ui.render')
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const t = await track($, e.agentId)
    const u = e.usage
    if (u) t.tokens += u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    t.turnId = undefined
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผง Task Manager
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const list = await rows($)
    const running = list.filter(r => r.status === 'running' || r.status === 'pending').length
    return (
      <Box flexDirection="column">
        <Text bold>
          🤖 {list.length - 1} subagent · ทำงานอยู่ {running}
        </Text>
        {list.map(r => (
          <Box flexDirection="column" marginTop={1}>
            <Text wrap="truncate-end">
              {r.icon} <Text bold>{r.id === 'main' ? 'main' : r.id.slice(0, 8)}</Text> {r.label}
            </Text>
            <Text dimColor wrap="truncate-end">
              {r.track ? `🔧${r.track.tools} 🪙${r.track.tokens.toLocaleString('en-US')} ⏱️${elapsed(now - r.track.firstSeen)} · ${r.track.lastTool}` : 'รอข้อมูล'}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /agentmon
  // ==========================================================================
  on('command.run', { command: 'agentmon' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()

    switch (sub) {
      case 'help':
        return { text: HELP }
      case 'log': {
        const t = findTrack(arg ?? 'main')
        if (!t) return { text: `❌ ไม่พบ agent ${arg ?? ''}` }
        return { text: [`📜 ${t.id}: ${t.tools} tools`, ...t.log.slice(-15).map(l => `  ${l.ok ? '✅' : '❌'} ${new Date(l.at).toLocaleTimeString('th-TH')} ${l.tool}`)].join('\n') }
      }
      case 'stop': {
        const t = findTrack(arg)
        if (!t) return { text: `❌ ไม่พบ agent ${arg ?? ''} (ดู id ด้วย /agentmon)` }
        if (!t.turnId) return { text: `ℹ️ ${t.id} ไม่ได้ทำงานอยู่` }
        await $.turn.abort({ turnId: t.turnId })
        return { text: `⛔ หยุดงานรอบปัจจุบันของ ${t.id} แล้ว` }
      }
      case 'stats': {
        const all = [...tracks.values()]
        const tools = all.reduce((s, t) => s + t.tools, 0)
        const errors = all.reduce((s, t) => s + t.errors, 0)
        const tokens = all.reduce((s, t) => s + t.tokens, 0)
        const busiest = [...all].sort((a, b) => b.tokens - a.tokens)[0]
        return { text: `📊 agent ${all.length} ตัว (รวมงานหลัก) | tool ${tools} ครั้ง (ล้มเหลว ${errors}) | 🪙 ${tokens.toLocaleString('en-US')} tokens${busiest ? `\nกิน token มากสุด: ${busiest.id} (${busiest.tokens.toLocaleString('en-US')})` : ''}` }
      }
      case 'clear':
        tracks = new Map()
        $.ui.invalidate('ui.render')
        return { text: '🧹 ล้างสถิติแล้ว' }
      default: {
        await $.ui.open({ id: PANE, title: '🤖 Agents' })
        const list = await rows($)
        return { text: ['🤖 Agent Monitor', '----------------------------------------', ...list.map(r => rowText(r, now))].join('\n') }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. หยุด agent อัตโนมัติเมื่อกิน token เกินงบที่ตั้งไว้ (เช็คใน turn.complete แล้ว $.turn.abort)
 * 2. คิดเป็นเงินบาทแยกตาม agent (ใช้สูตรจาก Mod 05)
 * 3. ส่งแจ้งเตือนเข้ามือถือเมื่อ agent ล้มเหลว (ต่อกับ Mod 22)
 */
