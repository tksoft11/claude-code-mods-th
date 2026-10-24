/**
 * ============================================================================
 * MOD 79: Live Diff TH - จอแยก diff สด + ผลลัพธ์ล่าสุด (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: จอแยกซ้าย-ขวาใน IDE ที่ดูโค้ดที่เปลี่ยนกับ terminal พร้อมกัน
 *
 * หน้าที่ของ Mod นี้:
 * 1. /livediff - เปิดสองแผง (เปิด $.ui.open สองครั้ง คนละ id):
 *    แผง Diff: git diff ของงานที่ยังไม่ commit ระบายสี + สรุป +/- ต่อไฟล์
 *    แผง Output: คำสั่ง Bash ล่าสุดที่ Claude รันและผลลัพธ์ (error เป็นสีแดง)
 * 2. อัปเดตเองทันทีที่ Claude แก้ไฟล์ (Edit / Write / MultiEdit) หรือรันคำสั่ง
 * 3. /livediff staged - ดูเฉพาะที่ git add แล้ว · /livediff file <path> - เฉพาะไฟล์เดียว
 */

import type { EngineInterface, Register } from 'claude-code'

const DIFF = 'live-diff-th'
const OUT = 'live-diff-output-th'
const MAX_LINES = 400

let mode: { staged: boolean; file: string } = { staged: false, file: '' }
let diffLines: string[] = []
let stat = ''
let lastCmd: { command: string; output: string; error: boolean } | undefined
let open = false

// ==========================================================================
// บทที่ 1: อ่าน diff (รวมไฟล์ใหม่ที่ยังไม่ track ด้วยการบอกชื่อ)
// ==========================================================================
async function refresh($: EngineInterface): Promise<void> {
  const base = ['diff', '--no-color', '-U2', ...(mode.staged ? ['--staged'] : []), ...(mode.file ? ['--', mode.file] : [])]
  const d = await $.process.run(['git', ...base], { timeoutMs: 20_000 }).catch(() => undefined)
  if (!d || d.exitCode !== 0) {
    diffLines = ['(ไม่ใช่ git repo หรือ git ใช้ไม่ได้)']
    stat = ''
    return
  }
  const s = await $.process.run(['git', 'diff', '--shortstat', ...(mode.staged ? ['--staged'] : [])], { timeoutMs: 20_000 }).catch(() => undefined)
  const untracked = mode.staged || mode.file ? undefined : await $.process.run(['git', 'ls-files', '--others', '--exclude-standard'], { timeoutMs: 20_000 }).catch(() => undefined)
  const extra = (untracked?.stdout ?? '').split('\n').filter(Boolean).slice(0, 20)
  diffLines = d.stdout.split('\n').slice(0, MAX_LINES)
  if (extra.length) diffLines.push('', ...extra.map(f => `?? ไฟล์ใหม่ (ยังไม่ git add): ${f}`))
  stat = s?.stdout.trim() ?? ''
  $.ui.invalidate('ui.render')
}

function colorOf(line: string): { color?: string; bold?: boolean; dim?: boolean } {
  if (line.startsWith('diff --git')) return { color: '#ffd54f', bold: true }
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) return { dim: true }
  if (line.startsWith('@@')) return { color: '#4dd0e1' }
  if (line.startsWith('+')) return { color: '#81c784' }
  if (line.startsWith('-')) return { color: '#e57373' }
  if (line.startsWith('??')) return { color: '#ba68c8' }
  return {}
}

// ชื่อไฟล์จากหัว diff ให้อ่านง่ายกว่าบรรทัด diff --git a/x b/x
function pretty(line: string): string {
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
  return m ? `📄 ${m[2]}` : line
}

const HELP = `🪟 Live Diff TH (Mod 79)
========================================
/livediff             เปิดสองแผง: diff สด + ผลลัพธ์คำสั่งล่าสุด
/livediff staged      ดูเฉพาะที่ git add แล้ว
/livediff file <path> ดูเฉพาะไฟล์เดียว
/livediff close       ปิดทั้งสองแผง`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    open = false
    await $.command.register({ name: 'livediff', description: 'จอแยก: git diff สดที่อัปเดตตาม Claude + ผลลัพธ์คำสั่งล่าสุด (/livediff help)', argumentHint: 'staged|file <path>|close' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: ฟังการแก้ไฟล์/รันคำสั่ง - อัปเดตแผงเฉพาะตอนเปิดอยู่
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!open || r.deny !== undefined) return r
    if (e.tool === 'Bash') {
      const result = r.isError ? (r.text ?? '') : `${(r.result as { stdout?: string }).stdout ?? ''}${(r.result as { stderr?: string }).stderr ? `\n${(r.result as { stderr?: string }).stderr}` : ''}`
      lastCmd = { command: e.command, output: result.trimEnd(), error: !!r.isError }
      await refresh($) // คำสั่งก็เปลี่ยนไฟล์ได้ (format, codegen)
    } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.tool)) {
      await refresh($)
    }
    return r
  })

  // ==========================================================================
  // บทที่ 3: สองแผง คนละ requestId
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: DIFF }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>{`${mode.staged ? 'staged' : 'ยังไม่ commit'}${mode.file ? ` · ${mode.file}` : ''} · ${stat || 'ไม่มีการเปลี่ยนแปลง'}`}</Text>
        {diffLines.map(line => {
          const c = colorOf(line)
          return (
            <Text color={c.color} bold={c.bold} dimColor={c.dim} wrap="truncate-end">
              {pretty(line) || ' '}
            </Text>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: OUT }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!lastCmd) return <Text dimColor>ยังไม่มีคำสั่งที่ Claude รันหลังเปิดแผง</Text>
    const lines = lastCmd.output.split('\n').slice(-120)
    return (
      <Box flexDirection="column">
        <Text color="#ffd54f" wrap="truncate-end">{`$ ${lastCmd.command}`}</Text>
        {lines.map(line => (
          <Text color={lastCmd?.error || /\b(?:error|failed|fatal|exception)\b|✘|✖/i.test(line) ? '#ef5350' : /\bwarn/i.test(line) ? '#ffca28' : undefined} wrap="truncate-end">
            {line || ' '}
          </Text>
        ))}
        <Text dimColor>{lastCmd.error ? '❌ จบด้วย error' : '✅ สำเร็จ'}</Text>
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === DIFF) open = false
    return next(e)
  })

  on('command.run', { command: 'livediff' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'help') return { text: HELP }
    if (sub === 'close') {
      open = false
      await $.ui.close({ id: DIFF }).catch(() => undefined)
      await $.ui.close({ id: OUT }).catch(() => undefined)
      return { text: '🪟 ปิดแผงแล้ว' }
    }
    mode = { staged: sub === 'staged', file: sub === 'file' ? rest.join(' ') : '' }
    open = true
    await refresh($)
    await $.ui.open({ id: DIFF, title: '🪟 Diff' })
    await $.ui.open({ id: OUT, title: '🖥️ Output' })
    $.ui.invalidate('ui.render')
    return { text: `🪟 เปิดสองแผงแล้ว · ${stat || 'ยังไม่มีการเปลี่ยนแปลง'}\nแผงจะอัปเดตเองเมื่อ Claude แก้ไฟล์หรือรันคำสั่ง` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. diff แบบซ้าย-ขวา (side by side) เมื่อแผงกว้างพอ
 * 2. กดที่ไฟล์ในแผง diff เพื่อ revert เฉพาะไฟล์นั้น (ถามก่อน)
 * 3. เก็บประวัติคำสั่ง 10 รายการล่าสุดในแผง Output
 */
