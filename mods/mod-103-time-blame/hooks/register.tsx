/**
 * ============================================================================
 * MOD 103: Time Blame TH - งานช้าเพราะอะไร: Claude, tool หรือรอเรา (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: time-blame ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้: แบ่งเวลาของทุกรอบเป็น 5 กอง
 *   🤖 Claude    เวลาที่ model คิดและพิมพ์ (ทุกคำขอใน turn.step)
 *   🔧 tool      เวลาที่คำสั่งรันจริง เช่น npm test 44 วินาที (จาก duration_ms ของ PostToolUse)
 *   👥 subagent  เวลาที่ส่งลูกทีมไปทำงาน
 *   🙋 คุณ       เวลาที่รอเรากดอนุญาต หรือรอเราตอบคำถาม
 *   ⋯ อื่นๆ      ส่วนที่เหลือ (เครือข่าย, hook, เตรียมข้อมูล)
 *
 * 1. รอบที่นานเกิน 15 วินาที พิมพ์บรรทัดสรุปลงบทสนทนา บอกด้วยว่า tool ไหนกินเวลาที่สุด
 * 2. /blame ใบสรุปทั้ง session: กราฟแท่งแต่ละกอง, tool ที่ช้าที่สุด, รอบที่นานที่สุด
 *
 * เวลาซ้อนกัน (tool หลายตัวรันพร้อมกัน) นับครั้งเดียว ตามลำดับ คุณ > subagent > tool > Claude
 */

import type { EngineInterface, Register } from 'claude-code'

type Kind = 'you' | 'agents' | 'tools' | 'claude'
type Span = [number, number]

interface Call {
  tool: string
  label: string
  t0: number
  asked: boolean
}

interface TurnBlame {
  total: number
  parts: Record<Kind | 'other', number>
  slowest?: { label: string; ms: number }
}

const ICON: Record<Kind | 'other', string> = { claude: '🤖 Claude', tools: '🔧 tool', agents: '👥 subagent', you: '🙋 คุณ', other: '⋯ อื่นๆ' }
const ORDER: (Kind | 'other')[] = ['claude', 'tools', 'agents', 'you', 'other']
const PRIORITY: Kind[] = ['you', 'agents', 'tools', 'claude']

let enabled = true
let minSec = 15
let turnStart = 0
let spans: Record<Kind, Span[]> = { you: [], agents: [], tools: [], claude: [] }
let pending = new Map<string, Call>()
let runMs = new Map<string, number>()
let toolTimes: { label: string; ms: number }[] = []
let session: TurnBlame[] = []

function sec(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function labelOf(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash' || tool === 'PowerShell') return String(input.command ?? '').split('\n')[0]!.slice(0, 40)
  const path = input.file_path ?? input.path ?? input.pattern ?? input.url ?? ''
  return path ? `${tool} ${String(path).split(/[\\/]/).pop()}` : tool
}

// ==========================================================================
// บทที่ 1: รวมช่วงเวลาที่ซ้อนกัน ให้แต่ละมิลลิวินาทีนับให้กองเดียว
// ==========================================================================
function blame(start: number, end: number): TurnBlame {
  const step = 100
  const n = Math.max(1, Math.ceil((end - start) / step))
  const owner = new Array<Kind | undefined>(n).fill(undefined)
  // กองที่สำคัญกว่าได้จองช่องก่อน
  for (const kind of [...PRIORITY].reverse()) {
    for (const [a, b] of spans[kind]) {
      for (let i = Math.max(0, Math.floor((a - start) / step)); i < Math.min(n, Math.ceil((b - start) / step)); i++) owner[i] = kind
    }
  }
  const parts: Record<Kind | 'other', number> = { claude: 0, tools: 0, agents: 0, you: 0, other: 0 }
  for (const k of owner) parts[k ?? 'other'] += step
  const total = end - start
  // ปัดเศษช่องสุดท้ายให้รวมเท่าเวลาจริง
  parts.other = Math.max(0, total - parts.claude - parts.tools - parts.agents - parts.you)
  const slowest = [...toolTimes].sort((a, b) => b.ms - a.ms)[0]
  return { total, parts, slowest }
}

function oneLine(b: TurnBlame): string {
  const items = ORDER.filter(k => b.parts[k] >= 500).map(k => `${ICON[k]} ${sec(b.parts[k])}`)
  const slow = b.slowest && b.slowest.ms >= 3000 ? ` · ช้าสุด: ${b.slowest.label} ${sec(b.slowest.ms)}` : ''
  return `⏱ รอบนี้ ${sec(b.total)} = ${items.join(' · ')}${slow}`
}

function bar(ms: number, total: number, width = 24): string {
  const n = total ? Math.round((ms / total) * width) : 0
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function receipt(): string {
  if (session.length === 0) return '⏱ ยังไม่มีรอบที่จับเวลาได้'
  const sum: Record<Kind | 'other', number> = { claude: 0, tools: 0, agents: 0, you: 0, other: 0 }
  let total = 0
  for (const t of session) {
    total += t.total
    for (const k of ORDER) sum[k] += t.parts[k]
  }
  const lines = [`⏱ Time Blame: ${session.length} รอบ รวม ${sec(total)}`, '']
  for (const k of ORDER) lines.push(`${ICON[k].padEnd(12)} ${bar(sum[k], total)} ${sec(sum[k]).padStart(6)}  ${total ? Math.round((sum[k] / total) * 100) : 0}%`)
  const slowTools = session.flatMap(t => (t.slowest ? [t.slowest] : [])).sort((a, b) => b.ms - a.ms).slice(0, 5)
  if (slowTools.length) lines.push('', 'tool ที่ช้าที่สุด:', ...slowTools.map(t => `  ${sec(t.ms).padStart(6)}  ${t.label}`))
  const longest = [...session].sort((a, b) => b.total - a.total)[0]!
  lines.push('', `รอบที่นานที่สุด ${sec(longest.total)}: ${oneLine(longest).replace(/^⏱ รอบนี้ \S+ = /, '')}`)
  const top = ORDER.filter(k => k !== 'other').sort((a, b) => sum[b] - sum[a])[0]!
  const advice: Record<Kind, string> = {
    claude: 'ส่วนใหญ่เป็นเวลาคิดของ Claude ลอง _ นำหน้า prompt ง่ายๆ ให้ใช้ Haiku (Mod 94)',
    tools: 'ส่วนใหญ่รอคำสั่งรัน ลองรันเทสต์เฉพาะไฟล์ที่แก้ หรือเพิ่ม cache ของ build',
    agents: 'ส่วนใหญ่รอ subagent ลองให้ทำงานเล็กลง หรือรันขนานกัน',
    you: 'ส่วนใหญ่รอคุณกดอนุญาต ลองเพิ่มคำสั่งที่ใช้บ่อยใน allow list (/permissions)',
  }
  lines.push(`💡 ${advice[top]}`)
  return lines.join('\n')
}

async function now($: EngineInterface): Promise<number> {
  return $.clock.now()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const s = (await $.store.get('settings')) as { enabled?: boolean; minSec?: number } | undefined
    enabled = s?.enabled ?? true
    minSec = s?.minSec ?? 15
    session = []
    await $.command.register({ name: 'blame', description: 'งานช้าเพราะอะไร: แบ่งเวลาเป็น Claude, tool, subagent, รอคุณ (/blame help)', argumentHint: 'on|off | min <วินาที>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: เริ่มรอบ และจับเวลาคิดของ Claude (turn.step เป็น async generator)
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnStart = await now($)
      spans = { you: [], agents: [], tools: [], claude: [] }
      pending = new Map()
      runMs = new Map()
      toolTimes = []
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const t0 = await now($)
    try {
      return yield* next(e)
    } finally {
      spans.claude.push([t0, await now($)])
    }
  })

  // ==========================================================================
  // บทที่ 3: จับเวลา tool และแยกเวลาที่รอเรากดอนุญาตออก
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    const id = e.tool_use_id ?? `${e.tool}-${Math.random()}`
    const call: Call = { tool: e.tool, label: labelOf(e.tool, e as unknown as Record<string, unknown>), t0: await now($), asked: false }
    pending.set(id, call)
    try {
      return await next(e)
    } finally {
      const t1 = await now($)
      pending.delete(id)
      if (e.tool === 'AskUserQuestion') spans.you.push([call.t0, t1])
      else if (e.tool === 'Agent') spans.agents.push([call.t0, t1])
      else {
        // duration_ms = เวลารันจริงของ tool; ก่อนหน้านั้นคือรอขออนุญาต (ถ้ามีการถาม)
        const run = Math.min(t1 - call.t0, runMs.get(id) ?? t1 - call.t0)
        if (call.asked) spans.you.push([call.t0, t1 - run])
        spans.tools.push([t1 - run, t1])
        toolTimes.push({ label: call.label, ms: run })
      }
    }
  })

  // มีการขออนุญาต: ผูกกับ tool ชื่อเดียวกันที่กำลังรออยู่ล่าสุด
  on('classic.PermissionRequest', async ($, e, next) => {
    const waiting = [...pending.values()].filter(c => c.tool === e.tool_name && !c.asked).pop()
    if (waiting) waiting.asked = true
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    if (e.duration_ms !== undefined) runMs.set(e.tool_use_id, e.duration_ms)
    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    if (e.duration_ms !== undefined) runMs.set(e.tool_use_id, e.duration_ms)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: จบรอบ = สรุปลงบทสนทนา
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || !turnStart) return r
    const b = blame(turnStart, await now($))
    turnStart = 0
    session = [...session.slice(-199), b]
    if (enabled && b.total >= minSec * 1000) $.ui.log(oneLine(b))
    return r
  })

  on('command.run', { command: 'blame' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', { enabled, minSec })
    if (sub === '') return { text: receipt() }
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await save()
      return { text: `⏱ สรุปท้ายรอบ: ${enabled ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'min') {
      const n = Number(arg)
      if (!(n >= 0 && n <= 3600)) return { text: `วิธีใช้: /blame min 15 (ตอนนี้ ${minSec})` }
      minSec = n
      await save()
      return { text: `⏱ สรุปเฉพาะรอบที่นานเกิน ${n} วินาที` }
    }
    return { text: '⏱ Time Blame TH (Mod 103)\n/blame           ใบสรุปเวลาทั้ง session\n/blame on|off    สรุปท้ายรอบที่นาน\n/blame min 15    สรุปเฉพาะรอบที่นานเกินกี่วินาที' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. วาดไทม์ไลน์ของรอบเป็นแถบสีในแผง (ต่อกับ Mod 50 Tool Timeline)
 * 2. แยกเวลา Claude เป็น "รอคำตอบแรก" กับ "พิมพ์คำตอบ" จาก chunk แรกของ turn.step
 * 3. เก็บสถิติข้าม session แล้วบอกว่าวันไหนเสียเวลารออนุญาตมากที่สุด
 */
