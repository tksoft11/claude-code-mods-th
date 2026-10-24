/**
 * ============================================================================
 * MOD 65: Prompt Coach TH - คู่หูช่วยเช็ค prompt ก่อนส่ง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: pair programming - เพื่อนข้างๆ ที่ถามว่า "หมายถึงแบบไหนนะ" ก่อนลงมือ
 *
 * หน้าที่ของ Mod นี้ (ปิดไว้เป็นค่าเริ่มต้น เพราะใช้ token ทุกครั้งที่ส่ง prompt):
 * 1. โหมด ask - ก่อนส่ง prompt ให้ Haiku ดูว่ากำกวมไหม ถ้ากำกวมจะถามกลับด้วยหน้าต่างเลือก
 *    คำตอบที่เลือกถูกเติมต่อท้าย prompt ให้อัตโนมัติ แล้วค่อยส่งให้ Claude
 * 2. โหมด hint - ไม่ขวาง ส่งทันที แต่เด้ง toast บอกว่า prompt ขาดอะไร (ไว้ฝึกเขียนครั้งหน้า)
 * 3. /coach check <prompt> - ลองให้โค้ชดู prompt โดยไม่ส่ง
 * 4. สถิติ: prompt ชัดเจนกี่ % เรื่องที่ลืมบอกบ่อยสุด
 */

import type { EngineInterface, Register } from 'claude-code'

type Mode = 'off' | 'ask' | 'hint'
interface Verdict {
  clear: boolean
  missing: string
  question: string
  options: string[]
}

let mode: Mode = 'off'
let stats = { checked: 0, clear: 0, missing: {} as Record<string, number> }

// ==========================================================================
// บทที่ 1: ให้ Haiku ตัดสิน - ตอบเป็น JSON สั้นๆ เพื่อความเร็ว
// ==========================================================================
const SYSTEM = `คุณช่วยตรวจ prompt ที่ผู้ใช้จะส่งให้ AI เขียนโค้ด (Claude Code) ว่ากำกวมจนอาจทำผิดทางไหม
กำกวม = ขาดข้อมูลที่ถ้าเดาผิดต้องทำใหม่ เช่น ไฟล์/ส่วนไหน, พฤติกรรมที่ต้องการ, ข้อจำกัด, ขอบเขต
ไม่นับว่ากำกวม: คำถามทั่วไป, คำสั่งสั้นที่ชัดในบริบท (เช่น "run tests", "commit"), การคุยเล่น
ตอบเป็น JSON บรรทัดเดียวเท่านั้น:
{"clear":true} หรือ {"clear":false,"missing":"หมวดสั้นๆ เช่น ขอบเขต/ไฟล์/พฤติกรรม","question":"คำถามภาษาไทยข้อเดียว ลงท้ายด้วย ?","options":["ตัวเลือก1","ตัวเลือก2","ตัวเลือก3"]}
ตัวเลือก 2-3 ข้อ แต่ละข้อสั้นไม่เกิน 40 ตัวอักษร`

async function judge($: EngineInterface, prompt: string): Promise<Verdict | undefined> {
  const r = await $.model.complete({ model: 'haiku', system: SYSTEM, prompt: prompt.slice(0, 3000), maxTokens: 250 }).catch(() => undefined)
  if (!r?.isAnswered) return undefined
  try {
    const v = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? '') as Partial<Verdict>
    if (v.clear !== false) return { clear: true, missing: '', question: '', options: [] }
    const options = (v.options ?? []).filter(o => typeof o === 'string' && o.trim()).slice(0, 3)
    if (!v.question || options.length < 2) return undefined
    return { clear: false, missing: v.missing ?? 'รายละเอียด', question: v.question, options }
  } catch {
    return undefined
  }
}

async function record($: EngineInterface, v: Verdict): Promise<void> {
  stats = { ...stats, checked: stats.checked + 1, clear: stats.clear + (v.clear ? 1 : 0), missing: v.clear ? stats.missing : { ...stats.missing, [v.missing]: (stats.missing[v.missing] ?? 0) + 1 } }
  await $.store.set('stats', stats)
}

function worth(text: string): boolean {
  // ข้ามคำสั่ง slash, ข้อความสั้นมาก, และคำตอบสั้นๆ ระหว่างคุย
  return !text.startsWith('/') && text.trim().length >= 15 && text.split(/\s+/).length >= 3
}

const HELP = `🧑‍🏫 Prompt Coach TH (Mod 65)
========================================
/coach ask      ถามกลับก่อนส่งเมื่อ prompt กำกวม (ใช้ token ทุกครั้งที่ส่ง)
/coach hint     ส่งทันที แต่บอกว่า prompt ขาดอะไร
/coach off      ปิด (ค่าเริ่มต้น)
/coach check <prompt>   ลองให้โค้ชดู โดยไม่ส่ง
/coach stats    สถิติ
ตอนนี้: MODE`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    mode = ((await $.store.get('mode')) as Mode | undefined) ?? 'off'
    stats = { checked: 0, clear: 0, missing: {}, ...((await $.store.get('stats')) as typeof stats | undefined) }
    await $.command.register({ name: 'coach', description: 'โค้ชเช็ค prompt กำกวมก่อนส่งให้ Claude (/coach help)', argumentHint: 'ask|hint|off|check <prompt>|stats' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: ดัก prompt ก่อนถึง Claude
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (mode === 'off' || e.origin.kind !== 'composer' || !worth(e.text)) return next(e)
    if (mode === 'hint') {
      // ไม่ขวาง: ส่งก่อน แล้วค่อยบอกทีหลัง
      void judge($, e.text).then(async v => {
        if (!v) return
        await record($, v)
        if (!v.clear) $.ui.toast(`🧑‍🏫 ครั้งหน้าลองบอก "${v.missing}" ด้วย: ${v.question}`, { timeoutMs: 15_000 })
      })
      return next(e)
    }
    const v = await judge($, e.text)
    if (!v) return next(e)
    await record($, v)
    if (v.clear) return next(e)
    // บทที่ 3: ถามกลับ - เลือกแล้วเติมต่อท้าย prompt / ปิดหน้าต่าง = ส่งตามเดิม
    const answer = await $.ui.ask(v.question, { header: 'Prompt Coach', options: [...v.options, 'ส่งตามเดิม'] }).catch(() => 'ส่งตามเดิม')
    if (!answer || answer === 'ส่งตามเดิม') return next(e)
    return next({ ...e, text: `${e.text}\n\n(ขยายความ - ${v.question} ${answer})` })
  })

  on('command.run', { command: 'coach' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'ask':
      case 'hint':
      case 'off':
        mode = sub
        await $.store.set('mode', mode)
        return { text: mode === 'off' ? 'ปิดโค้ชแล้ว' : mode === 'ask' ? '🧑‍🏫 จะถามกลับเมื่อ prompt กำกวม (prompt ที่ชัดจะส่งทันที)' : '🧑‍🏫 จะบอกหลังส่งว่า prompt ขาดอะไร' }
      case 'check': {
        const text = rest.join(' ')
        if (!text) return { text: 'วิธีใช้: /coach check แก้บั๊กหน่อย' }
        const v = await judge($, text)
        if (!v) return { text: '❌ ตรวจไม่สำเร็จ ลองใหม่' }
        return { text: v.clear ? '✅ prompt นี้ชัดเจนพอ ส่งได้เลย' : `🤔 ยังขาด: ${v.missing}\n❓ ${v.question}\n${v.options.map(o => `  • ${o}`).join('\n')}` }
      }
      case 'stats': {
        const top = Object.entries(stats.missing).sort((a, b) => b[1] - a[1]).slice(0, 5)
        const pct = stats.checked ? Math.round((stats.clear / stats.checked) * 100) : 0
        return { text: `📊 ตรวจ ${stats.checked} prompt · ชัดเจน ${pct}%${top.length ? `\nที่ลืมบอกบ่อย:\n${top.map(([k, n]) => `  ${k} (${n})`).join('\n')}` : ''}` }
      }
      default:
        return { text: HELP.replace('MODE', mode) }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้โค้ชรู้บริบทโปรเจกต์ (ชื่อไฟล์ที่เพิ่งแก้) จะได้ไม่ถามสิ่งที่เดาได้
 * 2. แนะนำ template prompt ที่ตรงกับเรื่องที่ลืมบอกบ่อย (ต่อกับ Mod 32)
 * 3. ข้ามการตรวจเมื่อ prompt ยาวเกิน 500 ตัวอักษร (ส่วนใหญ่ชัดอยู่แล้ว)
 */
