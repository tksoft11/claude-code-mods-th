/**
 * ============================================================================
 * MOD 46: AI Limit TH - ดูโควตา Claude แบบน่ารัก (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: แอปดูลิมิต AI แบบน่ารัก (ขอบคุณไอเดียจาก PIKORI ของคุณ Ron Thitisak)
 *
 * หน้าที่ของ Mod นี้:
 * 1. อ่านลิมิตจริงจาก Claude Code: หน้าต่าง 5 ชั่วโมง และ 7 วัน (เฉพาะแพ็กเกจสมาชิก)
 *    พร้อมเวลารีเซ็ต, การใช้ context และค่าใช้จ่ายของ session
 * 2. แมวแม่มดน้อยเปลี่ยนหน้าตามโควตาที่เหลือ: สบายๆ → เริ่มกังวล → ตกใจ
 * 3. เตือนก่อนเต็ม (ค่าเริ่มต้น 80% และ 95%) และโชว์ย่อในแถบสถานะ
 * 4. นักบัญชี: รวมค่าใช้จ่ายทุก session ของวันนี้ ตั้งงบรายวันได้ เตือนที่ 80% และเมื่อเกิน
 *
 * ข้อมูลมาจาก event session.measure ที่ engine ส่งมาทุกครั้งที่ตัวเลขขยับ
 * ไม่ต้องยิง API เอง และไม่มีข้อมูลสมมติ
 */

import type { EngineInterface, Register, SessionMeasureInput } from 'claude-code'

const PANE = 'ai-limit-th'
const WINDOW_NAME: Record<string, string> = { five_hour: '5 ชั่วโมง', seven_day: '7 วัน', spend_limit: 'วงเงิน' }

let usage: Omit<SessionMeasureInput, 'changed'> | undefined
let settings: { status: boolean; warnAt: number[]; budget?: number } = { status: true, warnAt: [80, 95] }
// จำว่าเตือนระดับไหนไปแล้วของหน้าต่างไหน (รีเซ็ตเมื่อหน้าต่างรีเซ็ต)
let warned: Record<string, number> = {}
// นักบัญชี: ยอดใช้จ่ายรวมของวันนี้ (ทุก session) และยอดของ session นี้ที่นับไปแล้ว
let spend = { day: '', usd: 0, warned: 0 }
let sessionUsd = 0

function today(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function money(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`
}

// ==========================================================================
// บทที่ 1: แมวแม่มดตามระดับโควตาที่ใช้ไป
// ==========================================================================
function witch(percent: number): { face: string; say: string; color: string } {
  if (percent >= 95) return { face: '/\\_/\\\n(⊙_⊙;)🧹', say: 'ไม้กวาดจะหมดแรงแล้ว! พักก่อนนะ', color: '#e53935' }
  if (percent >= 80) return { face: '/\\_/\\\n(・_・;)🧹', say: 'เริ่มเยอะแล้ว ใช้อย่างประหยัดหน่อย', color: '#fb8c00' }
  if (percent >= 50) return { face: '/\\_/\\\n( •ω•)🧹', say: 'ใช้ไปครึ่งทางแล้ว ยังไหวๆ', color: '#fdd835' }
  return { face: '/\\_/\\\n( ^ω^)🧹✨', say: 'โควตาเหลือเยอะ ลุยเลย!', color: '#7cb342' }
}

function bar(percent: number, width = 20): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function untilReset(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!(ms > 0)) return 'รีเซ็ตแล้ว'
  const m = Math.ceil(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return `รีเซ็ตใน ${d ? `${d} วัน ` : ''}${h ? `${h} ชม. ` : ''}${m % 60} นาที`
}

function windowName(kind: string): string {
  return WINDOW_NAME[kind] ?? kind
}

function maxPercent(): number {
  return Math.max(0, ...(usage?.rateLimits ?? []).map(r => r.percentUsed))
}

// ==========================================================================
// บทที่ 2: แถบสถานะย่อ + เตือนตอนข้ามเกณฑ์
// ==========================================================================
function updateStatus($: EngineInterface): void {
  const limits = usage?.rateLimits ?? []
  const wallet = settings.budget ? `💸 ${money(spend.usd)}/${money(settings.budget)}` : ''
  if (!settings.status || (limits.length === 0 && !wallet)) {
    $.ui.status(undefined)
    return
  }
  const icon = maxPercent() >= 95 ? '🙀' : maxPercent() >= 80 ? '😿' : '😺'
  const parts = limits.map(r => `${r.kind === 'five_hour' ? '5ชม' : r.kind === 'seven_day' ? '7วัน' : r.kind} ${Math.round(r.percentUsed)}%`)
  $.ui.status([limits.length ? `${icon} ${parts.join(' · ')}` : '', wallet].filter(Boolean).join(' | '))
}

// ==========================================================================
// บทที่ 2.5: นักบัญชี - รวมค่าใช้จ่ายทุก session ของวันนี้ แล้วเทียบกับงบที่ตั้งไว้
// ==========================================================================
async function account($: EngineInterface, sessionTotal: number): Promise<void> {
  const delta = Math.max(0, sessionTotal - sessionUsd)
  sessionUsd = sessionTotal
  if (delta === 0) return
  const day = today(await $.clock.now())
  spend = spend.day === day ? { ...spend, usd: spend.usd + delta } : { day, usd: delta, warned: 0 }
  if (settings.budget) {
    const pct = (spend.usd / settings.budget) * 100
    const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0
    if (level > spend.warned) {
      spend = { ...spend, warned: level }
      $.ui.toast(level >= 100 ? `💸 ใช้เกินงบวันนี้แล้ว ${money(spend.usd)} / ${money(settings.budget)}` : `💰 ใช้ไป ${Math.round(pct)}% ของงบวันนี้ (${money(spend.usd)} / ${money(settings.budget)})`, { timeoutMs: 12_000 })
    }
  }
  await $.store.set('spend', spend)
}

function checkWarnings($: EngineInterface): void {
  for (const r of usage?.rateLimits ?? []) {
    const key = `${r.kind}@${r.resetsAt ?? ''}`
    const level = [...settings.warnAt].sort((a, b) => b - a).find(t => r.percentUsed >= t)
    if (level !== undefined && (warned[key] ?? 0) < level) {
      warned[key] = level
      $.ui.toast(`${level >= 95 ? '🙀' : '😿'} ลิมิต ${windowName(r.kind)} ใช้ไป ${r.percentUsed}% แล้ว`, { timeoutMs: 12_000 })
    }
  }
}

const HELP = `🐱 AI Limit TH (Mod 46)
========================================
/ailimit                 ดูโควตา + เปิดแผงแมวแม่มด
/ailimit status on|off   ย่อในแถบสถานะ
/ailimit warn 70 90      ตั้งเกณฑ์เตือน (%)
/ailimit budget 5        งบค่าใช้จ่ายต่อวัน (ดอลลาร์) เตือนที่ 80% และเมื่อเกิน | budget off
ลิมิต 5 ชั่วโมง/7 วันมีเฉพาะแพ็กเกจสมาชิก และจะมีตัวเลขหลังคำตอบแรกของ session`

function summary(now: number): string {
  if (!usage) return '⏳ ยังไม่มีข้อมูล รอคำตอบแรกของ Claude ก่อนนะ'
  const lines = [`${witch(maxPercent()).face.replace('\n', ' ')}  ${witch(maxPercent()).say}`, '']
  if (usage.rateLimits.length === 0) lines.push('ไม่มีข้อมูลลิมิต (ใช้ API key หรือยังไม่ได้รับตัวเลข)')
  for (const r of usage.rateLimits) lines.push(`${windowName(r.kind).padEnd(10)} ${bar(r.percentUsed)} ${String(r.percentUsed).padStart(5)}%  ${untilReset(r.resetsAt, now)}`)
  if (usage.context.percent !== undefined) lines.push(`${'context'.padEnd(10)} ${bar(usage.context.percent)} ${String(Math.round(usage.context.percent)).padStart(5)}%  ของ ${usage.context.window.toLocaleString('en-US')} tokens`)
  if (usage.cost) lines.push(`💸 session นี้ ${money(usage.cost.usd)} · วันนี้รวม ${money(spend.usd)}${settings.budget ? ` / งบ ${money(settings.budget)} (${Math.round((spend.usd / settings.budget) * 100)}%)` : ' (ตั้งงบ: /ailimit budget 5)'}`)
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = { ...settings, ...((await $.store.get('settings')) as typeof settings | undefined) }
    warned = {}
    sessionUsd = 0
    spend = { day: '', usd: 0, warned: 0, ...((await $.store.get('spend')) as typeof spend | undefined) }
    if (spend.day !== today(await $.clock.now())) spend = { day: today(await $.clock.now()), usd: 0, warned: 0 }
    await $.command.register({ name: 'ailimit', description: 'ดูโควตา Claude (5 ชม./7 วัน) แบบน่ารัก ค่าใช้จ่ายรายวัน และเตือนก่อนเต็ม (/ailimit help)', argumentHint: 'status on|off | warn <%> <%> | budget <usd>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: รับตัวเลขจาก engine ทุกครั้งที่ขยับ
  // ==========================================================================
  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits, cost: e.cost }
    if (e.cost) await account($, e.cost.usd)
    checkWarnings($)
    updateStatus($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงแมวแม่มด
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const w = witch(maxPercent())
    const limits = usage?.rateLimits ?? []
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box flexDirection="column">
            {w.face.split('\n').map(l => (
              <Text color="#9575cd">{l}</Text>
            ))}
          </Box>
          <Text color={w.color}>{usage ? w.say : 'รอคำตอบแรกก่อนนะ…'}</Text>
        </Box>
        {usage && limits.length === 0 && <Text dimColor>ไม่มีข้อมูลลิมิต (API key หรือยังไม่ได้รับตัวเลข)</Text>}
        {limits.map(r => (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              {windowName(r.kind)} <Text color={witch(r.percentUsed).color}>{bar(r.percentUsed)}</Text> {r.percentUsed}%
            </Text>
            <Text dimColor>{untilReset(r.resetsAt, now)}</Text>
          </Box>
        ))}
        {usage?.context.percent !== undefined && (
          <Box marginTop={1}>
            <Text>
              context <Text color="#4fc3f7">{bar(usage.context.percent)}</Text> {Math.round(usage.context.percent)}%
            </Text>
          </Box>
        )}
        {usage?.cost && (
          <Text dimColor>
            💸 session {money(usage.cost.usd)} · วันนี้ {money(spend.usd)}
            {settings.budget ? ` / งบ ${money(settings.budget)}` : ''}
          </Text>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'ailimit' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        // ยังไม่มี measurement? ลองถามตรงๆ ก่อน (ฟรี ไม่เสีย token)
        if (!usage) {
          const u = await $.session.usage().catch(() => undefined)
          if (u && (u.rateLimits.length || u.context.percent !== undefined)) usage = { context: u.context, rateLimits: u.rateLimits, cost: u.cost }
        }
        await $.ui.open({ id: PANE, title: '🐱 AI Limit' })
        $.ui.invalidate('ui.render')
        return { text: summary(await $.clock.now()) }
      }
      case 'status':
        if (rest[0] !== 'on' && rest[0] !== 'off') return { text: 'วิธีใช้: /ailimit status on|off' }
        settings = { ...settings, status: rest[0] === 'on' }
        await $.store.set('settings', settings)
        updateStatus($)
        return { text: `แถบสถานะ: ${settings.status ? 'แสดง' : 'ซ่อน'}` }
      case 'budget': {
        if (rest[0] === 'off') {
          settings = { ...settings, budget: undefined }
          await $.store.set('settings', settings)
          updateStatus($)
          return { text: 'ยกเลิกงบรายวันแล้ว' }
        }
        const usd = Number(rest[0])
        if (!(usd > 0 && usd <= 10_000)) return { text: `วิธีใช้: /ailimit budget 5  (ดอลลาร์ต่อวัน) | budget off\nวันนี้ใช้ไป ${money(spend.usd)}` }
        settings = { ...settings, budget: usd }
        spend = { ...spend, warned: 0 }
        await $.store.set('settings', settings)
        updateStatus($)
        return { text: `💰 งบวันละ ${money(usd)} · วันนี้ใช้ไป ${money(spend.usd)} (${Math.round((spend.usd / usd) * 100)}%)` }
      }
      case 'warn': {
        const levels = rest.map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 100)
        if (levels.length === 0 || levels.length !== rest.length) return { text: `วิธีใช้: /ailimit warn 80 95  (ตอนนี้: ${settings.warnAt.join(', ')}%)` }
        settings = { ...settings, warnAt: levels }
        await $.store.set('settings', settings)
        warned = {}
        return { text: `🔔 เตือนที่ ${levels.join(', ')}%` }
      }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. บันทึกเปอร์เซ็นต์ทุกชั่วโมงแล้ววาดกราฟการใช้ย้อนหลัง
 * 2. ทำนายว่าจะเต็มเมื่อไหร่จากอัตราการใช้ช่วงล่าสุด
 * 3. ส่งเตือนไปมือถือเมื่อเกิน 95% (ต่อกับ Mod 22)
 */
