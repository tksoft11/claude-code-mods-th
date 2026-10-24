/**
 * ============================================================================
 * MOD 85: Loop Detective TH - จับตอน Claude วนลองซ้ำไม่จบ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: loop-detective ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. คำสั่ง Bash เดิมพังซ้ำ 3 ครั้ง: เตือนเรา และกระซิบบอก Claude ผ่าน context ของผล tool
 *    ให้หยุดลองซ้ำ แล้วหาสาเหตุจริงก่อน
 * 2. แก้ไปแก้กลับ (ping-pong): Edit ที่เปลี่ยน B กลับเป็น A หลังเพิ่งเปลี่ยน A เป็น B
 * 3. แก้ไฟล์เดิมเกิน 8 ครั้งใน turn เดียว: สัญญาณว่ากำลังเดาสุ่ม
 * 4. โหมดเข้มงวด (/detective strict on): คำสั่งที่พังซ้ำ 3 ครั้งแล้วจะถูกปฏิเสธจนกว่าเราจะพิมพ์ prompt ใหม่
 * 5. แถบเตือนเหนือช่องพิมพ์ และ /detective ดูคดีทั้งหมดของ session
 */

import type { EngineInterface, Register } from 'claude-code'

const FAIL_LIMIT = 3
const EDIT_LIMIT = 8

interface Case {
  at: number
  kind: 'repeat-fail' | 'ping-pong' | 'edit-storm'
  what: string
}

let strict = false
let cases: Case[] = []
let alert: Case | undefined
// นับความล้มเหลวติดกันต่อคำสั่ง (รีเซ็ตเมื่อคำสั่งนั้นสำเร็จ หรือเราพิมพ์ prompt ใหม่)
let fails = new Map<string, number>()
// ประวัติ Edit ต่อไฟล์ และจำนวนครั้งที่แก้ต่อไฟล์ใน turn นี้
let edits = new Map<string, { old: string; neu: string }[]>()
let editCount = new Map<string, number>()

const KIND_TH: Record<Case['kind'], string> = { 'repeat-fail': 'พังซ้ำ', 'ping-pong': 'แก้ไปแก้กลับ', 'edit-storm': 'แก้ไฟล์เดิมรัวๆ' }

function norm(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

function short(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function base(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// ==========================================================================
// บทที่ 1: เปิดคดี - เตือนเราและเก็บไว้ดูทีหลัง
// ==========================================================================
async function openCase($: EngineInterface, kind: Case['kind'], what: string): Promise<Case> {
  const c = { at: await $.clock.now(), kind, what }
  cases = [...cases.slice(-49), c]
  alert = c
  $.ui.toast(`🔍 Loop Detective: ${KIND_TH[kind]} - ${short(what, 70)}`, { timeoutMs: 10_000 })
  $.ui.invalidate('ui.render')
  return c
}

// ข้อความที่ Claude จะอ่านต่อท้ายผล tool (คนไม่เห็น)
const NUDGE = {
  'repeat-fail': (cmd: string, n: number) => `Loop Detective: คำสั่ง "${short(cmd, 120)}" ล้มเหลวแบบเดิม ${n} ครั้งติดแล้ว หยุดรันซ้ำ อ่าน error ให้ละเอียด หาสาเหตุจริง (ไฟล์ config, path, เวอร์ชัน, dependency) หรือถามผู้ใช้ก่อนลองแบบใหม่`,
  'ping-pong': (file: string) => `Loop Detective: Edit นี้เปลี่ยน ${file} กลับไปเป็นแบบที่เพิ่งแก้ออกไป (แก้ไปแก้กลับ) หยุดสลับไปมา สรุปให้ชัดว่าแต่ละแบบพังเพราะอะไร แล้วเลือกทางเดียว`,
  'edit-storm': (file: string, n: number) => `Loop Detective: แก้ ${file} ไปแล้ว ${n} ครั้งใน turn นี้ หยุดเดาทีละนิด อ่านไฟล์ทั้งไฟล์และ error ล่าสุดก่อน แล้ววางแผนการแก้ครั้งเดียว`,
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    strict = ((await $.store.get('strict')) as boolean | undefined) ?? false
    cases = []
    alert = undefined
    fails = new Map()
    edits = new Map()
    editCount = new Map()
    await $.command.register({ name: 'detective', description: 'จับตอน Claude วนลองซ้ำ: คำสั่งพังซ้ำ แก้ไปแก้กลับ (/detective help)', argumentHint: 'strict on|off | reset' })
    return next(e)
  })

  // prompt ใหม่จากเรา = เริ่มนับใหม่ (เราอาจบอกวิธีแก้ให้แล้ว)
  on('prompt.submit', async ($, e, next) => {
    fails = new Map()
    editCount = new Map()
    alert = undefined
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: คำสั่ง Bash ที่พังซ้ำ
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const key = norm(e.command)
    const before = fails.get(key) ?? 0
    // โหมดเข้มงวด: พังครบแล้ว ไม่ให้รันอีกจนกว่าเราจะพิมพ์ prompt ใหม่
    if (strict && before >= FAIL_LIMIT) {
      return { deny: `Loop Detective (strict): คำสั่งนี้ล้มเหลว ${before} ครั้งแล้ว ห้ามรันซ้ำจนกว่าผู้ใช้จะตอบ ให้สรุปสิ่งที่ลองไปและถามผู้ใช้` }
    }
    const r = await next(e)
    if (r.deny !== undefined) return r
    if (!r.isError) {
      fails.delete(key)
      if (alert?.kind === 'repeat-fail' && alert.what === key) {
        alert = undefined
        $.ui.invalidate('ui.render')
      }
      return r
    }
    const n = before + 1
    fails.set(key, n)
    if (n < FAIL_LIMIT) return r
    if (n === FAIL_LIMIT) await openCase($, 'repeat-fail', key)
    return { ...r, context: [...(r.context ?? []), NUDGE['repeat-fail'](key, n)] }
  })

  // ==========================================================================
  // บทที่ 3: แก้ไปแก้กลับ และแก้ไฟล์เดิมรัวๆ
  // ==========================================================================
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.isError || e.agentId) return r
    const file = base(e.file_path)
    const history = edits.get(e.file_path) ?? []
    const nudges: string[] = []
    if (history.some(h => h.old === e.new_string && h.neu === e.old_string)) {
      await openCase($, 'ping-pong', `${file}: "${short(e.old_string.trim(), 30)}" ↔ "${short(e.new_string.trim(), 30)}"`)
      nudges.push(NUDGE['ping-pong'](file))
    }
    edits.set(e.file_path, [...history.slice(-19), { old: e.old_string, neu: e.new_string }])
    const count = (editCount.get(e.file_path) ?? 0) + 1
    editCount.set(e.file_path, count)
    if (count === EDIT_LIMIT) {
      await openCase($, 'edit-storm', `${file} แก้ ${count} ครั้งใน turn เดียว`)
      nudges.push(NUDGE['edit-storm'](file, count))
    }
    return nudges.length ? { ...r, context: [...(r.context ?? []), ...nudges] } : r
  })

  // ==========================================================================
  // บทที่ 4: แถบเตือนเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!alert || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          <Text color="#ffb74d">{`🔍 ${KIND_TH[alert.kind]}: `}</Text>
          <Text>{short(alert.what, 60)}</Text>
          <Text dimColor>{strict ? '  · strict: บล็อกการลองซ้ำแล้ว' : '  · บอก Claude ให้หยุดคิดแล้ว'}</Text>
        </Text>
      </Box>
    )
  })

  on('command.run', { command: 'detective' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    switch (sub) {
      case '': {
        const lines = [`🔍 Loop Detective TH (Mod 85) · strict ${strict ? 'เปิด' : 'ปิด'}`, '']
        if (cases.length === 0) lines.push('ยังไม่มีคดี Claude ทำงานเป็นเส้นตรงดี 👍')
        for (const c of cases.slice(-15)) lines.push(`• ${new Date(c.at).toLocaleTimeString('th-TH')}  ${KIND_TH[c.kind]}: ${short(c.what, 80)}`)
        const pending = [...fails].filter(([, n]) => n > 0)
        if (pending.length) lines.push('', 'กำลังพังอยู่:', ...pending.map(([cmd, n]) => `  ${n}× ${short(cmd, 70)}`))
        return { text: lines.join('\n') }
      }
      case 'strict':
        if (arg !== 'on' && arg !== 'off') return { text: 'วิธีใช้: /detective strict on|off' }
        strict = arg === 'on'
        await $.store.set('strict', strict)
        return { text: `🔍 โหมดเข้มงวด: ${strict ? 'เปิด (คำสั่งที่พังครบ 3 ครั้งจะถูกบล็อก)' : 'ปิด (เตือนอย่างเดียว)'}` }
      case 'reset':
        fails = new Map()
        editCount = new Map()
        alert = undefined
        $.ui.invalidate('ui.render')
        return { text: '🧹 ล้างตัวนับแล้ว' }
      default:
        return { text: '🔍 Loop Detective TH (Mod 85)\n/detective              ดูคดีของ session\n/detective strict on|off  บล็อกคำสั่งที่พังซ้ำ 3 ครั้ง\n/detective reset         ล้างตัวนับ' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. จับ error ข้อความเดียวกันจากคำสั่งที่ต่างกัน (เช่น ModuleNotFoundError ซ้ำ)
 * 2. ใช้ $.model.classify ถามว่าการลองครั้งใหม่ต่างจากเดิมจริงไหม
 * 3. เปิดคดีแล้วหยุด turn ทันทีด้วย $.turn.abort ในโหมดเข้มงวด
 */
