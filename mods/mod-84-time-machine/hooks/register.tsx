/**
 * ============================================================================
 * MOD 84: Time Machine TH - ย้อนเวลาไฟล์ที่ Claude แก้ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: time-machine (Agent Time Machine) ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ก่อน Claude แก้ไฟล์ด้วย Edit / Write / NotebookEdit ถ่ายภาพไฟล์ไว้ (snapshot)
 *    หลังแก้เก็บเนื้อหาใหม่ไว้ด้วย ได้เป็นไทม์ไลน์ทีละขั้น
 * 2. /tm ดูไทม์ไลน์: ขั้นที่เท่าไหร่ เวลา ไฟล์ไหน เพิ่ม/ลบกี่บรรทัด
 * 3. /tm diff <ขั้น> ดูว่าขั้นนั้นเปลี่ยนอะไร
 * 4. /tm undo <ขั้น> คืนไฟล์ของขั้นนั้นกลับไปก่อนแก้ (ไฟล์ที่ Claude สร้างใหม่จะถูกลบ)
 *    ไม่ต้องพึ่ง git และย้อนได้แม้ยังไม่ commit
 * 5. แผงไทม์ไลน์ /tm pane
 *
 * ข้อจำกัด: เห็นเฉพาะการแก้ผ่าน tool แก้ไฟล์ ไม่เห็นการแก้ผ่าน Bash (sed, mv ...)
 * เก็บในหน่วยความจำของ session ล่าสุด 200 ขั้น ไฟล์ใหญ่เกิน 1 MB ไม่เก็บ
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'time-machine-th'
const MAX_STEPS = 200
const MAX_BYTES = 1_000_000

interface Step {
  n: number
  at: number
  tool: string
  path: string
  // null = ยังไม่มีไฟล์ (Claude สร้างใหม่)
  before: string | null
  after: string
  undone?: boolean
}

let steps: Step[] = []
let counter = 0
let root = ''
let isWindows = false

function rel(path: string): string {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  return r && p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : p
}

function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ==========================================================================
// บทที่ 1: diff แบบบรรทัด (LCS) - พอสำหรับดูว่าเปลี่ยนอะไร
// ==========================================================================
function diffLines(a: string, b: string): { op: ' ' | '+' | '-'; line: string }[] {
  const x = a.split('\n')
  const y = b.split('\n')
  // ตัดหัวและท้ายที่เหมือนกันออกก่อน ให้ตาราง LCS เล็กลงมาก
  let start = 0
  while (start < x.length && start < y.length && x[start] === y[start]) start++
  let endX = x.length
  let endY = y.length
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--
    endY--
  }
  const mx = x.slice(start, endX)
  const my = y.slice(start, endY)
  if (mx.length * my.length > 4_000_000) return [...mx.map(line => ({ op: '-' as const, line })), ...my.map(line => ({ op: '+' as const, line }))]
  const dp = Array.from({ length: mx.length + 1 }, () => new Array<number>(my.length + 1).fill(0))
  for (let i = mx.length - 1; i >= 0; i--) {
    for (let j = my.length - 1; j >= 0; j--) {
      dp[i]![j] = mx[i] === my[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: { op: ' ' | '+' | '-'; line: string }[] = x.slice(Math.max(0, start - 2), start).map(line => ({ op: ' ', line }))
  let i = 0
  let j = 0
  while (i < mx.length || j < my.length) {
    if (i < mx.length && j < my.length && mx[i] === my[j]) {
      out.push({ op: ' ', line: mx[i]! })
      i++
      j++
    } else if (j < my.length && (i >= mx.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) out.push({ op: '+', line: my[j++]! })
    else out.push({ op: '-', line: mx[i++]! })
  }
  return [...out, ...x.slice(endX, endX + 2).map(line => ({ op: ' ' as const, line }))]
}

function stat(s: Step): string {
  if (s.before === null) return `ใหม่ +${s.after.split('\n').length}`
  const d = diffLines(s.before, s.after)
  return `+${d.filter(l => l.op === '+').length} -${d.filter(l => l.op === '-').length}`
}

// ==========================================================================
// บทที่ 2: ถ่ายภาพก่อนและหลังแก้
// ==========================================================================
async function readOrNull($: EngineInterface, path: string): Promise<string | null> {
  if (!(await $.fs.exists(path))) return null
  const st = await $.fs.stat(path)
  if (st.size > MAX_BYTES) throw new Error('too big')
  return (await $.fs.read(path)) as string
}

// ==========================================================================
// บทที่ 3: ย้อนไฟล์กลับ
// ==========================================================================
async function removeFile($: EngineInterface, path: string): Promise<void> {
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Remove-Item -LiteralPath $env:TM_PATH -Force"]
    : ['sh', '-c', 'rm -f -- "$TM_PATH"']
  const r = await $.process.run(argv, { env: { TM_PATH: path }, timeoutMs: 15_000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
}

async function undo($: EngineInterface, s: Step): Promise<string> {
  const now = await readOrNull($, s.path).catch(() => undefined)
  // มีขั้นหลังจากนี้ที่แก้ไฟล์เดียวกันอยู่ - ย้อนขั้นนี้จะทับของใหม่ด้วย บอกให้รู้
  const later = steps.filter(x => x.path === s.path && x.n > s.n && !x.undone)
  if (s.before === null) await removeFile($, s.path)
  else await $.fs.write(s.path, s.before)
  s.undone = true
  for (const x of later) x.undone = true
  const changedOutside = now !== undefined && now !== (later.at(-1)?.after ?? s.after)
  return [
    `⏪ ย้อน ${rel(s.path)} กลับไปก่อนขั้น #${s.n}${s.before === null ? ' (ลบไฟล์ที่ Claude สร้าง)' : ''}`,
    later.length ? `   รวมขั้นหลังจากนั้นของไฟล์นี้ด้วย: ${later.map(x => `#${x.n}`).join(', ')}` : '',
    changedOutside ? '   ⚠️ ไฟล์ถูกแก้นอก Claude หลังขั้นนี้ ส่วนนั้นถูกย้อนไปด้วย' : '',
  ].filter(Boolean).join('\n')
}

function timeline(limit = 30): string {
  if (steps.length === 0) return '⏳ ยังไม่มีการแก้ไฟล์ใน session นี้'
  const lines = ['🕰 Time Machine: ไทม์ไลน์การแก้ไฟล์', '']
  for (const s of steps.slice(-limit)) lines.push(`${s.undone ? '↩' : '•'} #${String(s.n).padEnd(3)} ${hhmm(s.at)}  ${s.tool.padEnd(5)} ${rel(s.path)}  (${stat(s)})${s.undone ? ' ย้อนแล้ว' : ''}`)
  lines.push('', '/tm diff <ขั้น> ดูการเปลี่ยนแปลง · /tm undo <ขั้น> ย้อนกลับ')
  return lines.join('\n')
}

function diffText(s: Step): string {
  const d = diffLines(s.before ?? '', s.after)
  const shown = d.slice(0, 120).map(l => `${l.op} ${l.line}`)
  return [`🕰 #${s.n} ${s.tool} ${rel(s.path)} (${stat(s)})`, '```diff', ...shown, d.length > 120 ? `… อีก ${d.length - 120} บรรทัด` : '', '```'].filter(Boolean).join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    steps = []
    counter = 0
    root = (await $.session.cwd()).replace(/[\\/]$/, '')
    isWindows = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\\\')
    await $.command.register({ name: 'tm', description: 'ย้อนเวลาไฟล์ที่ Claude แก้: ไทม์ไลน์ diff และ undo (/tm help)', argumentHint: 'diff <n> | undo <n> | pane' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ดักทุก tool ที่แก้ไฟล์
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit') return next(e)
    const path = 'file_path' in e ? String(e.file_path) : 'notebook_path' in e ? String(e.notebook_path) : ''
    if (!path) return next(e)
    let before: string | null
    try {
      before = await readOrNull($, path)
    } catch {
      return next(e) // ใหญ่เกินหรืออ่านไม่ได้ ไม่เก็บ
    }
    const r = await next(e)
    if (r.deny !== undefined || r.isError) return r
    const after = (await readOrNull($, path).catch(() => null)) ?? ''
    if (after === before) return r
    steps = [...steps.slice(-(MAX_STEPS - 1)), { n: ++counter, at: await $.clock.now(), tool: e.tool, path, before, after }]
    $.ui.invalidate('ui.render')
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (steps.length === 0) return <Text dimColor>ยังไม่มีการแก้ไฟล์</Text>
    return (
      <Box flexDirection="column">
        {steps.slice(-40).map(s => (
          <Text color={s.undone ? '#90a4ae' : undefined}>
            <Text color="#ffb74d">{`#${s.n} `}</Text>
            <Text dimColor>{`${hhmm(s.at)} `}</Text>
            {rel(s.path)}
            <Text color={s.before === null ? '#4fc3f7' : '#7cb342'}>{`  ${stat(s)}`}</Text>
            {s.undone ? ' ↩' : ''}
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'tm' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const find = (): Step | undefined => steps.find(s => s.n === Number(arg))
    switch (sub) {
      case '':
        return { text: timeline() }
      case 'pane':
        await $.ui.open({ id: PANE, title: '🕰 Time Machine' })
        return { text: 'เปิดแผงไทม์ไลน์แล้ว' }
      case 'diff': {
        const s = find()
        return { text: s ? diffText(s) : `ไม่พบขั้น #${arg ?? ''}\n${timeline(10)}` }
      }
      case 'undo': {
        const s = arg ? find() : [...steps].reverse().find(x => !x.undone)
        if (!s) return { text: `ไม่พบขั้นที่จะย้อน\n${timeline(10)}` }
        if (s.undone) return { text: `ขั้น #${s.n} ย้อนไปแล้ว` }
        try {
          const msg = await undo($, s)
          $.ui.invalidate('ui.render')
          return { text: msg }
        } catch (err) {
          return { text: `❌ ย้อนไม่สำเร็จ: ${String(err)}` }
        }
      }
      default:
        return { text: '🕰 Time Machine TH (Mod 84)\n/tm              ไทม์ไลน์การแก้ไฟล์\n/tm diff <ขั้น>   ดูว่าขั้นนั้นเปลี่ยนอะไร\n/tm undo [ขั้น]   ย้อนไฟล์กลับไปก่อนขั้นนั้น (ไม่ใส่ = ขั้นล่าสุด)\n/tm pane         เปิดแผงไทม์ไลน์' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. บันทึกไทม์ไลน์ลงไฟล์ ให้ย้อนได้แม้เปิด session ใหม่
 * 2. /tm undo-turn ย้อนทุกไฟล์ที่แก้ใน turn ล่าสุดทีเดียว (จับ turnId จาก turn.start)
 * 3. บอก Claude ว่าไฟล์ถูกย้อนแล้ว ด้วย context ของ prompt.submit ถัดไป
 */
