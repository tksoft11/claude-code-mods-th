/**
 * ============================================================================
 * MOD 86: Next Steps TH - เดา prompt ถัดไปให้ กดเลขเดียวใช้ได้เลย (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: next-steps ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ทุกครั้งที่ Claude ตอบจบ ให้ Haiku อ่านคำถามล่าสุดกับคำตอบ แล้วเสนอ prompt ถัดไป 3 ข้อ
 * 2. แสดงเหนือช่องพิมพ์: 💡 1) … 2) … 3) …
 * 3. ช่องพิมพ์ว่างอยู่ กด 1 / 2 / 3 = ใส่ข้อนั้นลงช่องพิมพ์ (แก้ต่อได้ก่อนส่ง) กด 0 = ปิด
 *    ข้อแรกยังขึ้นเป็นคำแนะนำจางๆ ในช่องพิมพ์ กด Tab รับได้
 * 4. ใช้ภาษาเดียวกับที่เราพิมพ์ (ไทยถามไทย อังกฤษถามอังกฤษ)
 *
 * ค่าใช้จ่าย: Haiku 1 ครั้งต่อคำตอบ (เล็กมาก) ปิดได้ด้วย /next off
 */

import type { EngineInterface, Register } from 'claude-code'

let enabled = true
let suggestions: string[] = []
let lastPrompt = ''
// กันคำตอบเก่ามาทับ: เสนอเฉพาะของ turn ล่าสุด
let generation = 0

const SYSTEM = `คุณช่วยเดาว่าผู้ใช้น่าจะสั่ง AI coding agent อะไรต่อ
อ่านคำสั่งล่าสุดของผู้ใช้และคำตอบของ agent แล้วเสนอ prompt ถัดไป 3 ข้อที่มีประโยชน์ที่สุด
- เขียนในมุมผู้ใช้ เป็นคำสั่งสั้นๆ ไม่เกิน 70 ตัวอักษร ใช้ภาษาเดียวกับคำสั่งของผู้ใช้
- เจาะจงกับงานนี้ เช่น รันเทสต์ที่เพิ่งเขียน, commit, แก้จุดที่ agent บอกว่ายังค้าง, ตอบคำถามที่ agent ถามมา
- ถ้า agent ถามคำถามปิดท้าย ข้อแรกควรเป็นคำตอบที่สมเหตุสมผลที่สุด
ตอบเป็น JSON array ของ string 3 ตัวเท่านั้น`

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ==========================================================================
// บทที่ 1: ให้ Haiku เดา prompt ถัดไป
// ==========================================================================
function parse(text: string): string[] {
  const m = /\[[\s\S]*\]/.exec(text)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0]) as unknown
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()).slice(0, 3) : []
  } catch {
    return []
  }
}

async function suggest($: EngineInterface, answer: string, gen: number): Promise<void> {
  const prompt = `คำสั่งล่าสุดของผู้ใช้:\n${short(lastPrompt, 1500)}\n\nคำตอบของ agent:\n${short(answer, 4000)}`
  const r = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt, maxTokens: 300 }).catch(() => undefined)
  if (gen !== generation || !r?.isAnswered) return
  suggestions = parse(r.text)
  $.ui.invalidate('ui.render')
  // ข้อแรกขึ้นเป็นคำแนะนำจางในช่องพิมพ์ (Tab รับ)
  if (suggestions[0]) void $.prompt.suggest({ text: suggestions[0] }).catch(() => undefined)
}

function clear($: EngineInterface): void {
  if (suggestions.length === 0) return
  suggestions = []
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    suggestions = []
    await $.command.register({ name: 'next', description: 'เสนอ prompt ถัดไป 3 ข้อหลังทุกคำตอบ กด 1-3 ใช้ได้เลย (/next help)', argumentHint: '1|2|3 | on|off' })
    return next(e)
  })

  // จำคำสั่งล่าสุดของเรา และล้างข้อเสนอเก่าเมื่อส่ง prompt ใหม่
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') lastPrompt = e.text
    generation++
    clear($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: จบ turn แล้วค่อยเดา (ไม่ await ให้ turn จบได้ทันที)
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (enabled && !e.agentId && e.reason === 'answer' && e.answer.trim().length >= 20) void suggest($, e.answer, generation)
    return r
  })

  // ==========================================================================
  // บทที่ 3: กดเลขในช่องพิมพ์ที่ว่างอยู่
  // ==========================================================================
  on('prompt.edit', async ($, e, next) => {
    if (suggestions.length === 0 || e.text !== '' || !/^[0-3]$/.test(e.inputText)) return next(e)
    if (e.inputText === '0') {
      clear($)
      return { text: '', cursor: 0 }
    }
    const pick = suggestions[Number(e.inputText) - 1]
    if (!pick) return next(e)
    clear($)
    return { text: pick, cursor: pick.length }
  })

  // ==========================================================================
  // บทที่ 4: แถบข้อเสนอเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (suggestions.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {suggestions.map((s, i) => (
          <Text>
            <Text color="#ffd54f">{i === 0 ? '💡 ' : '   '}</Text>
            <Text color="#4fc3f7">{`${i + 1}) `}</Text>
            <Text>{short(s, 80)}</Text>
          </Text>
        ))}
        <Text dimColor>{'   กด 1-3 ในช่องว่างเพื่อใช้ · 0 ปิด'}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'next' }, async ($, e) => {
    const arg = e.args.trim()
    if (/^[1-3]$/.test(arg)) {
      const pick = suggestions[Number(arg) - 1]
      if (!pick) return { text: 'ยังไม่มีข้อเสนอ รอ Claude ตอบก่อน' }
      clear($)
      await $.prompt.fill({ text: pick })
      return { text: `💡 ใส่ลงช่องพิมพ์แล้ว: ${pick}` }
    }
    if (arg === 'on' || arg === 'off') {
      enabled = arg === 'on'
      await $.store.set('enabled', enabled)
      if (!enabled) clear($)
      return { text: `💡 Next Steps: ${enabled ? 'เปิด' : 'ปิด'}` }
    }
    if (arg === '' && suggestions.length) return { text: suggestions.map((s, i) => `${i + 1}) ${s}`).join('\n') }
    return { text: `💡 Next Steps TH (Mod 86): ${enabled ? 'เปิด' : 'ปิด'}\n/next          ดูข้อเสนอล่าสุด\n/next 1|2|3    ใส่ข้อนั้นลงช่องพิมพ์\n/next on|off   เปิด/ปิด (ใช้ Haiku 1 ครั้งต่อคำตอบ)\nทางลัด: ช่องพิมพ์ว่างอยู่ กด 1-3 ใช้ได้เลย กด 0 ปิด` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. จำข้อที่เราเลือกบ่อย แล้วส่งเป็นตัวอย่างให้ Haiku เดาให้ตรงขึ้น
 * 2. ใช้ $.model.fork แทน เพื่อให้เห็นบริบททั้ง session (แพงกว่าแต่แม่นกว่า)
 * 3. ต่อกับ Mod 81: กด Shift+1 เพื่อส่งเข้าคิว /after แทน
 */
