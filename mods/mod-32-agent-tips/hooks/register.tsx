/**
 * ============================================================================
 * MOD 32: Agent Tips TH - ทิปสั่ง Claude Code วันละข้อ + template prompt (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Claude Code best practices และ prompt engineering guide ของ Anthropic
 *
 * หน้าที่ของ Mod นี้:
 * 1. ทิปประจำวัน (เปลี่ยนทุกวัน) แสดงตอนเปิด Claude Code ครั้งแรกของวัน
 * 2. ค้นทิปตามหมวดหรือคำค้น, สุ่ม, บันทึกเป็นรายการโปรด
 * 3. Template prompt ที่ใช้บ่อย (แก้บั๊ก ฟีเจอร์ใหม่ refactor รีวิวโค้ด เขียนเทสต์ ฯลฯ)
 *    เลือกแล้วเติมลงช่องพิมพ์ให้ทันที ($.prompt.fill) แก้นิดหน่อยแล้วกด Enter ได้เลย
 *
 * หมายเหตุ: ใช้ชื่อ /agenttips เพราะ /tips เป็นของ Mod 03 และ /prompt เป็นของ Mod 11
 */

import type { Register } from 'claude-code'

interface Tip {
  id: string
  category: 'พื้นฐาน' | 'บริบท' | 'วางแผน' | 'ตรวจสอบ' | 'ประหยัด' | 'ทีม'
  title: string
  body: string
}

// ==========================================================================
// บทที่ 1: คลังทิป - เฉพาะฟีเจอร์ที่มีจริงใน Claude Code
// ==========================================================================
const TIPS: Tip[] = [
  { id: 'mention', category: 'บริบท', title: 'ใช้ @ ชี้ไฟล์', body: 'พิมพ์ @ แล้วเลือกไฟล์ Claude จะอ่านไฟล์นั้นทันที ไม่ต้องเสียเวลาเดาว่าอยู่ตรงไหน' },
  { id: 'specific', category: 'พื้นฐาน', title: 'บอกให้ชัดว่า "เสร็จ" หน้าตาเป็นยังไง', body: 'แทน "ทำหน้า login" ให้บอก "หน้า login มี email+password, กด Enter ส่งได้, ผิดแล้วขึ้นข้อความสีแดง, มีเทสต์ครอบ" ยิ่งชัดยิ่งไม่ต้องแก้ซ้ำ' },
  { id: 'plan', category: 'วางแผน', title: 'งานใหญ่ให้วางแผนก่อน', body: 'กด Shift+Tab จนขึ้น plan mode Claude จะสำรวจโค้ดและเสนอแผนก่อนแก้ไฟล์ ตรวจแผนแล้วค่อยให้ลงมือ' },
  { id: 'read-first', category: 'วางแผน', title: 'ให้อ่านก่อนแก้', body: 'ขึ้นต้นด้วย "อ่าน src/auth ก่อน ยังไม่ต้องแก้ อธิบายว่า flow ทำงานยังไง" จะได้รู้ว่า Claude เข้าใจตรงกับเราไหม' },
  { id: 'claude-md', category: 'บริบท', title: 'มี CLAUDE.md ในโปรเจกต์', body: 'รัน /init ให้ Claude สร้าง CLAUDE.md สรุปคำสั่ง build/test และกฎของโปรเจกต์ ทุก session จะอ่านไฟล์นี้ก่อนเสมอ' },
  { id: 'tests', category: 'ตรวจสอบ', title: 'ให้ Claude รันเทสต์ยืนยันเอง', body: 'ใส่ประโยค "รันเทสต์ให้ผ่านก่อนบอกว่าเสร็จ" หรือ "เขียนเทสต์ที่ fail ก่อน แล้วค่อยแก้โค้ด" ผลจะเชื่อถือได้กว่ามาก' },
  { id: 'esc', category: 'พื้นฐาน', title: 'กด Esc หยุดได้ทุกเมื่อ', body: 'เห็น Claude เริ่มไปผิดทาง กด Esc หยุดแล้วบอกทางที่ถูก ไม่ต้องรอให้ทำจนเสร็จ' },
  { id: 'esc-esc', category: 'พื้นฐาน', title: 'กด Esc สองครั้ง ย้อนไปแก้ข้อความก่อนหน้า', body: 'สั่งผิดหรืออยากเปลี่ยนคำสั่ง กด Esc สองครั้งเพื่อเลือกข้อความเก่ามาแก้แล้วส่งใหม่' },
  { id: 'bang', category: 'พื้นฐาน', title: 'ขึ้นต้นด้วย ! เพื่อรันคำสั่ง shell เอง', body: 'พิมพ์ !git status ผลลัพธ์จะเข้าไปอยู่ในบทสนทนาให้ Claude เห็นด้วย' },
  { id: 'image', category: 'บริบท', title: 'วางรูปหน้าจอได้', body: 'แคปหน้าจอ UI ที่พัง หรือ error ในเบราว์เซอร์ แล้ววางในช่องพิมพ์ Claude อ่านรูปได้' },
  { id: 'compact', category: 'ประหยัด', title: '/compact เมื่อคุยยาว', body: 'บทสนทนายาวทำให้แต่ละรอบช้าและแพงขึ้น /compact จะสรุปบริบทให้สั้นลงแต่ยังจำเรื่องเดิมได้' },
  { id: 'clear', category: 'ประหยัด', title: '/clear เมื่อเปลี่ยนเรื่อง', body: 'เปลี่ยนไปทำงานคนละเรื่องให้ /clear เริ่มใหม่ บริบทเก่าที่ไม่เกี่ยวจะไม่มารบกวน' },
  { id: 'model', category: 'ประหยัด', title: 'เลือก model ให้เหมาะกับงาน', body: 'งานเล็ก (เปลี่ยนชื่อ แปล สรุป) ใช้ model เล็กที่เร็วและถูกกว่าได้ งานยากค่อยใช้ตัวใหญ่ เปลี่ยนด้วย /model' },
  { id: 'small-steps', category: 'วางแผน', title: 'แบ่งงานเป็นชิ้นเล็ก', body: 'แทนสั่งทีเดียว "ทำระบบสมาชิก" ให้ทำทีละขั้น: model ข้อมูล → API → หน้าจอ → เทสต์ ตรวจทีละขั้นง่ายกว่ามาก' },
  { id: 'subagent', category: 'วางแผน', title: 'ให้ใช้ subagent สำรวจ', body: 'งานค้นหาทั่วโปรเจกต์ บอกว่า "ใช้ subagent ไปหาว่า..." บริบทหลักจะไม่ถูกผลค้นหาจำนวนมากกินที่' },
  { id: 'why', category: 'ตรวจสอบ', title: 'ถามว่า "ทำไม" ก่อนยอมรับ', body: 'ไม่แน่ใจโค้ดที่ได้ ถาม "ทำไมเลือกวิธีนี้ มีทางอื่นไหม ข้อเสียคืออะไร" จะเห็นจุดที่ Claude อาจมองข้าม' },
  { id: 'diff', category: 'ตรวจสอบ', title: 'ดู diff ก่อน commit เสมอ', body: 'สั่ง "สรุปสิ่งที่เปลี่ยนใน git diff" หรือดูเองด้วย !git diff ก่อน commit ทุกครั้ง' },
  { id: 'permissions', category: 'ทีม', title: 'ตั้งสิทธิ์คำสั่งที่ใช้บ่อย', body: 'ใช้ /permissions อนุญาตคำสั่งปลอดภัยที่ใช้บ่อย (เช่น npm test) จะไม่ต้องกดอนุญาตซ้ำทุกครั้ง' },
  { id: 'resume', category: 'พื้นฐาน', title: 'กลับมาคุยต่อได้', body: 'ปิดไปแล้วอยากคุยต่อ ใช้ claude --continue (ล่าสุด) หรือ /resume เลือก session เก่า' },
  { id: 'examples', category: 'บริบท', title: 'ให้ตัวอย่างที่มีอยู่แล้ว', body: '"เขียน API ใหม่ให้หน้าตาเหมือน src/api/users.ts" Claude จะทำตามสไตล์ของโปรเจกต์โดยไม่ต้องอธิบายยาว' },
]

// ==========================================================================
// บทที่ 2: Template prompt - {ช่องว่าง} คือส่วนที่ต้องเติมเอง
// ==========================================================================
const TEMPLATES: Record<string, { name: string; text: string }> = {
  bug: { name: 'แก้บั๊ก', text: 'บั๊ก: {อาการที่เห็น}\nขั้นตอนทำให้เกิด: {1. ... 2. ...}\nที่ควรเป็น: {ผลที่ถูกต้อง}\n\nหาสาเหตุก่อน อธิบายให้ฟังว่าเกิดจากอะไร แล้วค่อยแก้ เขียนเทสต์ที่จับบั๊กนี้ได้ และรันเทสต์ให้ผ่าน' },
  feature: { name: 'ฟีเจอร์ใหม่', text: 'อยากเพิ่ม: {ฟีเจอร์}\nผู้ใช้คือ: {ใคร} และใช้ทำ: {เพื่ออะไร}\nถือว่าเสร็จเมื่อ:\n- {เงื่อนไข 1}\n- {เงื่อนไข 2}\n\nวางแผนก่อน บอกไฟล์ที่จะแก้ แล้วรอผมยืนยันก่อนลงมือ' },
  refactor: { name: 'Refactor', text: 'Refactor {ไฟล์หรือฟังก์ชัน} ให้ {อ่านง่ายขึ้น / แยกส่วน / ลดโค้ดซ้ำ}\nห้ามเปลี่ยนพฤติกรรมที่ผู้ใช้เห็น รันเทสต์ก่อนและหลังให้ผลเหมือนกัน แก้ทีละขั้นเล็กๆ' },
  review: { name: 'รีวิวโค้ด', text: 'รีวิว git diff ปัจจุบัน หาบั๊ก, edge case ที่พลาด, ปัญหาความปลอดภัย และจุดที่อ่านยาก เรียงจากสำคัญมากไปน้อย อ้างบรรทัดด้วย ยังไม่ต้องแก้' },
  test: { name: 'เขียนเทสต์', text: 'เขียนเทสต์ให้ {ไฟล์/ฟังก์ชัน} ครอบกรณีปกติ กรณีขอบ (ค่าว่าง ค่าติดลบ ข้อมูลใหญ่) และกรณี error ใช้ framework เดียวกับเทสต์ที่มีอยู่ แล้วรันให้ผ่าน' },
  explain: { name: 'อธิบายโค้ด', text: 'อธิบาย {ไฟล์/โฟลเดอร์} ให้ Dev ใหม่เข้าใจ: ทำหน้าที่อะไร ข้อมูลไหลยังไง จุดที่ต้องระวังคืออะไร ตอบเป็นภาษาไทย ยังไม่ต้องแก้อะไร' },
  commit: { name: 'ข้อความ commit', text: 'ดู git diff ที่ staged อยู่ แล้วเขียน commit message: บรรทัดแรกสั้นไม่เกิน 60 ตัว บอกว่าเปลี่ยนอะไร ย่อหน้าถัดไปบอกว่าทำไม' },
  perf: { name: 'หาจุดช้า', text: '{หน้า/ฟังก์ชัน} ช้า ({ตัวเลขที่วัดได้ ถ้ามี}) หาว่าช้าตรงไหน วัดให้เห็นก่อนแก้ แล้วเสนอวิธีแก้ที่คุ้มที่สุด 2-3 ทาง' },
}

const CATEGORIES = [...new Set(TIPS.map(t => t.category))]
let favorites: string[] = []

function format(t: Tip): string {
  return `💡 [${t.category}] ${t.title}\n${t.body}`
}

// ทิปประจำวัน: เลือกจากลำดับวันในปี ได้ทิปเดิมทั้งวัน
function tipOfDay(now: number): Tip {
  const d = new Date(now)
  const day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000)
  return TIPS[day % TIPS.length] ?? TIPS[0]!
}

const HELP = `💡 Agent Tips TH (Mod 32)
========================================
/agenttips                ทิปวันนี้
/agenttips random | all
/agenttips cat <หมวด>     หมวด: ${CATEGORIES.join(', ')}
/agenttips search <คำ>
/agenttips fav [id]       ดู/เพิ่ม/เอาออกจากรายการโปรด
/agenttips template [ชื่อ]   ${Object.entries(TEMPLATES).map(([k, t]) => `${k}=${t.name}`).join(' ')}
   เลือกแล้วเติมลงช่องพิมพ์ให้ แก้ {ช่องว่าง} แล้วกด Enter`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('favorites')
    favorites = Array.isArray(saved) ? (saved as string[]) : []
    // ทิปวันนี้แสดงครั้งแรกของวันเท่านั้น
    const now = await $.clock.now()
    const today = new Date(now).toDateString()
    if ((await $.store.get('shownOn')) !== today) {
      $.ui.toast(`💡 ทิปวันนี้: ${tipOfDay(now).title} (/agenttips)`, { timeoutMs: 8000 })
      await $.store.set('shownOn', today)
    }
    await $.command.register({ name: 'agenttips', description: 'ทิปสั่ง Claude Code วันละข้อ + template prompt (/agenttips help)', argumentHint: 'random|cat|search|fav|template' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: คำสั่ง /agenttips
  // ==========================================================================
  on('command.run', { command: 'agenttips' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    switch (sub) {
      case '':
      case 'today':
        return { text: `📅 ทิปวันนี้\n${format(tipOfDay(await $.clock.now()))}` }
      case 'random':
        return { text: format(TIPS[Math.floor(Math.random() * TIPS.length)] ?? TIPS[0]!) }
      case 'all':
        return { text: CATEGORIES.map(c => `${c}\n${TIPS.filter(t => t.category === c).map(t => `  ${t.id.padEnd(12)} ${t.title}`).join('\n')}`).join('\n') }
      case 'cat': {
        const list = TIPS.filter(t => t.category === arg)
        return { text: list.length ? list.map(format).join('\n\n') : `หมวดที่มี: ${CATEGORIES.join(', ')}` }
      }
      case 'search': {
        const q = arg.toLowerCase()
        const list = TIPS.filter(t => `${t.title} ${t.body} ${t.id}`.toLowerCase().includes(q))
        return { text: list.length ? list.map(format).join('\n\n') : `ไม่พบทิปที่มีคำว่า "${arg}"` }
      }
      case 'fav': {
        if (!arg) return { text: favorites.length ? ['⭐ ทิปโปรด', ...favorites.map(id => TIPS.find(t => t.id === id)).filter((t): t is Tip => Boolean(t)).map(format)].join('\n\n') : 'ยังไม่มีทิปโปรด /agenttips fav <id> (ดู id ด้วย /agenttips all)' }
        if (!TIPS.some(t => t.id === arg)) return { text: `ไม่มีทิป id "${arg}"` }
        favorites = favorites.includes(arg) ? favorites.filter(f => f !== arg) : [...favorites, arg]
        await $.store.set('favorites', favorites)
        return { text: favorites.includes(arg) ? `⭐ เพิ่ม "${arg}" แล้ว` : `☆ เอา "${arg}" ออกแล้ว` }
      }
      case 'template': {
        const t = TEMPLATES[arg]
        if (!t) return { text: ['📝 Template', ...Object.entries(TEMPLATES).map(([k, v]) => `  ${k.padEnd(9)} ${v.name}`), '', 'เลือกด้วย /agenttips template bug'].join('\n') }
        // เติมลงช่องพิมพ์ (ไม่ส่งเอง) ให้ผู้ใช้แก้ส่วนที่อยู่ใน {} ก่อน
        const filled = await $.prompt.fill({ text: t.text, mode: 'replace' }).catch(() => ({ isFilled: false }))
        return { text: filled.isFilled ?`📝 เติม template "${t.name}" ลงช่องพิมพ์แล้ว แก้ {ช่องว่าง} แล้วกด Enter` : `📝 ${t.name} (copy ไปใช้ได้)\n\n${t.text}` }
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
 * 1. เพิ่ม template ของทีม เช่น รูปแบบ PR, checklist ก่อน deploy
 * 2. ดัก prompt.submit: ถ้า prompt สั้นเกิน 5 คำ แนะนำทิป "บอกให้ชัด"
 * 3. ให้ Claude ปรับ prompt ของผู้ใช้ให้ชัดขึ้นก่อนส่ง ด้วย $.model.complete
 */
