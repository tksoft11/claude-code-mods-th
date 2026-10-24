/**
 * ============================================================================
 * MOD 61: Log Fold TH - พับ output ยาวๆ แต่ไม่ให้ error หลุดสายตา (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: log ของ npm install / build ที่ยาว 300 บรรทัด แต่ error สำคัญอยู่บรรทัดที่ 147
 *
 * หน้าที่ของ Mod นี้:
 * 1. ผลลัพธ์ Bash ที่ยาวเกิน 30 บรรทัด จะแสดงแค่หัว 10 + ท้าย 10 บรรทัด
 * 2. บรรทัด error / warning ที่อยู่ในช่วงที่ถูกพับ ดึงขึ้นมาแสดงไว้ตรงกลาง (สูงสุด 8 บรรทัด)
 * 3. ระบายสี: error แดง, warning เหลือง, ผ่าน/สำเร็จ เขียว
 * 4. กด ctrl+o (มุมมองเต็ม) จะเห็น output ทั้งหมดตามปกติ - Mod ไม่แตะสิ่งที่ Claude อ่าน
 */

import type { Register } from 'claude-code'

const FOLD_OVER = 30
const KEEP = 10
const MAX_PICKED = 8

// "ERR!" ลงท้ายด้วย ! ซึ่งไม่ใช่ตัวอักษร จึงต้องแยกออกจากกลุ่มที่มี \b ปิดท้าย
const ERROR = /\b(?:error|failed|failure|fatal|exception|traceback|panic|cannot|undefined is not|not found)\b|\bERR!|✘|✖|❌/i
const WARN = /\b(?:warn(?:ing)?|deprecated)\b|⚠/i
const OK = /\b(?:passed|success(?:ful(?:ly)?)?|done|compiled|ready|✓|✔)\b|✅/i

function colorOf(line: string): string | undefined {
  if (ERROR.test(line)) return '#ef5350'
  if (WARN.test(line)) return '#ffca28'
  if (OK.test(line)) return '#66bb6a'
  return undefined
}

let enabled = true
let folded = 0

// ==========================================================================
// บทที่ 1: แบ่ง output เป็น หัว / บรรทัดสำคัญที่ถูกพับ / ท้าย
// ==========================================================================
function fold(text: string): { head: string[]; picked: { n: number; line: string }[]; hidden: number; tail: string[]; errors: number; warnings: number } | undefined {
  const lines = text.replace(/\s+$/, '').split('\n')
  if (lines.length <= FOLD_OVER) return undefined
  const middle = lines.slice(KEEP, lines.length - KEEP)
  const important = middle.map((line, i) => ({ n: KEEP + i + 1, line })).filter(x => ERROR.test(x.line) || WARN.test(x.line))
  // error มาก่อน warning
  const picked = [...important.filter(x => ERROR.test(x.line)), ...important.filter(x => !ERROR.test(x.line))].slice(0, MAX_PICKED).sort((a, b) => a.n - b.n)
  return {
    head: lines.slice(0, KEEP),
    picked,
    hidden: middle.length - picked.length,
    tail: lines.slice(-KEEP),
    errors: lines.filter(l => ERROR.test(l)).length,
    warnings: lines.filter(l => !ERROR.test(l) && WARN.test(l)).length,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    folded = 0
    await $.command.register({ name: 'logfold', description: 'พับ output ยาวของ Bash แต่ดึงบรรทัด error/warning ขึ้นมาให้เห็น (/logfold on|off)', argumentHint: 'on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: วาดผลลัพธ์ Bash ใหม่ เฉพาะตอนไม่ได้ขยายดู (ctrl+o แสดงของเดิมทั้งหมด)
  // ==========================================================================
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!enabled || e.props.tool !== 'Bash' || e.props.isExpanded || e.props.isErrored) return next(e)
    const out = e.props.output as { stdout?: string; stderr?: string } | undefined
    const text = [out?.stdout ?? '', out?.stderr ?? ''].filter(Boolean).join('\n')
    const f = fold(text)
    if (!f) return next(e)
    folded++
    const { Box, Text } = $.ui.resolve(e)
    const row = (line: string) => (
      <Text color={colorOf(line)} wrap="truncate-end">
        {line || ' '}
      </Text>
    )
    return (
      <Box flexDirection="column">
        {f.head.map(l => row(l))}
        <Text dimColor>
          {`  ┄┄ พับไว้ ${f.hidden} บรรทัด`}
          {f.errors ? ` · ❌ ${f.errors}` : ''}
          {f.warnings ? ` · ⚠️ ${f.warnings}` : ''}
          {' · ctrl+o ดูทั้งหมด ┄┄'}
        </Text>
        {f.picked.map(p => (
          <Text color={colorOf(p.line)} wrap="truncate-end">
            {`  ${String(p.n).padStart(4)}│ ${p.line.trim()}`}
          </Text>
        ))}
        {f.picked.length > 0 && <Text dimColor>{'  ┄┄'}</Text>}
        {f.tail.map(l => row(l))}
      </Box>
    )
  })

  on('command.run', { command: 'logfold' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await $.store.set('enabled', enabled)
      $.ui.invalidate('ui.render')
      return { text: enabled ? '📜 พับ output ยาวแล้ว' : 'แสดง output แบบเดิมแล้ว' }
    }
    return { text: `📜 Log Fold (Mod 61) ${enabled ? 'เปิด' : 'ปิด'} · พับไปแล้ว ${folded} ครั้งใน session นี้\noutput ของ Bash ที่ยาวเกิน ${FOLD_OVER} บรรทัดจะเหลือหัว/ท้าย ${KEEP} บรรทัด + บรรทัด error/warning จากตรงกลาง\n/logfold on|off` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้ตั้งจำนวนบรรทัดหัว/ท้ายเองได้
 * 2. พับ output ของ tool อื่นด้วย (เช่น MCP ที่ตอบ JSON ยาวๆ)
 * 3. จำ "บรรทัดที่น่าสนใจ" ตามโปรเจกต์ เช่น คำว่า FAIL ของ jest
 */
