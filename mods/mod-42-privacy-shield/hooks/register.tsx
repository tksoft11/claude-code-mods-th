/**
 * ============================================================================
 * MOD 42: Privacy Shield TH - บังจอตอนแชร์หน้าจอ + ปิดบังข้อมูลลับ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ปุ่ม "ซ่อนจอ" และโหมดนำเสนอของโปรแกรมประชุมออนไลน์
 *
 * หน้าที่ของ Mod นี้:
 * 1. /shield - เปิดแผงสงบๆ (นาฬิกา + ข้อความ) บังเนื้อหาตอนแชร์จอหรือมีคนเดินผ่าน
 * 2. /shield mask on - ปิดบัง API key / รหัสผ่าน / token ในผลลัพธ์ Bash ก่อนขึ้นจอ
 * 3. /shield focus <งาน> - การ์ดโฟกัสงานเดียว พร้อมเวลาที่ใช้ไป
 * 4. /shield today - สรุปงานวันนี้จาก git log ของจริง (ไว้ตอบคำถาม "วันนี้ทำอะไรไป")
 *
 * หมายเหตุ: ต้นฉบับมี "จอปลอม Excel/อีเมล" ไว้หลอกคนดู
 * ฉบับนี้ตัดออก เน้นความเป็นส่วนตัวและโฟกัสจริงๆ ไม่สร้างข้อมูลปลอม
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const PANE = 'privacy-shield-th'
let mode: 'cover' | 'focus' = 'cover'
let message = 'พักหน้าจอสักครู่'
let focusTask = ''
let focusStart = 0
let masking = false
let ticker: Timer | undefined

// ==========================================================================
// บทที่ 1: รูปแบบข้อมูลลับที่ต้องปิดบัง (ชุดเดียวกับ Mod 15 Cyber Guard)
// ==========================================================================
const SECRETS: RegExp[] = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g, // OpenAI
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, // GitHub token
  /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g, // Stripe
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]
// KEY=value / password: value ในไฟล์ .env หรือ config
const ASSIGN = /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)([^\s"']{4,})\3/gi

function mask(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const re of SECRETS)
    out = out.replace(re, m => {
      count++
      return `${m.slice(0, 4)}${'•'.repeat(8)}`
    })
  out = out.replace(ASSIGN, (_m, key: string, sep: string, q: string) => {
    count++
    return `${key}${sep}${q}${'•'.repeat(8)}${q}`
  })
  return { text: out, count }
}

function clockText(ms: number): { time: string; date: string } {
  const d = new Date(ms)
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
  return {
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    date: `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`,
  }
}

function minutes(ms: number): string {
  const m = Math.floor(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาที` : `${m} นาที`
}

// ==========================================================================
// บทที่ 2: เปิด/ปิดแผง - นาฬิกาเดินเฉพาะตอนแผงเปิดอยู่
// ==========================================================================
async function openShield($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: mode === 'focus' ? '🎯 Focus' : '🛡️ Privacy' })
  ticker ??= $.clock.every(15_000, () => $.ui.invalidate('ui.render'))
  $.ui.status(mode === 'focus' ? `🎯 ${focusTask}` : '🛡️ โหมดส่วนตัว')
  $.ui.invalidate('ui.render')
}

async function closeShield($: EngineInterface): Promise<void> {
  ticker?.cancel()
  ticker = undefined
  $.ui.status(masking ? '🎭 ปิดบังข้อมูลลับ' : undefined)
  await $.ui.close({ id: PANE })
}

const HELP = `🛡️ Privacy Shield TH (Mod 42)
========================================
/shield [ข้อความ]       บังจอด้วยแผงนาฬิกาสงบๆ (กด Esc หรือ /shield off เพื่อปิด)
/shield off             ปิดแผง
/shield mask on|off     ปิดบัง key/รหัสผ่าน/token ในผลลัพธ์ Bash (ตอนนี้: MASK)
/shield focus <งาน>     การ์ดโฟกัสงานเดียว
/shield today           สรุป commit วันนี้จาก git (ของจริง)`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    masking = ((await $.store.get('masking')) as boolean | undefined) ?? false
    if (masking) $.ui.status('🎭 ปิดบังข้อมูลลับ')
    await $.command.register({ name: 'shield', description: 'บังจอตอนแชร์หน้าจอ ปิดบังข้อมูลลับ และโหมดโฟกัส (/shield help)', argumentHint: '[ข้อความ]|off|mask on|focus <งาน>|today' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดักผลลัพธ์ Bash แล้วปิดบังข้อมูลลับก่อนแสดงบนจอ (และก่อนโมเดลอ่าน)
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (!masking || r.deny !== undefined || r.isError) return r
    const out = mask(r.result.stdout)
    const err = mask(r.result.stderr)
    if (out.count + err.count === 0) return r
    $.ui.toast(`🎭 ปิดบังข้อมูลลับ ${out.count + err.count} จุด`)
    return { result: { ...r.result, stdout: out.text, stderr: err.text } }
  })

  // ==========================================================================
  // บทที่ 4: แผงบังจอ - ตัวใหญ่ อ่านง่าย ไม่มีข้อมูลงาน
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const { time, date } = clockText(now)
    if (mode === 'focus') {
      return (
        <Box flexDirection="column" alignItems="center" paddingY={1}>
          <Text dimColor>งานเดียวที่สำคัญตอนนี้</Text>
          <Text bold color="#26a69a">
            🎯 {focusTask}
          </Text>
          <Text dimColor>
            โฟกัสมาแล้ว {minutes(now - focusStart)} · {time}
          </Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Text bold color="#7e9cd8">
          {time}
        </Text>
        <Text dimColor>{date}</Text>
        <Text color="#98bb6c">🌿 {message}</Text>
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      ticker?.cancel()
      ticker = undefined
      $.ui.status(masking ? '🎭 ปิดบังข้อมูลลับ' : undefined)
    }
    return next(e)
  })

  on('command.run', { command: 'shield' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'help':
        return { text: HELP.replace('MASK', masking ? 'เปิด' : 'ปิด') }
      case 'off':
        await closeShield($)
        return { text: '👋 ปิดแผงบังจอแล้ว' }
      case 'mask': {
        if (rest[0] !== 'on' && rest[0] !== 'off') return { text: `🎭 ปิดบังข้อมูลลับ: ${masking ? 'เปิด' : 'ปิด'}  (/shield mask on|off)` }
        masking = rest[0] === 'on'
        await $.store.set('masking', masking)
        $.ui.status(masking ? '🎭 ปิดบังข้อมูลลับ' : undefined)
        return { text: masking ? '🎭 เปิดการปิดบังแล้ว: key/รหัสผ่าน/token ในผลลัพธ์ Bash จะเป็น ••••••••' : 'ปิดการปิดบังแล้ว' }
      }
      case 'focus': {
        if (rest.length === 0) return { text: 'วิธีใช้: /shield focus เขียนรายงานลูกค้า' }
        mode = 'focus'
        focusTask = rest.join(' ').slice(0, 60)
        focusStart = await $.clock.now()
        await openShield($)
        return { text: `🎯 โฟกัส: ${focusTask}` }
      }
      case 'today': {
        // ดึง commit ของวันนี้จาก git จริง (ถ้าโฟลเดอร์นี้ไม่ใช่ repo ก็บอกตรงๆ)
        const run = await $.process.run(['git', 'log', '--since=midnight', '--pretty=format:%h %s'], { timeoutMs: 10_000 }).catch(() => undefined)
        if (!run || run.exitCode !== 0) return { text: '❌ โฟลเดอร์นี้ไม่ใช่ git repo หรือไม่มี git' }
        const lines = run.stdout.split('\n').filter(Boolean)
        if (lines.length === 0) return { text: '📋 วันนี้ยังไม่มี commit ในโปรเจกต์นี้' }
        return { text: [`📋 วันนี้ทำไป ${lines.length} commit`, ...lines.slice(0, 20).map(l => `  • ${l}`)].join('\n') }
      }
      default:
        mode = 'cover'
        if (e.args.trim()) message = e.args.trim().slice(0, 60)
        await openShield($)
        return { text: '🛡️ บังจอแล้ว (/shield off เพื่อปิด)' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ปิดบังข้อมูลลับในผลลัพธ์ Read ด้วย (ไฟล์ .env)
 * 2. เปิดโหมดส่วนตัวอัตโนมัติเมื่อเปิดโปรแกรมประชุม (เช็ค process ด้วย $.process.run)
 * 3. ซ่อนชื่อโฟลเดอร์/ชื่อลูกค้าในแถบสถานะตอนนำเสนอ
 */
