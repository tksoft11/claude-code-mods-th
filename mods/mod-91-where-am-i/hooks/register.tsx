/**
 * ============================================================================
 * MOD 91: Where Am I TH - เข็มทิศงาน: ตอนนี้อยู่ตรงไหนของงาน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: where-am-i ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. หลัง Claude ตอบจบแต่ละครั้ง ให้ Haiku สรุปสั้นๆ 4 ช่อง:
 *    🎯 เป้าหมาย · ✅ เสร็จแล้ว · ⏳ รอคุณ · ➡️ ต่อไป
 * 2. แสดงเหนือช่องพิมพ์ กลับมาจากพักกาแฟก็รู้ทันทีว่างานถึงไหน
 * 3. ช่อง "รอคุณ" เด่นเป็นสีส้ม เมื่อ Claude ถามหรือรออะไรจากเรา
 * 4. /where ดูฉบับเต็ม
 *
 * ค่าใช้จ่าย: Haiku 1 ครั้งต่อคำตอบ ปิดได้ด้วย /where off
 */

import type { EngineInterface, Register } from 'claude-code'

interface Compass {
  goal: string
  done: string
  waiting: string
  next: string
}

let enabled = true
let compact = false
let compass: Compass | undefined
let prompts: string[] = []
let updating = false

const SYSTEM = `คุณช่วยสรุปสถานะงานของ AI coding agent ให้ผู้ใช้กลับมาอ่านแล้วรู้ทันทีว่างานถึงไหน
อ่านคำสั่งของผู้ใช้ (เรียงจากเก่าไปใหม่) กับคำตอบล่าสุดของ agent แล้วตอบเป็น JSON เท่านั้น:
{"goal": "เป้าหมายใหญ่ของงานนี้", "done": "สิ่งที่เสร็จล่าสุด", "waiting": "สิ่งที่ agent รอจากผู้ใช้ หรือ \\"\\" ถ้าไม่มี", "next": "ขั้นต่อไป"}
แต่ละช่องไม่เกิน 60 ตัวอักษร ใช้ภาษาเดียวกับผู้ใช้ เขียนแบบป้ายสั้นๆ ไม่ต้องเป็นประโยคเต็ม`

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ==========================================================================
// บทที่ 1: ให้ Haiku อ่านแล้วสรุปเป็น 4 ช่อง
// ==========================================================================
function parse(text: string): Compass | undefined {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return undefined
  try {
    const j = JSON.parse(m[0]) as Partial<Record<keyof Compass, unknown>>
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
    return { goal: str(j.goal), done: str(j.done), waiting: str(j.waiting), next: str(j.next) }
  } catch {
    return undefined
  }
}

async function refresh($: EngineInterface, answer: string): Promise<void> {
  if (updating) return
  updating = true
  const history = prompts.slice(-6).map((p, i) => `${i + 1}. ${short(p.replace(/\s+/g, ' '), 300)}`).join('\n')
  const r = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: `คำสั่งของผู้ใช้:\n${history}\n\nคำตอบล่าสุดของ agent:\n${short(answer, 3500)}`, maxTokens: 300 }).catch(() => undefined)
  updating = false
  if (!r?.isAnswered) return
  const c = parse(r.text)
  if (!c) return
  compass = c
  $.ui.invalidate('ui.render')
}

function fullText(): string {
  if (!compass) return '🧭 ยังไม่มีสรุป รอ Claude ตอบก่อนนะ'
  return [`🧭 ตอนนี้อยู่ตรงไหน`, `🎯 เป้าหมาย: ${compass.goal || '-'}`, `✅ เสร็จแล้ว: ${compass.done || '-'}`, `⏳ รอคุณ: ${compass.waiting || 'ไม่มี'}`, `➡️ ต่อไป: ${compass.next || '-'}`].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('settings')) as { enabled?: boolean; compact?: boolean } | undefined
    enabled = saved?.enabled ?? true
    compact = saved?.compact ?? false
    compass = undefined
    prompts = []
    await $.command.register({ name: 'where', description: 'เข็มทิศงาน: เป้าหมาย เสร็จแล้ว รอคุณ ต่อไป (/where help)', argumentHint: 'on|off | compact on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: จำคำสั่งของเรา และสรุปใหม่ตอนจบ turn
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin' && e.text.trim()) prompts = [...prompts.slice(-19), e.text]
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (enabled && !e.agentId && e.reason === 'answer' && e.answer.trim()) void refresh($, e.answer)
    return r
  })

  // ==========================================================================
  // บทที่ 3: เข็มทิศเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!enabled || !compass || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const c = compass
    return (
      <Box flexDirection="column">
        {await next(e)}
        {compact ? (
          <Text>
            <Text color="#4fc3f7">{`🧭 ${short(c.goal, 40)}`}</Text>
            {c.waiting ? <Text color="#ffb74d">{`  ⏳ ${short(c.waiting, 50)}`}</Text> : <Text dimColor>{`  ➡️ ${short(c.next, 50)}`}</Text>}
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text color="#4fc3f7">🎯 </Text>
              <Text>{short(c.goal, 70)}</Text>
              <Text dimColor>{`   ✅ ${short(c.done, 50)}`}</Text>
            </Text>
            {c.waiting ? <Text color="#ffb74d">{`⏳ รอคุณ: ${short(c.waiting, 90)}`}</Text> : <Text dimColor>{`➡️ ต่อไป: ${short(c.next, 90)}`}</Text>}
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'where' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', { enabled, compact })
    if (sub === '') return { text: fullText() }
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await save()
      $.ui.invalidate('ui.render')
      return { text: `🧭 Where Am I: ${enabled ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'compact' && (arg === 'on' || arg === 'off')) {
      compact = arg === 'on'
      await save()
      $.ui.invalidate('ui.render')
      return { text: `🧭 แบบบรรทัดเดียว: ${compact ? 'เปิด' : 'ปิด'}` }
    }
    return { text: '🧭 Where Am I TH (Mod 91)\n/where                 ดูสรุปเต็ม\n/where on|off          เปิด/ปิด (ใช้ Haiku 1 ครั้งต่อคำตอบ)\n/where compact on|off  แสดงบรรทัดเดียว' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งช่อง "รอคุณ" ไปมือถือเมื่อเราไม่อยู่หน้าจอ (ต่อกับ Mod 22)
 * 2. เก็บเป้าหมายลงไฟล์ ให้ session ใหม่รู้ทันที (ต่อกับ Mod 80 handoff)
 * 3. เตือนเมื่องานเริ่มออกนอกเป้าหมายเดิม
 */
