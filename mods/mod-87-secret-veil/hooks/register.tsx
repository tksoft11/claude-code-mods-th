/**
 * ============================================================================
 * MOD 87: Secret Veil TH - ปิด secret ก่อนถึงตา Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: secrets-veil และ secret-redactor ใน awesome-claude-code-mods
 *
 * ต่างจาก Mod 15 Cyber Guard: Cyber Guard ตรวจตอน Claude "เขียน" secret ลงไฟล์
 * Mod นี้ปิดตอน Claude "อ่าน" เจอ secret เช่น cat .env, Read config, env, git log
 * ค่าจริงจึงไม่เข้า context ไม่ถูกส่งไปที่ API และไม่อยู่ใน transcript
 *
 * หน้าที่ของ Mod นี้:
 * 1. ผลของ Bash และ Read ที่มี API key, token, รหัสผ่าน, private key, JWT,
 *    รหัสใน connection string -> เปลี่ยนเป็น ‹secret:N› ก่อนส่งให้ Claude
 * 2. Claude ยังใช้งานได้: ถ้า Claude ใส่ ‹secret:N› ในคำสั่ง Bash หรือใน Write/Edit
 *    Mod จะใส่ค่าจริงกลับให้ตอนรัน (Claude ไม่เคยเห็นค่าจริง)
 * 3. tool อื่น (Grep, WebFetch, MCP) ที่ผลมี secret: ส่งฉบับที่ปิดแล้วแทน
 * 4. /veil ดูว่าปิดอะไรไปบ้าง (แสดงแค่ 4 ตัวแรก)
 *
 * ข้อจำกัด: ตรวจด้วยรูปแบบ (regex) จับได้เฉพาะ secret ที่หน้าตาเป็นแบบที่รู้จัก
 */

import type { EngineInterface, Register } from 'claude-code'

let enabled = true
// ค่าจริง -> เลข และ เลข -> ค่าจริง (อยู่ในหน่วยความจำของ session เท่านั้น ไม่เขียนลงไฟล์)
let ids = new Map<string, number>()
let values = new Map<number, { value: string; kind: string }>()
let maskedCount = 0

// ==========================================================================
// บทที่ 1: รูปแบบ secret
// ==========================================================================
const VENDOR: { kind: string; regex: RegExp }[] = [
  { kind: 'Private Key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----/g },
  { kind: 'AWS Key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'GitHub Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { kind: 'Anthropic Key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'OpenAI Key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'Stripe Key', regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { kind: 'Google Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'Slack Token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
]
// ชื่อตัวแปรที่บอกว่าเป็นของลับ: API_KEY=..., "password": "...", token: ...
const SECRET_NAME = '[A-Za-z0-9_.-]*(?:secret|token|api[_-]?key|access[_-]?key|private[_-]?key|password|passwd|pwd|credential|auth|dsn)[A-Za-z0-9_.-]*'
const ASSIGN = new RegExp(`(\\b${SECRET_NAME}["']?\\s*[=:]\\s*["']?)([^\\s"'\`,;#]{6,})`, 'gi')
const URL_CREDS = /(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s]{3,})(@)/gi
const BEARER = /(\bBearer\s+)([A-Za-z0-9._~+/-]{16,}=*)/g
// ค่าที่ไม่ใช่ secret จริง (ตัวอย่าง, ตัวแปร, placeholder)
const NOT_SECRET = /^(true|false|null|undefined|none|required|optional|string|number|example|changeme|xxx+|\*+|<.*>|\$\{?.*|process\.env.*|os\.environ.*|your[_-].*|‹secret:\d+›)$/i

function placeholder(value: string, kind: string): string {
  let id = ids.get(value)
  if (id === undefined) {
    id = ids.size + 1
    ids.set(value, id)
    values.set(id, { value, kind })
  }
  maskedCount++
  return `‹secret:${id}›`
}

// ==========================================================================
// บทที่ 2: ปิดและเปิด
// ==========================================================================
function veil(text: string): string {
  let out = text
  for (const v of VENDOR) out = out.replace(v.regex, m => placeholder(m, v.kind))
  out = out.replace(ASSIGN, (whole, head: string, value: string) => (NOT_SECRET.test(value) ? whole : head + placeholder(value, 'ค่าลับในตัวแปร')))
  out = out.replace(URL_CREDS, (whole, head: string, value: string, at: string) => (NOT_SECRET.test(value) ? whole : head + placeholder(value, 'รหัสใน URL') + at))
  out = out.replace(BEARER, (_, head: string, value: string) => head + placeholder(value, 'Bearer Token'))
  return out
}

function unveil(text: string): string {
  return text.replace(/‹secret:(\d+)›/g, (whole, n: string) => values.get(Number(n))?.value ?? whole)
}

const HINT = 'Secret Veil: ค่าลับในผลนี้ถูกแทนด้วย ‹secret:N› ใช้ ‹secret:N› ในคำสั่ง Bash หรือ Write/Edit ได้เลย ระบบจะใส่ค่าจริงให้ตอนรัน อย่าขอให้ผู้ใช้เปิดเผยค่าจริง'

function status($: EngineInterface): void {
  $.ui.status(enabled && values.size ? `🫥 ปิด secret ${values.size} ค่า` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    ids = new Map()
    values = new Map()
    maskedCount = 0
    await $.command.register({ name: 'veil', description: 'ปิด secret ในผลของ tool ก่อนถึง Claude (/veil help)', argumentHint: 'on|off' })
    status($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ใส่ค่าจริงกลับ ก่อน tool รัน (Claude เขียน ‹secret:N› มา)
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = unveil(e.command)
    const r = await next(command === e.command ? e : { ...e, command })
    if (!enabled || r.deny !== undefined) return r
    if (r.isError) {
      // ผลที่ error แก้โครงสร้างไม่ได้: ส่งข้อความที่ปิดแล้วแทน
      const masked = veil(r.text ?? '')
      return masked === (r.text ?? '') ? r : { deny: `${masked}\n\n${HINT}` }
    }
    const stdout = veil(r.result.stdout)
    const stderr = veil(r.result.stderr)
    if (stdout === r.result.stdout && stderr === r.result.stderr) return r
    status($)
    return { result: { ...r.result, stdout, stderr }, context: [HINT] }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const content = unveil(e.content)
    return next(content === e.content ? e : { ...e, content })
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const old_string = unveil(e.old_string)
    const new_string = unveil(e.new_string)
    return next(old_string === e.old_string && new_string === e.new_string ? e : { ...e, old_string, new_string })
  })

  // ==========================================================================
  // บทที่ 4: ปิดผลของ Read และ tool อื่น
  // ==========================================================================
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    if (!enabled || r.deny !== undefined || r.isError || r.result.type !== 'text') return r
    const content = veil(r.result.file.content)
    if (content === r.result.file.content) return r
    status($)
    return { result: { ...r.result, file: { ...r.result.file, content } }, context: [HINT] }
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!enabled || ['Bash', 'Read', 'Write', 'Edit'].includes(e.tool) || r.deny !== undefined || !r.text) return r
    const masked = veil(r.text)
    if (masked === r.text) return r
    status($)
    // ผลของ tool อื่นมีหลายรูปแบบ: ส่งข้อความที่ปิดแล้วแทนทั้งก้อน
    return { deny: `${masked}\n\n${HINT}` }
  })

  on('command.run', { command: 'veil' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') {
      enabled = arg === 'on'
      await $.store.set('enabled', enabled)
      status($)
      return { text: `🫥 Secret Veil: ${enabled ? 'เปิด' : 'ปิด (Claude จะเห็นค่าจริง)'}` }
    }
    if (arg === '') {
      const lines = [`🫥 Secret Veil TH (Mod 87): ${enabled ? 'เปิด' : 'ปิด'} · ปิดไปแล้ว ${maskedCount} ครั้ง`, '']
      if (values.size === 0) lines.push('ยังไม่เจอ secret ใน session นี้')
      for (const [id, v] of values) lines.push(`‹secret:${id}›  ${v.kind.padEnd(14)} ${v.value.slice(0, 4)}…(${v.value.length} ตัว)`)
      return { text: lines.join('\n') }
    }
    return { text: '🫥 Secret Veil TH (Mod 87)\n/veil          ดู secret ที่ปิดไป (แสดง 4 ตัวแรก)\n/veil on|off   เปิด/ปิด' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. จับ secret ที่ไม่มีรูปแบบด้วยค่า entropy (สุ่มมากผิดปกติ)
 * 2. อ่านค่าจาก .env ของโปรเจกต์ตอนเริ่ม session แล้วปิดค่าเหล่านั้นทุกที่ที่โผล่
 * 3. ปิด secret ในสิ่งที่วาดบนจอด้วย (ดู Mod 42 Privacy Shield)
 */
