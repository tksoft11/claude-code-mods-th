/**
 * ============================================================================
 * MOD 37: Dev Unblock TH - ช่วย Dev ที่ตัน คิดไม่ออก (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Rubber duck debugging และเทคนิค "ขั้นต่อไปที่เล็กที่สุด"
 *
 * หน้าที่ของ Mod นี้:
 * 1. บอกอาการ (ติดบั๊ก / งง / งานเยอะจนท่วม / เหนื่อย / เบื่อ) แล้วได้คำแนะนำที่ตรงอาการ
 * 2. Claude อ่าน git status/diff ล่าสุดของโปรเจกต์ แล้วเสนอ "ขั้นต่อไปที่เล็กที่สุด" + คำถามนำ
 * 3. /unblock go ส่งขั้นต่อไปนั้นให้ Claude ลงมือทำต่อได้ทันที
 * 4. Rubber duck: คำถามนำให้อธิบายปัญหาเอง หรือคุยกับเป็ดยาง (Haiku) ที่ถามทีละข้อแต่ไม่เฉลย
 * 5. จดว่าตันตอนไหนบ่อย จะได้รู้รูปแบบของตัวเอง
 */

import type { EngineInterface, Register } from 'claude-code'

type Mood = 'stuck' | 'confused' | 'overwhelm' | 'tired' | 'bored'

const MOODS: Record<Mood, { th: string; icon: string; ask: string }> = {
  stuck: { th: 'ติดบั๊ก/แก้ไม่ผ่าน', icon: '🧱', ask: 'The developer is stuck on a problem. Suggest how to narrow it down: what to check first, a quick experiment to split the problem in half, and the single smallest next step.' },
  confused: { th: 'งง ไม่เข้าใจ', icon: '🌀', ask: 'The developer is confused by something. Explain the likely concept in simple Thai with one tiny example, then give the smallest next step to confirm understanding.' },
  overwhelm: { th: 'งานเยอะจนท่วม', icon: '🌊', ask: 'The developer feels overwhelmed. Break the work into 3-6 small, ordered steps that each take under 30 minutes, and say which one to start right now.' },
  tired: { th: 'เหนื่อย หมดแรง', icon: '🔋', ask: 'The developer is tired. Suggest a short reset (break, water, walk), then one very small, low-risk task to regain momentum, and what to write down so tomorrow starts easily.' },
  bored: { th: 'เบื่อ ไม่มีไฟ', icon: '😐', ask: 'The developer is bored. Suggest a small, satisfying win from the current work (a quick cleanup, a test, a tiny feature) and a way to make the task more interesting.' },
}

// คำถามแบบ rubber duck: อธิบายให้เป็ดฟังทีละข้อ
const DUCK = [
  'โค้ดส่วนนี้ "ควร" ทำอะไร? อธิบายเป็นประโยคเดียว',
  'ตอนนี้มัน "ทำ" อะไรจริงๆ? ต่างจากที่ควรเป็นตรงไหน',
  'ครั้งสุดท้ายที่มันยังทำงานถูกคือเมื่อไหร่? หลังจากนั้นเปลี่ยนอะไรไปบ้าง',
  'ข้อมูลที่เข้าฟังก์ชันเป็นค่าที่คิดไว้จริงไหม? ลอง print/log ดูหรือยัง',
  'ทำให้ปัญหาเล็กลงครึ่งหนึ่งได้ไหม? ตัดส่วนไหนออกแล้วยังเกิดอยู่',
  'ถ้าต้องอธิบายให้เพื่อนใหม่ฟัง จะเริ่มที่บรรทัดไหน',
]

let lastStep = ''
let log: { at: number; mood: Mood }[] = []

// ==========================================================================
// บทที่ 1: เก็บบริบทจาก git (ไม่ส่งโค้ดทั้งไฟล์ ส่งแค่สรุปการเปลี่ยนแปลง)
// ==========================================================================
async function gitContext($: EngineInterface): Promise<string> {
  const run = async (args: string[]) => {
    const r = await $.process.run(['git', ...args], { timeoutMs: 10_000 }).catch(() => undefined)
    return r && r.exitCode === 0 ? r.stdout.trim() : ''
  }
  const status = await run(['status', '--short'])
  if (!status && !(await run(['rev-parse', '--git-dir']))) return '(not a git repository)'
  const stat = await run(['diff', '--stat'])
  const diff = (await run(['diff', '--unified=2'])).slice(0, 6000) // จำกัดขนาด ประหยัด token
  const recent = await run(['log', '--oneline', '-5'])
  return `git status:\n${status || '(clean)'}\n\nrecent commits:\n${recent}\n\ndiff stat:\n${stat}\n\ndiff (truncated):\n${diff}`
}

// ==========================================================================
// บทที่ 2: ให้ Claude โค้ช - ตอบเป็นไทย สั้น และจบด้วยขั้นต่อไปบรรทัดเดียว
// ==========================================================================
async function coach($: EngineInterface, mood: Mood, note: string): Promise<{ text: string; next: string }> {
  const system = `You are a calm senior developer coaching a Thai developer. Answer in Thai, short and kind, no lectures. ${MOODS[mood].ask} Ask at most 2 clarifying questions. End with exactly one line that starts with "NEXT:" followed by the next step written as an instruction to an AI coding assistant.`
  const prompt = `What the developer says: ${note || '(nothing more)'}\n\nProject context:\n${await gitContext($)}`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens: 900 }).catch(() => undefined)
    if (r?.isAnswered) {
      const next = /^NEXT:\s*(.+)$/m.exec(r.text)?.[1]?.trim() ?? ''
      return { text: r.text.replace(/^NEXT:.*$/m, '').trim(), next }
    }
  }
  throw new Error('เรียก model ไม่สำเร็จ')
}

function patterns(): string {
  if (log.length === 0) return 'ยังไม่มีบันทึก'
  const byMood = new Map<Mood, number>()
  const byHour = new Map<number, number>()
  for (const l of log) {
    byMood.set(l.mood, (byMood.get(l.mood) ?? 0) + 1)
    const h = new Date(l.at).getHours()
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }
  const topHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]
  return [
    `📒 ตันไปแล้ว ${log.length} ครั้ง`,
    ...[...byMood.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `  ${MOODS[m].icon} ${MOODS[m].th}: ${c}`),
    topHour ? `⏰ ตันบ่อยสุดช่วง ${String(topHour[0]).padStart(2, '0')}:00 (ลองพักก่อนถึงช่วงนี้)` : '',
  ].join('\n')
}

// ==========================================================================
// บทที่ 2.5: เป็ดยางที่คุยได้ - ถามทีละคำถาม ห้ามเฉลย ให้คุณเจอคำตอบเอง
// ==========================================================================
let duckChat: { who: 'you' | 'duck'; text: string }[] = []

const DUCK_SYSTEM = `คุณคือ "เป็ดยาง" สำหรับ rubber duck debugging พูดภาษาไทยเป็นกันเอง น่ารัก ขึ้นต้นด้วย 🦆
กฎ: ถามคำถามนำทีละ 1 ข้อเท่านั้น สั้นไม่เกิน 2 ประโยค ห้ามเฉลยหรือเสนอวิธีแก้เอง
ถามเพื่อให้ผู้ใช้อธิบายสิ่งที่คาดหวัง สิ่งที่เกิดจริง ข้อสันนิษฐานที่ยังไม่ได้พิสูจน์ และการทดลองเล็กๆ ที่แยกปัญหาออกเป็นครึ่ง
ถ้าผู้ใช้ดูเหมือนเจอคำตอบแล้ว ให้ชมสั้นๆ แล้วถามว่าจะลองทำอะไรต่อ
ใช้ภาษาไทยที่คนพูดกันจริงและถูกต้อง เรียกตัวเองว่า "เป็ด" เท่านั้น ห้ามแต่งคำแปลกหรือคำที่ไม่มีความหมาย`

async function duckAsk($: EngineInterface, system: string, prompt: string): Promise<string | undefined> {
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens: 300 }).catch(() => undefined)
    if (r?.isAnswered) return r.text.trim()
  }
  return undefined
}

async function duckTalk($: EngineInterface, said: string): Promise<string> {
  duckChat = [...duckChat, { who: 'you' as const, text: said.slice(0, 1500) }].slice(-20)
  const transcript = duckChat.map(m => `${m.who === 'you' ? 'ผู้ใช้' : 'เป็ด'}: ${m.text}`).join('\n')
  const reply = (await duckAsk($, DUCK_SYSTEM, transcript)) ?? '🦆 ก๊าบ? เล่าให้ฟังอีกนิดสิ ว่าคาดว่าจะเกิดอะไร แล้วเกิดอะไรจริง'
  duckChat = [...duckChat, { who: 'duck' as const, text: reply }]
  return `${reply}\n\n(ตอบ: /unblock duck <คำตอบ>  ·  จบ: /unblock duck bye)`
}

async function duckBye($: EngineInterface): Promise<string> {
  if (duckChat.length === 0) return '🦆 ก๊าบ ไว้คุยกันใหม่นะ'
  const transcript = duckChat.map(m => `${m.who === 'you' ? 'ผู้ใช้' : 'เป็ด'}: ${m.text}`).join('\n')
  duckChat = []
  const summary = await duckAsk($, 'สรุปบทสนทนา rubber duck เป็นภาษาไทย 3 ข้อสั้นๆ: ปัญหาคืออะไร, ผู้ใช้ค้นพบอะไรระหว่างอธิบาย, ขั้นต่อไปที่ผู้ใช้บอกว่าจะทำ (ถ้ามี) ห้ามเพิ่มวิธีแก้ที่ผู้ใช้ไม่ได้พูด', transcript)
  return `🦆 บ๊ายบาย! สรุปที่เราคุยกัน\n\n${summary ?? '(สรุปไม่สำเร็จ)'}`
}

const HELP = `🧭 Dev Unblock TH (Mod 37)
========================================
/unblock [อาการ] [เล่าเพิ่ม...]
   อาการ: ${Object.entries(MOODS).map(([k, v]) => `${k}=${v.th}`).join(' | ')}
   เช่น /unblock stuck เทสต์ login fail ตลอด ไม่รู้ทำไม
/unblock go               ให้ Claude ลงมือทำ "ขั้นต่อไป" ที่เพิ่งได้
/unblock duck             คำถามนำแบบ rubber duck
/unblock duck <เล่า...>    คุยกับเป็ดยางทีละคำถาม (เป็ดไม่บอกคำตอบ ช่วยให้คิดเอง)  |  duck bye  จบและสรุป
/unblock log [clear]      ดูว่าตันตอนไหนบ่อย / ล้างบันทึก`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('log')
    log = Array.isArray(saved) ? (saved as typeof log) : []
    await $.command.register({ name: 'unblock', description: 'ตัน คิดไม่ออก? ให้ช่วยหาขั้นต่อไปที่เล็กที่สุด (/unblock help)', argumentHint: '[stuck|confused|overwhelm|tired|bored] [เล่าเพิ่ม]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: คำสั่ง /unblock
  // ==========================================================================
  on('command.run', { command: 'unblock' }, async ($, e) => {
    const [first = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (first) {
      case 'help':
        return { text: HELP }
      case 'duck': {
        const said = rest.join(' ')
        if (!said && duckChat.length === 0) {
          return { text: ['🦆 อธิบายให้เป็ดฟังทีละข้อ (พิมพ์ตอบในใจหรือในกระดาษก็ได้)', ...DUCK.map((q, i) => `  ${i + 1}. ${q}`), '', 'อยากคุยกับเป็ดจริงๆ: /unblock duck <เล่าปัญหา>', 'ยังไม่เจอ? /unblock stuck <เล่าสิ่งที่ตอบ>'].join('\n') }
        }
        if (said === 'bye' || said === 'stop') return { text: await duckBye($) }
        return { text: await duckTalk($, said || 'ยังคิดไม่ออก') }
      }
      case 'log':
        if (rest[0] === 'clear') {
          log = []
          await $.store.delete('log')
          return { text: '🧹 ล้างบันทึกแล้ว' }
        }
        return { text: patterns() }
      case 'go':
        if (!lastStep) return { text: 'ยังไม่มีขั้นต่อไป ลอง /unblock stuck <เล่าปัญหา> ก่อน' }
        void $.prompt.submit({ text: lastStep })
        return { text: `🚀 ส่งให้ Claude ทำแล้ว: ${lastStep}` }
      default: {
        const mood: Mood = first in MOODS ? (first as Mood) : 'stuck'
        const note = (first in MOODS ? rest : [first, ...rest]).join(' ')
        log = [...log, { at: await $.clock.now(), mood }].slice(-200)
        await $.store.set('log', log)
        if (mood === 'tired') $.ui.toast('🔋 ลุกไปเติมน้ำก่อนสัก 5 นาที แล้วค่อยกลับมาอ่านคำแนะนำ')
        try {
          const { text, next } = await coach($, mood, note)
          lastStep = next
          return { text: `${MOODS[mood].icon} ${MOODS[mood].th}\n----------------------------------------\n${text}${next ? `\n\n👉 ขั้นต่อไป: ${next}\n   พิมพ์ /unblock go ให้ Claude ลงมือทำ` : ''}` }
        } catch (err) {
          return { text: `❌ ${err instanceof Error ? err.message : String(err)}\nลอง /unblock duck ระหว่างนี้` }
        }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ตรวจจับอัตโนมัติ: tool ล้มเหลวติดกันหลายครั้ง (ดู Mod 07) แล้วเสนอ /unblock
 * 2. ใส่ error ล่าสุดจาก terminal ลงในบริบทด้วย
 * 3. สรุปรายสัปดาห์ว่าตันเรื่องอะไรบ่อย แล้วแนะนำหัวข้อที่ควรศึกษาเพิ่ม
 */
