/**
 * ============================================================================
 * MOD 101: Micro Compaction TH - compact แบบไม่เรียก model (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: micro-compaction ใน awesome-claude-code-mods
 *
 * /compact ปกติให้ model อ่านทั้งบทสนทนาแล้วเขียนสรุปใหม่: เสียเงิน เสียเวลา และรายละเอียดหาย
 * แต่ context ส่วนใหญ่ที่บวมจริงๆ คือ "ผลของ Read" ไฟล์ยาวๆ ที่อ่านไปนานแล้ว
 *
 * หน้าที่ของ Mod นี้:
 * 1. /compact micro (หรือ /micro) ตัดผลของ Read เก่าออก เหลือป้ายบอกว่าเคยอ่านไฟล์ไหน กี่บรรทัด
 *    และตัด thinking ของรอบเก่าทิ้ง โดยไม่เรียก model เลย เสร็จทันที ไม่เสีย token
 * 2. โครงบทสนทนาอยู่ครบ: ทุกคำสั่ง ทุกคำตอบ ทุก tool call ยังอยู่ Claude รู้ว่าเคยทำอะไร
 *    ถ้าต้องใช้เนื้อไฟล์อีกก็อ่านใหม่ได้ (ไฟล์อาจเปลี่ยนไปแล้วด้วย อ่านใหม่ยิ่งถูก)
 * 3. /micro all ตัดผลยาวของ Bash, Grep, Glob, WebFetch ด้วย
 * 4. ข้อความ 8 อันล่าสุดไม่แตะ งานที่ทำอยู่ตอนนี้จึงไม่สะดุด
 */

import type { Register, SessionMessage, ToolResultSummary, ToolUseSummary } from 'claude-code'

const KEEP_RECENT = 8
const LONG = 1_500
const OTHER_TOOLS = new Set(['Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'PowerShell'])

let last = ''

function chars(m: SessionMessage): number {
  return m.text.length + m.toolUses.reduce((n, u) => n + JSON.stringify(u.input).length + (u.text?.length ?? 0), 0) + (m.toolResults ?? []).reduce((n, r) => n + r.text.length, 0)
}

// ==========================================================================
// บทที่ 1: ตัดสินว่าผลของ tool ไหนควรตัด
// ==========================================================================
function placeholder(use: ToolUseSummary | undefined, text: string): string {
  const lines = text.split('\n').length
  if (use?.tool === 'Read') return `[elided by micro-compaction: Read ${String(use.input.file_path ?? '')} (${lines} lines). Re-read the file if you need its content.]`
  return `[elided by micro-compaction: ${use?.tool ?? 'tool'} output (${lines} lines). Run it again if you need it.]`
}

function shouldElide(use: ToolUseSummary | undefined, text: string, all: boolean): boolean {
  if (!use || text.startsWith('[elided by micro-compaction')) return false
  if (use.tool === 'Read') return text.length > 200
  return all && OTHER_TOOLS.has(use.tool) && text.length > LONG
}

// ==========================================================================
// บทที่ 2: สร้างบทสนทนาใหม่
// ข้อความที่มี handle = ของเดิมของ engine (ใช้ทั้งก้อน)
// ข้อความที่ไม่มี handle = engine ประกอบใหม่จาก role, text, toolUses, toolResults (ไม่มี thinking)
// ==========================================================================
function micro(messages: readonly SessionMessage[], all: boolean): { messages: SessionMessage[]; elided: number; before: number; after: number } {
  const uses = new Map<string, ToolUseSummary>()
  for (const m of messages) for (const u of m.toolUses) uses.set(u.tool_use_id, u)
  const cut = Math.max(0, messages.length - KEEP_RECENT)
  let elided = 0
  const out = messages.map((m, i): SessionMessage => {
    if (i >= cut) return m
    if (m.role === 'assistant') {
      // ประกอบใหม่ = ทิ้ง thinking และตัดผลที่แนบมากับ tool_use ด้วย
      const toolUses = m.toolUses.map(u => (u.text !== undefined && shouldElide(u, u.text, all) ? { ...u, result: undefined, text: placeholder(u, u.text) } : u))
      return { role: m.role, text: m.text, toolUses }
    }
    const results = m.toolResults ?? []
    if (!results.some(r => shouldElide(uses.get(r.tool_use_id), r.text, all))) return m
    const toolResults = results.map((r): ToolResultSummary => {
      const use = uses.get(r.tool_use_id)
      if (!shouldElide(use, r.text, all)) return r
      elided++
      return { tool_use_id: r.tool_use_id, isError: r.isError, text: placeholder(use, r.text) }
    })
    return { role: m.role, text: m.text, toolUses: m.toolUses, toolResults }
  })
  return { messages: out, elided, before: messages.reduce((n, m) => n + chars(m), 0), after: out.reduce((n, m) => n + chars(m), 0) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'micro', description: 'compact แบบไม่เรียก model: ตัดผล Read เก่าและ thinking ทิ้ง (/micro all ตัดผล Bash/Grep ยาวด้วย)', argumentHint: 'all | last' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: รับ /compact micro แล้วตอบผล compaction เอง ไม่ส่งต่อให้ core
  // ==========================================================================
  on('session.compact', async ($, e, next) => {
    const words = (e.instructions ?? '').trim().toLowerCase().split(/\s+/)
    if (e.agentId || words[0] !== 'micro') return next(e)
    const r = micro(e.messages, words[1] === 'all')
    if (r.elided === 0 && r.messages.every((m, i) => m === e.messages[i])) {
      last = '🗜 ไม่มีอะไรให้ตัด (ผล Read เก่าถูกตัดไปแล้ว หรือบทสนทนายังสั้น)'
      return { skip: 'micro-compaction: ไม่มีผลของ tool เก่าให้ตัด' }
    }
    const saved = Math.round((r.before - r.after) / 4)
    last = `🗜 micro compaction: ตัดผลของ tool ${r.elided} ก้อน และ thinking รอบเก่า · ประหยัดประมาณ ${saved.toLocaleString('en-US')} tokens · ไม่เรียก model`
    $.ui.log(last)
    return { messages: r.messages, tokensBefore: Math.round(r.before / 4), tokensAfter: Math.round(r.after / 4) }
  })

  on('command.run', { command: 'micro' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'last') return { text: last || 'ยังไม่เคย micro compact ใน session นี้' }
    if (arg !== '' && arg !== 'all') return { text: '🗜 Micro Compaction TH (Mod 101)\n/micro         ตัดผล Read เก่า + thinking (ไม่เรียก model)\n/micro all     ตัดผลยาวของ Bash/Grep/Glob/WebFetch ด้วย\n/micro last    ผลครั้งล่าสุด\nหรือพิมพ์ /compact micro ก็ได้' }
    const r = await $.session.compact({ instructions: arg === 'all' ? 'micro all' : 'micro' }).catch((err: unknown) => ({ skip: `compact ไม่ได้ตอนนี้: ${String(err)}` }))
    return { text: 'skip' in r && r.skip ? `⏸ ${r.skip}` : last }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ตัดเฉพาะไฟล์ที่ถูกแก้ไปแล้ว (เนื้อเก่าใช้ไม่ได้อยู่แล้ว) ดูจาก Edit/Write หลังจากนั้น
 * 2. ทำ micro ให้เองเมื่อ context ถึง 70% ก่อน engine จะ auto compact (ต่อกับ Mod 80)
 * 3. เก็บผลที่ตัดไว้ในไฟล์ ให้ Claude เปิดดูได้โดยไม่ต้องอ่านไฟล์ต้นฉบับใหม่
 */
