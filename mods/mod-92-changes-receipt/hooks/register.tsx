/**
 * ============================================================================
 * MOD 92: Changes Receipt TH - ใบเสร็จการเปลี่ยนแปลงทุกรอบ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: changes-receipt ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ทุกครั้งที่ Claude ตอบจบ พิมพ์ "ใบเสร็จ" ลงในบทสนทนา:
 *    🆕 สร้างไฟล์ไหน · ✏️ แก้ไฟล์ไหน (+/- บรรทัด) · 🗑 ลบอะไร · ผ่าน shell อะไรบ้าง
 * 2. แยกส่วน "ลองแล้วไม่สำเร็จ" ให้เห็นชัด
 * 3. จับการแก้ผ่าน Bash ด้วย: rm, mv, cp, mkdir, touch, > redirect, git checkout/restore
 * 4. /receipt ดูใบล่าสุด, /receipt all รวมทั้ง session
 *
 * ใบเสร็จเป็นบรรทัดในบทสนทนาที่คนเห็น Claude ไม่เห็น (ไม่เปลือง context)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Change {
  kind: 'created' | 'modified' | 'deleted' | 'shell' | 'failed'
  path: string
  added?: number
  removed?: number
  note?: string
}

let enabled = true
let turn: Change[] = []
let lastReceipt = ''
let session: Change[] = []
let root = ''

function rel(path: string): string {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  return r && p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : p
}

function lines(text: string): number {
  return text ? text.split('\n').length : 0
}

// ==========================================================================
// บทที่ 1: อ่านคำสั่ง shell ที่เปลี่ยนไฟล์
// ==========================================================================
const SHELL_OPS: { regex: RegExp; label: string }[] = [
  { regex: /\brm\s+(?:-\w+\s+)*([^\s;&|]+)/, label: '🗑 ลบ' },
  { regex: /\b(?:mv|move|Move-Item)\s+(?:-\w+\s+)*([^\s;&|]+)\s+([^\s;&|]+)/, label: '🔀 ย้าย' },
  { regex: /\b(?:cp|copy|Copy-Item)\s+(?:-\w+\s+)*([^\s;&|]+)\s+([^\s;&|]+)/, label: '📋 คัดลอก' },
  { regex: /\b(?:mkdir|New-Item)\s+(?:-\w+\s+)*([^\s;&|]+)/, label: '📁 สร้างโฟลเดอร์' },
  { regex: /\btouch\s+([^\s;&|]+)/, label: '🆕 สร้าง' },
  { regex: /[^2>]>{1,2}\s*([^\s;&|>]+)/, label: '✏️ เขียนทับ/ต่อท้าย' },
  { regex: /\bgit\s+(?:checkout\s+--|restore)\s+([^\s;&|]+)/, label: '↩️ คืนไฟล์' },
  { regex: /\bsed\s+-i\S*\s+.*?\s([^\s;&|]+)\s*$/, label: '✏️ แก้ด้วย sed' },
]

function shellChanges(command: string): Change[] {
  const out: Change[] = []
  for (const part of command.split(/&&|\|\||;|\n/)) {
    for (const op of SHELL_OPS) {
      const m = op.regex.exec(part)
      if (m && !/^\/dev\/null$|^&\d$/.test(m[1] ?? '')) {
        out.push({ kind: 'shell', path: m.slice(1).filter(Boolean).join(' → '), note: op.label })
        break
      }
    }
  }
  return out
}

// ==========================================================================
// บทที่ 2: พิมพ์ใบเสร็จ
// ==========================================================================
function receipt(changes: Change[], title: string): string {
  if (changes.length === 0) return ''
  // รวมการแก้ไฟล์เดียวกันหลายครั้งเป็นบรรทัดเดียว
  const files = new Map<string, Change>()
  for (const c of changes.filter(c => c.kind === 'created' || c.kind === 'modified' || c.kind === 'deleted')) {
    const old = files.get(c.path)
    files.set(c.path, old ? { ...old, added: (old.added ?? 0) + (c.added ?? 0), removed: (old.removed ?? 0) + (c.removed ?? 0) } : c)
  }
  const icon = { created: '🆕', modified: '✏️', deleted: '🗑' } as const
  const lines = [`🧾 ${title}`]
  for (const c of files.values()) {
    const kind = c.kind as keyof typeof icon
    lines.push(`  ${icon[kind]} ${rel(c.path)}${c.kind === 'deleted' ? '' : `  +${c.added ?? 0} -${c.removed ?? 0}`}`)
  }
  for (const c of changes.filter(c => c.kind === 'shell')) lines.push(`  ${c.note} ${c.path}  (shell)`)
  const failed = changes.filter(c => c.kind === 'failed')
  if (failed.length) lines.push('  ── ลองแล้วไม่สำเร็จ ──', ...failed.map(c => `  ✗ ${c.note} ${rel(c.path)}`))
  return lines.join('\n')
}

function record(c: Change): void {
  turn.push(c)
  session.push(c)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    turn = []
    session = []
    lastReceipt = ''
    root = (await $.session.cwd()).replace(/[\\/]$/, '')
    await $.command.register({ name: 'receipt', description: 'ใบเสร็จการเปลี่ยนแปลงไฟล์ของแต่ละรอบ (/receipt help)', argumentHint: 'all | on|off' })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turn = []
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: จดทุกการเปลี่ยนแปลง
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const existed = e.tool === 'Write' ? await $.fs.exists(e.file_path) : true
    const r = await next(e)
    if (r.deny !== undefined) return r
    if (e.tool === 'Write') {
      if (r.isError) record({ kind: 'failed', path: e.file_path, note: 'เขียน' })
      else record({ kind: existed ? 'modified' : 'created', path: e.file_path, added: lines(e.content) })
    } else if (e.tool === 'Edit') {
      if (r.isError) record({ kind: 'failed', path: e.file_path, note: 'แก้' })
      else record({ kind: 'modified', path: e.file_path, added: lines(e.new_string), removed: lines(e.old_string) })
    } else if (e.tool === 'NotebookEdit') {
      if (r.isError) record({ kind: 'failed', path: e.notebook_path, note: 'แก้ notebook' })
      else record({ kind: 'modified', path: e.notebook_path })
    } else if (e.tool === 'Bash') {
      const ops = shellChanges(e.command)
      if (r.isError) for (const op of ops) record({ ...op, kind: 'failed', note: `${op.note} (shell)` })
      else for (const op of ops) record(op)
    }
    return r
  })

  // ==========================================================================
  // บทที่ 4: จบรอบ = พิมพ์ใบเสร็จลงบทสนทนา
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || turn.length === 0) return r
    lastReceipt = receipt(turn, 'ใบเสร็จรอบนี้')
    if (enabled) $.ui.log(lastReceipt)
    turn = []
    return r
  })

  on('command.run', { command: 'receipt' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === '') return { text: lastReceipt || '🧾 ยังไม่มีการเปลี่ยนแปลงไฟล์' }
    if (sub === 'all') return { text: receipt(session, 'ใบเสร็จรวมทั้ง session') || '🧾 ยังไม่มีการเปลี่ยนแปลงไฟล์ใน session นี้' }
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await $.store.set('enabled', enabled)
      return { text: `🧾 พิมพ์ใบเสร็จอัตโนมัติ: ${enabled ? 'เปิด' : 'ปิด'}` }
    }
    return { text: '🧾 Changes Receipt TH (Mod 92)\n/receipt         ใบเสร็จรอบล่าสุด\n/receipt all     รวมทั้ง session\n/receipt on|off  พิมพ์อัตโนมัติทุกรอบ' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. คลิกชื่อไฟล์ในใบเสร็จเพื่อดู diff (ต่อกับ Mod 84 Time Machine)
 * 2. บันทึกใบเสร็จทุกใบลงไฟล์ เป็นสมุดบัญชีการเปลี่ยนแปลงของโปรเจกต์
 * 3. จับการเปลี่ยนแปลงของ subagent แยกเป็นหมวด
 */
