/**
 * ============================================================================
 * MOD 31: Dev Awake TH - แก้ง่วงสำหรับ Dev (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เทคนิค Pomodoro และกฎ 20-20-20 ถนอมสายตา
 *
 * หน้าที่ของ Mod นี้:
 * 1. มุกโปรแกรมเมอร์, ควิซความรู้ Dev, โจทย์โค้ดสั้นๆ ให้สมองตื่น
 * 2. Pomodoro: จับเวลาโฟกัส/พัก แสดงนับถอยหลังใน status line
 * 3. เตือนพักอัตโนมัติ: ดื่มน้ำ, พักสายตา 20-20-20, ลุกยืดเส้น (หมุนเวียน)
 * 4. ทักเมื่อทำงานดึกเกินไป
 * 5. คำคมหมุนเวียนในแถบสถานะ (ของคนจริง อ้างที่มาถูก) หรือให้ Claude แต่งคำคมใหม่
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

// คำคมที่รู้ที่มาแน่ชัด (หลีกเลี่ยงคำคมที่มักถูกอ้างผิดคน)
const QUOTES = [
  'Talk is cheap. Show me the code. — Linus Torvalds',
  'Premature optimization is the root of all evil. — Donald Knuth',
  'Simplicity is prerequisite for reliability. — Edsger W. Dijkstra',
  'Programs must be written for people to read. — Abelson & Sussman',
  'Make it work, make it right, make it fast. — Kent Beck',
  'Any fool can write code that a computer can understand. Good programmers write code that humans can understand. — Martin Fowler',
  'There are only two hard things in Computer Science: cache invalidation and naming things. — Phil Karlton',
  'Testing shows the presence, not the absence of bugs. — Edsger W. Dijkstra',
  'The most dangerous phrase in the language is "we\'ve always done it this way". — Grace Hopper',
  'Weeks of coding can save you hours of planning. — นิรนาม',
  'ช้าๆ ได้พร้าเล่มงาม — สุภาษิตไทย',
  'น้ำหยดลงหินทุกวัน หินมันยังกร่อน — สุภาษิตไทย',
  'ไม่มีใครแก่เกินเรียน — สำนวนไทย',
  'ทำดีได้ดี ทำโค้ดดีได้รีวิวผ่าน — ดัดแปลงจากสุภาษิต',
]
let quoteTimer: Timer | undefined

// ==========================================================================
// บทที่ 1: คลังเนื้อหา - เพิ่มของทีมคุณเองได้
// ==========================================================================
const JOKES = [
  'Dev: "บนเครื่องผมรันได้นะ"\nหัวหน้า: "งั้นเราส่งเครื่องคุณให้ลูกค้าเลยไหม"',
  'ทำไมโปรแกรมเมอร์ชอบโหมดมืด?\nเพราะแสงดึงดูดบั๊ก 🐛',
  'แก้บั๊ก 1 ตัว เกิดใหม่ 3 ตัว\nนี่ไม่ใช่บั๊ก นี่คือ feature การขยายพันธุ์',
  'Git commit ล่าสุด: "แก้นิดเดียว"\nไฟล์ที่เปลี่ยน: 147',
  'มี 10 ประเภทของคนบนโลก\nคนที่เข้าใจเลขฐานสอง กับคนที่ไม่เข้าใจ',
  'เขียนโค้ดเสร็จ 90% แล้ว\nเหลืออีก 90% ที่เหลือ',
  'ลูกค้า: "ขอแก้นิดเดียวนะ"\nDev: *เปิด Jira เตรียมใจ*',
  'ตั้งชื่อตัวแปรยากกว่าเขียนโค้ดทั้งฟังก์ชัน\n`data2_final_จริงๆ_v3`',
  'คอมเมนต์ในโค้ด: "อย่าแตะส่วนนี้"\nมือ: *แตะ*',
  'Deploy วันศุกร์เย็น = ได้ทำงานวันเสาร์ฟรี',
  'Stack Overflow ล่ม = วันหยุดราชการของ Dev',
  'กาแฟคืออะไร? คือตัวแปลงคาเฟอีนเป็นโค้ด ☕→💻',
]

interface Quiz {
  q: string
  choices: string[]
  answer: number // index ของคำตอบที่ถูก
  why: string
}
const QUIZZES: Quiz[] = [
  { q: 'HTTP status ไหนหมายถึง "ไม่พบหน้า"?', choices: ['200', '301', '404', '500'], answer: 2, why: '404 Not Found' },
  { q: 'คำสั่ง git ไหนใช้ดูประวัติ commit?', choices: ['git status', 'git log', 'git diff', 'git show-branch'], answer: 1, why: 'git log แสดงประวัติ commit' },
  { q: 'ใน JavaScript `typeof null` ได้อะไร?', choices: ['"null"', '"undefined"', '"object"', '"number"'], answer: 2, why: 'บั๊กประวัติศาสตร์ของ JS ที่แก้ไม่ได้แล้ว' },
  { q: 'Big-O ของการค้นหาแบบ binary search?', choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], answer: 1, why: 'แบ่งครึ่งทุกรอบ' },
  { q: 'SQL คำสั่งไหนใช้ลบข้อมูลบางแถว?', choices: ['DROP', 'TRUNCATE', 'DELETE', 'REMOVE'], answer: 2, why: 'DELETE ... WHERE ลบเฉพาะแถวที่ตรงเงื่อนไข' },
  { q: 'พอร์ตเริ่มต้นของ HTTPS?', choices: ['80', '443', '8080', '22'], answer: 1, why: 'HTTPS ใช้ 443, HTTP ใช้ 80' },
  { q: 'CSS ไหนจัดของให้อยู่กลางทั้งแนวตั้งและแนวนอนใน flex?', choices: ['align-items + justify-content: center', 'text-align: center', 'margin: auto 0', 'float: center'], answer: 0, why: 'flex ใช้ align-items (แกนขวาง) และ justify-content (แกนหลัก)' },
  { q: 'REST: method ไหนควร idempotent?', choices: ['POST', 'PUT', 'PATCH (เสมอ)', 'ไม่มีเลย'], answer: 1, why: 'PUT ส่งซ้ำได้ผลเหมือนเดิม' },
]

const CHALLENGES = [
  { title: 'FizzBuzz ภาษาไทย', task: 'พิมพ์ 1-30 ถ้าหาร 3 ลงตัวพิมพ์ "ฟิซ" หาร 5 ลงตัวพิมพ์ "บัซ" หารทั้งคู่พิมพ์ "ฟิซบัซ"', hint: 'เช็คหาร 15 ก่อน' },
  { title: 'กลับคำ', task: 'เขียนฟังก์ชันกลับลำดับคำในประโยค "สวัสดี ชาว โลก" -> "โลก ชาว สวัสดี"', hint: 'split(" ") แล้ว reverse()' },
  { title: 'นับสระ', task: 'นับจำนวนสระภาษาอังกฤษ (a e i o u) ในข้อความ', hint: 'ใช้ regex /[aeiou]/gi' },
  { title: 'Palindrome', task: 'เช็คว่าคำอ่านกลับหลังได้เหมือนเดิมไหม เช่น "level"', hint: 'เทียบกับ s.split("").reverse().join("")' },
  { title: 'หาเลขซ้ำ', task: 'จาก array [3, 1, 4, 1, 5, 9, 2, 6, 5] หาเลขที่ซ้ำทั้งหมด', hint: 'ใช้ Set เก็บที่เคยเห็น' },
]

const REMINDERS = [
  '💧 ดื่มน้ำสักแก้ว สมองขาดน้ำแล้วง่วง',
  '👀 กฎ 20-20-20: มองไกล 20 ฟุต (6 เมตร) นาน 20 วินาที',
  '🧘 ลุกยืดเส้น หมุนไหล่ 10 รอบ แล้วค่อยกลับมา',
  '🌬️ หายใจลึกๆ 5 ครั้ง ช้าๆ',
  '🚶 เดินไปเติมน้ำหรือเข้าห้องน้ำ ให้ขาได้ขยับ',
]

// ==========================================================================
// บทที่ 2: state ของ Mod
// ==========================================================================
let quiz: Quiz | undefined
let score = { right: 0, total: 0 }
let pomodoro: { phase: 'focus' | 'break'; endsAt: number; focusMin: number; breakMin: number; rounds: number } | undefined
let pomoTimer: Timer | undefined
let reminderTimer: Timer | undefined
let reminderIndex = 0
let lateWarnedOn = ''

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)] as T

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ==========================================================================
// บทที่ 3: Pomodoro - tick ทุก 1 วินาที อัปเดต status line และสลับโฟกัส/พัก
// ==========================================================================
function stopPomodoro($: EngineInterface): void {
  pomoTimer?.cancel()
  pomoTimer = undefined
  pomodoro = undefined
  $.ui.status(undefined)
}

function startPomodoro($: EngineInterface, now: number, focusMin: number, breakMin: number): void {
  stopPomodoro($)
  pomodoro = { phase: 'focus', endsAt: now + focusMin * 60_000, focusMin, breakMin, rounds: 0 }
  pomoTimer = $.clock.every(1000, () => void tickPomodoro($))
}

async function tickPomodoro($: EngineInterface): Promise<void> {
  if (!pomodoro) return
  const now = await $.clock.now()
  const left = pomodoro.endsAt - now
  if (left <= 0) {
    if (pomodoro.phase === 'focus') {
      pomodoro.rounds++
      pomodoro.phase = 'break'
      pomodoro.endsAt = now + pomodoro.breakMin * 60_000
      $.ui.toast(`🍅 ครบ ${pomodoro.focusMin} นาทีแล้ว (รอบที่ ${pomodoro.rounds}) พัก ${pomodoro.breakMin} นาที\n${pick(REMINDERS)}`, { timeoutMs: 15_000 })
    } else {
      pomodoro.phase = 'focus'
      pomodoro.endsAt = now + pomodoro.focusMin * 60_000
      $.ui.toast('🍅 หมดเวลาพัก กลับมาโฟกัสกันต่อ!')
    }
  }
  $.ui.status(`${pomodoro.phase === 'focus' ? '🍅 โฟกัส' : '☕ พัก'} ${mmss(pomodoro.endsAt - now)}`)
}

const HELP = `☕ Dev Awake TH (Mod 31)
========================================
/awake joke               มุกโปรแกรมเมอร์
/awake quiz | answer <a-d>   ควิซความรู้ Dev
/awake challenge          โจทย์โค้ดสั้นๆ (ให้ Claude ช่วยตรวจได้)
/awake pomodoro [โฟกัส] [พัก]   เริ่ม Pomodoro (นาที, ค่าเริ่มต้น 25 5) | pomodoro stop
/awake remind on [นาที] | off  เตือนพักอัตโนมัติ (ค่าเริ่มต้นทุก 50 นาที)
/awake quote              คำคมหนึ่งข้อ | quote ai ให้ Claude แต่งใหม่
/awake quote on [นาที] | off  คำคมหมุนเวียนในแถบสถานะ (ค่าเริ่มต้นทุก 10 นาที)
/awake status`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    score = { right: 0, total: 0 }
    const saved = (await $.store.get('remind')) as { minutes?: number } | undefined
    if (saved?.minutes) reminderTimer = $.clock.every(saved.minutes * 60_000, () => $.ui.toast(REMINDERS[reminderIndex++ % REMINDERS.length] ?? ''))
    const q = (await $.store.get('quote')) as { minutes?: number } | undefined
    if (q?.minutes) quoteTimer = $.clock.every(q.minutes * 60_000, () => {
      if (!pomodoro) $.ui.status(`💬 ${pick(QUOTES)}`)
    })
    await $.command.register({ name: 'awake', description: 'แก้ง่วง: มุก ควิซ โจทย์ Pomodoro เตือนพัก (/awake help)', argumentHint: 'joke|quiz|challenge|pomodoro|remind' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ทักเมื่อทำงานดึก (หลัง 23:00 หรือก่อนตี 5) วันละครั้ง
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    const d = new Date(await $.clock.now())
    const today = d.toDateString()
    if ((d.getHours() >= 23 || d.getHours() < 5) && lateWarnedOn !== today) {
      lateWarnedOn = today
      $.ui.toast('🌙 ดึกแล้วนะ โค้ดที่เขียนตอนง่วงมักต้องแก้พรุ่งนี้ ลอง commit แล้วไปนอนไหม')
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /awake
  // ==========================================================================
  on('command.run', { command: 'awake' }, async ($, e) => {
    const [sub = 'help', a1, a2] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    switch (sub) {
      case 'joke':
        return { text: `😂 ${pick(JOKES)}` }
      case 'quiz': {
        quiz = pick(QUIZZES)
        return { text: [`🧠 ${quiz.q}`, ...quiz.choices.map((c, i) => `  ${'abcd'[i]}) ${c}`), '', 'ตอบด้วย /awake answer a'].join('\n') }
      }
      case 'answer': {
        if (!quiz) return { text: 'ยังไม่มีคำถาม /awake quiz' }
        const i = 'abcd'.indexOf((a1 ?? '').toLowerCase())
        if (i < 0) return { text: 'ตอบ a, b, c หรือ d' }
        const correct = i === quiz.answer
        score = { right: score.right + (correct ? 1 : 0), total: score.total + 1 }
        const text = `${correct ? '✅ ถูกต้อง!' : `❌ ยังไม่ใช่ คำตอบคือ ${'abcd'[quiz.answer]}) ${quiz.choices[quiz.answer]}`}\n💡 ${quiz.why}\nคะแนน ${score.right}/${score.total}`
        quiz = undefined
        return { text }
      }
      case 'challenge': {
        const c = pick(CHALLENGES)
        return { text: `🧩 ${c.title}\n${c.task}\n\n💡 คำใบ้: ${c.hint}\nเขียนเสร็จแล้วพิมพ์ให้ Claude ตรวจได้เลย เช่น "ตรวจโค้ด FizzBuzz นี้ให้หน่อย"` }
      }
      case 'pomodoro': {
        if (a1 === 'stop') {
          const rounds = pomodoro?.rounds ?? 0
          stopPomodoro($)
          return { text: `⏹️ หยุด Pomodoro (ทำไป ${rounds} รอบ)` }
        }
        const focus = Math.min(90, Math.max(1, Number(a1) || 25))
        const rest = Math.min(30, Math.max(1, Number(a2) || 5))
        startPomodoro($, now, focus, rest)
        return { text: `🍅 เริ่มโฟกัส ${focus} นาที แล้วพัก ${rest} นาที นับถอยหลังอยู่ใน status line` }
      }
      case 'remind': {
        reminderTimer?.cancel()
        reminderTimer = undefined
        if (a1 === 'off') {
          await $.store.delete('remind')
          return { text: '🔕 ปิดการเตือนพักแล้ว' }
        }
        const minutes = Math.min(180, Math.max(10, Number(a2) || 50))
        reminderTimer = $.clock.every(minutes * 60_000, () => $.ui.toast(REMINDERS[reminderIndex++ % REMINDERS.length] ?? ''))
        await $.store.set('remind', { minutes })
        return { text: `🔔 จะเตือนพักทุก ${minutes} นาที (ดื่มน้ำ / พักสายตา / ยืดเส้น สลับกัน)` }
      }
      case 'quote': {
        if (a1 === 'off') {
          quoteTimer?.cancel()
          quoteTimer = undefined
          if (!pomodoro) $.ui.status(undefined)
          await $.store.delete('quote')
          return { text: 'ปิดคำคมในแถบสถานะแล้ว' }
        }
        if (a1 === 'on') {
          const minutes = Math.max(1, Math.min(120, Number(a2) || 10))
          quoteTimer?.cancel()
          // Pomodoro ใช้แถบสถานะอยู่ก็ไม่แย่ง
          const show = () => {
            if (!pomodoro) $.ui.status(`💬 ${pick(QUOTES)}`)
          }
          show()
          quoteTimer = $.clock.every(minutes * 60_000, show)
          await $.store.set('quote', { minutes })
          return { text: `💬 จะเปลี่ยนคำคมในแถบสถานะทุก ${minutes} นาที` }
        }
        if (a1 === 'ai') {
          const system = 'แต่งคำคมสั้นสำหรับนักพัฒนาซอฟต์แวร์ 1 ประโยค ภาษาไทยที่เป็นธรรมชาติ คมคาย มีอารมณ์ขันเล็กน้อย ไม่เกิน 80 ตัวอักษร ห้ามอ้างว่าเป็นคำพูดของบุคคลจริง ตอบเฉพาะคำคม'
          for (const model of ['haiku', await $.session.model()]) {
            const r = await $.model.complete({ model, system, prompt: `หัวข้อสุ่ม: ${pick(['บั๊ก', 'การตั้งชื่อตัวแปร', 'deadline', 'code review', 'กาแฟ', 'เทสต์', 'refactor', 'production'])}`, maxTokens: 120 }).catch(() => undefined)
            if (r?.isAnswered) return { text: `💬 ${r.text.trim().replace(/^["“]|["”]$/g, '')} — แต่งโดย Claude` }
          }
          return { text: `💬 ${pick(QUOTES)}` }
        }
        return { text: `💬 ${pick(QUOTES)}` }
      }
      case 'status':
        return { text: `☕ Pomodoro: ${pomodoro ? `${pomodoro.phase === 'focus' ? 'โฟกัส' : 'พัก'} เหลือ ${mmss(pomodoro.endsAt - now)} (รอบ ${pomodoro.rounds})` : 'ปิด'} | เตือนพัก: ${reminderTimer ? 'เปิด' : 'ปิด'} | ควิซ ${score.right}/${score.total}` }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้ Claude สร้างควิซใหม่จากโค้ดในโปรเจกต์คุณเอง ($.model.complete)
 * 2. ส่งเตือนพักไปมือถือ/นาฬิกา (ต่อกับ Mod 22)
 * 3. เก็บสถิติ Pomodoro รายวันใน $.store แล้วสรุปตอนเย็น
 */
