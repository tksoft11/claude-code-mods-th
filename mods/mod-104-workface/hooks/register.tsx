/**
 * ============================================================================
 * MOD 104: Workface TH - สมุดโน้ตงานที่รอดทุกการ compact (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: workface ใน awesome-claude-code-mods
 *
 * ปัญหา: งานยาวๆ พอ compact ทีไร รายละเอียดสำคัญหาย ทั้งเป้าหมาย สิ่งที่ตกลงกันไว้
 * และกับดักที่เคยเจอ Claude เลยกลับไปทำผิดซ้ำ
 *
 * หน้าที่ของ Mod นี้:
 * 1. ให้ Claude มี tool "note" จดโน้ตงานเองระหว่างทำงาน แบ่ง 5 ประเภท:
 *    🎯 เป้าหมาย · ✅ ตัดสินใจแล้ว · ⚠️ กับดัก · ☐ ต้องทำ · 📍 ความคืบหน้า
 * 2. ตอน compact: สั่งตัวสรุปให้เก็บโน้ตไว้ครบ แล้วแนบโน้ตกลับไปกับ prompt ถัดไป
 * 3. เก็บเป็นไฟล์ .claude/workface.md ในโปรเจกต์ เปิด session ใหม่ Claude ก็รู้งานเดิม
 * 4. เราจดเองได้ด้วย /note และเปิดแผงดูได้ด้วย /workface
 */

import type { EngineInterface, Register } from 'claude-code'

const FILE = '.claude/workface.md'
const PANE = 'workface-th'
const TOOL = 'note'

type Kind = 'goal' | 'decision' | 'gotcha' | 'todo' | 'progress'

interface Note {
  id: number
  kind: Kind
  text: string
  done: boolean
}

const KINDS: Record<Kind, { icon: string; th: string; color: string }> = {
  goal: { icon: '🎯', th: 'เป้าหมาย', color: '#4fc3f7' },
  decision: { icon: '✅', th: 'ตัดสินใจแล้ว', color: '#81c784' },
  gotcha: { icon: '⚠️', th: 'กับดัก', color: '#ffb74d' },
  todo: { icon: '☐', th: 'ต้องทำ', color: '#e0e0e0' },
  progress: { icon: '📍', th: 'ความคืบหน้า', color: '#ce93d8' },
}
const ORDER: Kind[] = ['goal', 'decision', 'gotcha', 'todo', 'progress']

let notes: Note[] = []
let root = ''
// ต้องแนบโน้ตไปกับ prompt ถัดไปไหม (หลัง compact หรือเปิด session ใหม่)
let reattach = false

// ==========================================================================
// บทที่ 1: อ่าน/เขียนไฟล์โน้ต (Markdown ที่คนอ่านรู้เรื่อง)
// ==========================================================================
function toMarkdown(): string {
  const lines = ['# Workface notes', '', '<!-- สมุดโน้ตงานของ Claude (Mod 104) แก้ด้วยมือได้ -->', '']
  for (const n of notes) lines.push(`- [${n.kind}]${n.done ? ' ✓' : ''} ${n.text} <!-- id:${n.id} -->`)
  return `${lines.join('\n')}\n`
}

function fromMarkdown(md: string): Note[] {
  const out: Note[] = []
  for (const m of md.matchAll(/^- \[(goal|decision|gotcha|todo|progress)\]( ✓)? (.*?)(?: <!-- id:(\d+) -->)?$/gm)) {
    out.push({ id: Number(m[4]) || out.length + 1, kind: m[1] as Kind, done: Boolean(m[2]), text: m[3]!.trim() })
  }
  return out
}

async function save($: EngineInterface): Promise<void> {
  await $.fs.write(`${root}/${FILE}`, toMarkdown())
  $.ui.invalidate('ui.render')
}

function brief(): string {
  if (notes.length === 0) return ''
  const lines = ['Workface notes (the working notebook for this task; keep using the note tool to update it):']
  for (const k of ORDER) {
    const group = notes.filter(n => n.kind === k)
    if (group.length) lines.push(`${k}:`, ...group.map(n => `  #${n.id}${n.done ? ' [done]' : ''} ${n.text}`))
  }
  return lines.join('\n')
}

function add(kind: Kind, text: string): Note {
  const n: Note = { id: Math.max(0, ...notes.map(x => x.id)) + 1, kind, text: text.replace(/\s+/g, ' ').trim(), done: false }
  notes = [...notes, n]
  return n
}

// ==========================================================================
// บทที่ 2: tool ให้ Claude จดเอง
// ==========================================================================
const TOOL_SPEC = {
  name: TOOL,
  description:
    'Workface: your working notebook for long tasks. It survives context compaction and new sessions, so record what you must not forget: the goal, decisions the user agreed to, gotchas you hit, todos, and progress. Keep notes short (one line). Mark todos done instead of deleting them.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'done', 'remove', 'list'] },
      kind: { type: 'string', enum: ORDER, description: 'for add' },
      text: { type: 'string', description: 'for add: one short line' },
      id: { type: 'number', description: 'for done/remove' },
    },
    required: ['action'],
  },
  isDeferred: false as const,
}

async function runTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const action = String(input.action ?? '')
  if (action === 'list') return brief() || 'No notes yet.'
  if (action === 'add') {
    const kind = ORDER.includes(input.kind as Kind) ? (input.kind as Kind) : 'progress'
    const text = String(input.text ?? '').trim()
    if (!text) return 'text is required for add'
    const n = add(kind, text)
    await save($)
    return `Saved note #${n.id} (${kind}).`
  }
  const id = Number(input.id)
  const target = notes.find(n => n.id === id)
  if (!target) return `No note #${input.id}. ${brief()}`
  if (action === 'done') notes = notes.map(n => (n.id === id ? { ...n, done: true } : n))
  else if (action === 'remove') notes = notes.filter(n => n.id !== id)
  else return 'action must be add, done, remove or list'
  await save($)
  return `Note #${id} ${action === 'done' ? 'marked done' : 'removed'}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    root = (await $.session.cwd()).replace(/[\\/]$/, '')
    const path = `${root}/${FILE}`
    notes = (await $.fs.exists(path)) ? fromMarkdown((await $.fs.read(path)) as string) : []
    reattach = notes.length > 0
    await $.tool.register(TOOL_SPEC)
    await $.command.register({ name: 'note', description: 'จดโน้ตงานที่รอดทุกการ compact: /note กับดัก: ... (/note help)', argumentHint: '[ประเภท:] ข้อความ | done <id> | rm <id> | clear' })
    await $.command.register({ name: 'workface', description: 'เปิดแผงสมุดโน้ตงาน (Workface)' })
    if (notes.length) $.ui.toast(`📓 Workface: มีโน้ตงาน ${notes.length} ข้อจากรอบก่อน จะแนบให้ Claude กับ prompt แรก`, { timeoutMs: 8_000 })
    return next(e)
  })

  on('tool.call', { tool: `mcp__workface-th__${TOOL}` }, async ($, e) => ({ result: await runTool($, e as unknown as Record<string, unknown>) }))

  // ==========================================================================
  // บทที่ 3: ตอน compact - บอกตัวสรุปให้เก็บโน้ต แล้วแนบกลับหลังสรุป
  // ==========================================================================
  on('session.compact', async ($, e, next) => {
    if (e.agentId || notes.length === 0) return next(e)
    const keep = `Keep these working notes verbatim in the summary:\n${brief()}`
    const r = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${keep}` : keep })
    if (r.skip === undefined) reattach = true
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    if (!reattach || notes.length === 0) return next(e)
    reattach = false
    return next({ ...e, context: [...(e.context ?? []), brief()] })
  })

  // ==========================================================================
  // บทที่ 4: แผงสมุดโน้ต
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (notes.length === 0) return <Text dimColor>ยังไม่มีโน้ต · Claude จะจดเองระหว่างทำงาน หรือจดเองด้วย /note</Text>
    return (
      <Box flexDirection="column">
        {ORDER.filter(k => notes.some(n => n.kind === k)).map(k => (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={KINDS[k].color}>{`${KINDS[k].icon} ${KINDS[k].th}`}</Text>
            {notes
              .filter(n => n.kind === k)
              .map(n => (
                <Text dimColor={n.done}>{`  #${n.id} ${n.done ? '✓ ' : ''}${n.text}`}</Text>
              ))}
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'workface' }, async $ => {
    await $.ui.open({ id: PANE, title: '📓 Workface' })
    return { text: `📓 โน้ตงาน ${notes.length} ข้อ (${FILE})` }
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', arg] = args.split(/\s+/)
    if (!args) return { text: brief() || '📓 ยังไม่มีโน้ต' }
    if (sub === 'help') return { text: `📓 Workface TH (Mod 104)\n/note <ข้อความ>          จดเป็น "ต้องทำ"\n/note กับดัก: <ข้อความ>    ประเภท: เป้าหมาย / ตัดสินใจ / กับดัก / ต้องทำ / คืบหน้า\n/note done <id>         ทำเสร็จแล้ว\n/note rm <id>           ลบ\n/note clear             ล้างทั้งหมด\n/workface               เปิดแผง\nClaude จดเองได้ด้วย tool "note" · ไฟล์: ${FILE}` }
    if (sub === 'clear') {
      notes = []
      await save($)
      return { text: '🧹 ล้างโน้ตแล้ว' }
    }
    if ((sub === 'done' || sub === 'rm') && arg) {
      const text = await runTool($, { action: sub === 'rm' ? 'remove' : 'done', id: Number(arg) })
      return { text: `📓 ${text}` }
    }
    // "กับดัก: ..." หรือ "gotcha: ..." กำหนดประเภท
    const typed = /^(เป้าหมาย|goal|ตัดสินใจ|decision|กับดัก|gotcha|ต้องทำ|todo|คืบหน้า|progress)\s*:\s*(.+)$/i.exec(args)
    const map: Record<string, Kind> = { เป้าหมาย: 'goal', goal: 'goal', ตัดสินใจ: 'decision', decision: 'decision', กับดัก: 'gotcha', gotcha: 'gotcha', ต้องทำ: 'todo', todo: 'todo', คืบหน้า: 'progress', progress: 'progress' }
    const kind = typed ? (map[typed[1]!.toLowerCase()] ?? 'todo') : 'todo'
    const n = add(kind, typed ? typed[2]! : args)
    await save($)
    return { text: `📓 จด #${n.id} ${KINDS[kind].icon} ${KINDS[kind].th}: ${n.text}` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เตือน Claude ให้จดโน้ตเมื่อทำงานไปนานแล้วยังไม่จดเลย
 * 2. ส่งโน้ต "ต้องทำ" ที่ยังไม่เสร็จเข้า Mod 82 Plan Progress
 * 3. ให้ Haiku ยุบโน้ตที่ซ้ำกันเมื่อมีเกิน 30 ข้อ
 */
