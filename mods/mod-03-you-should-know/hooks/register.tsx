/**
 * ============================================================================
 * MOD 03: You Should Know TH - ตัวเตือนทิปเด็ด (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ปลั๊กอิน "you-should-know" ที่ Anthropic ทำเป็นตัวอย่าง
 *
 * หน้าที่ของ Mod นี้:
 * 1. เตือนทิปตามบริบท (contextual tips) ด้วย toast มุมจอ
 * 2. ไม่บล็อกอะไรเลย แค่ "สอน" ผู้ใช้ระหว่างทำงาน (Educational Mod)
 * 3. จำว่าแสดงทิปไหนไปแล้วด้วย Set จะได้ไม่สแปม
 * 4. มีคำสั่ง /tips สำหรับดู สุ่ม และรีเซ็ตทิป
 */

import type { EngineInterface, Register } from 'claude-code'

interface Tip {
  id: string
  trigger: string // จะแสดงเมื่อไหร่ (ไว้อธิบายใน /tips)
  title: string
  message: string
  learnMore: string // คำสั่งหรือสิ่งที่ให้ลอง
}

// ==========================================================================
// บทที่ 1: คลังทิป - เพิ่มทิปของทีมคุณเองได้ตรงนี้
// ==========================================================================
const TIPS: Tip[] = [
  {
    id: 'mention-file',
    trigger: 'พิมพ์ path ของไฟล์ยาวๆ ใน prompt',
    title: '💡 ใช้ @ เพื่อ mention ไฟล์ได้',
    message: "แทนที่จะพิมพ์ path เต็มๆ ให้พิมพ์ '@Button.tsx' แล้วเลือกไฟล์ Claude จะเห็นไฟล์นั้นทันที",
    learnMore: 'ลองพิมพ์ @ แล้วเลือกไฟล์',
  },
  {
    id: 'clear-session',
    trigger: 'เรียก tool เกิน 30 ครั้ง',
    title: '💡 Session ยาวแล้ว ลองสรุปบริบท',
    message: 'บทสนทนายาวทำให้แต่ละรอบใช้ token มากขึ้น ถ้าเปลี่ยนเรื่องให้ /clear ถ้ายังทำเรื่องเดิมให้ /compact',
    learnMore: '/compact หรือ /clear',
  },
  {
    id: 'plan-mode',
    trigger: 'tool ล้มเหลวติดกัน 2 ครั้ง',
    title: '💡 ลองใช้ Plan Mode ไหม?',
    message: 'งานที่ซับซ้อนควรให้ Claude วางแผนก่อนลงมือ กด Shift+Tab จนขึ้น plan mode แล้ว Claude จะเสนอแผนให้ดูก่อน',
    learnMore: 'กด Shift+Tab',
  },
  {
    id: 'edit-vs-write',
    trigger: 'ใช้ Write ทับไฟล์ที่มีอยู่แล้ว',
    title: '💡 Edit ปลอดภัยกว่า Write',
    message: 'Edit แก้เฉพาะจุด ส่วน Write เขียนทับทั้งไฟล์ Write จึงเหมาะกับไฟล์ใหม่มากกว่า',
    learnMore: "บอก Claude ว่า 'แก้เฉพาะจุดด้วย Edit นะ'",
  },
  {
    id: 'bash-check',
    trigger: 'รันคำสั่ง Bash ที่อาจอันตราย (rm -rf, sudo, --force)',
    title: '⚠️ ระวังคำสั่ง Bash นะครับ',
    message: 'คำสั่งนี้อาจลบหรือเขียนทับของจริง ถ้ามี --dry-run ให้ลองก่อน และอ่านคำสั่งก่อนกดอนุญาต',
    learnMore: 'เช่น git clean -n ก่อน git clean -f',
  },
  {
    id: 'thai-comment',
    trigger: 'สุ่มระหว่างทำงาน',
    title: '🇹🇭 ขอคอมเมนต์ภาษาไทยได้',
    message: "บอก Claude ว่า 'ใส่คอมเมนต์ภาษาไทยด้วย' ได้เลย เหมาะกับทีมที่ส่งงานให้คนไทยอ่าน",
    learnMore: "ลอง: 'อธิบายฟังก์ชันนี้เป็นภาษาไทย'",
  },
  {
    id: 'model-choice',
    trigger: 'สุ่มระหว่างทำงาน',
    title: '💰 เลือก model ให้เหมาะกับงาน',
    message: 'งานเล็กๆ เช่น แปลภาษาหรือสรุปไฟล์สั้นๆ ใช้ model ที่เล็กกว่าได้ ถูกและเร็วกว่า',
    learnMore: '/model',
  },
  {
    id: 'context-usage',
    trigger: 'context ใช้ไปเกิน 80%',
    title: '🧠 Context ใกล้เต็มแล้ว!',
    message: 'ควร /compact ตอนนี้ ก่อนที่ระบบจะสรุปให้เองกลางงาน',
    learnMore: '/compact หรือ /context เพื่อดูรายละเอียด',
  },
  {
    id: 'first-time',
    trigger: 'ใช้ Mod นี้ครั้งแรก',
    title: '👋 ยินดีต้อนรับ! 3 ทิปเริ่มต้น',
    message: '1. พิมพ์ @ เพื่อเลือกไฟล์  2. พิมพ์ / เพื่อดูคำสั่ง  3. กด Esc เพื่อหยุด Claude',
    learnMore: '/tips เพื่อดูทิปทั้งหมด',
  },
]

// ==========================================================================
// บทที่ 2: state ของ Mod - ตัวแปรนอก register() จำค่าข้าม event ได้
// ==========================================================================
// (ตัวแปรพวกนี้จะเริ่มใหม่เมื่อ mod ถูก reload ซึ่งสำหรับทิปถือว่าโอเค)
const shownTips = new Set<string>() // แสดงไปแล้ว -> ไม่แสดงซ้ำ
let toolCallCount = 0
let failStreak = 0 // ล้มเหลวติดกันกี่ครั้ง

// แสดงทิปด้วย toast (ถ้ายังไม่เคยแสดง) แล้วจดไว้ใน Set
function showTip($: EngineInterface, id: string): void {
  const tip = TIPS.find(t => t.id === id)
  if (!tip || shownTips.has(id)) return

  $.ui.toast(`${tip.title}\n${tip.message}\n👉 ${tip.learnMore}`, { timeoutMs: 10_000 })
  shownTips.add(id)
}

function formatTip(tip: Tip): string {
  return `${tip.title}\nแสดงเมื่อ: ${tip.trigger}\n${tip.message}\n👉 ${tip.learnMore}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    toolCallCount = 0
    failStreak = 0
    shownTips.clear()

    await $.command.register({ name: 'tips', description: 'ดูทิปทั้งหมด (/tips random, /tips reset, /tips <id>)', argumentHint: '[list|random|reset|id]' })

    // ทิปต้อนรับแสดงแค่ครั้งแรกที่ติดตั้ง: ใช้ $.store จำข้าม session
    if ((await $.store.get('welcomed')) !== true) {
      showTip($, 'first-time')
      await $.store.set('welcomed', true)
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: prompt.submit - ดูว่าผู้ใช้พิมพ์อะไร (แค่อ่าน ไม่แก้)
  // ==========================================================================
  on('prompt.submit', ($, e, next) => {
    // มี path ยาวๆ เช่น src/components/Button.tsx แต่ไม่ได้ใช้ @
    if (/[\w.-]+\/[\w./-]+\.\w{1,5}\b/.test(e.text) && !e.text.includes('@')) {
      showTip($, 'mention-file')
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: tool.call - เช็ค pattern ก่อนรัน + ดูผลหลังรัน
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    toolCallCount++

    // เช็คแบบ e.tool === "..." แล้ว TypeScript จะรู้ว่า e มี field อะไร
    if (e.tool === 'Write' && (await $.fs.exists(e.file_path))) {
      showTip($, 'edit-vs-write')
    }
    if (e.tool === 'Bash' && /rm -rf|sudo |--force/.test(e.command)) {
      showTip($, 'bash-check')
    }
    if (toolCallCount === 31) {
      showTip($, 'clear-session')
    } else if (toolCallCount % 15 === 0) {
      // ทุก 15 ครั้ง สุ่มทิปที่ยังไม่เคยเห็น
      const notShown = TIPS.filter(t => !shownTips.has(t.id))
      const pick = notShown[Math.floor(Math.random() * notShown.length)]
      if (pick) showTip($, pick.id)
    }

    const ran = await next(e) // ให้ tool รันจริง

    // ผลออกมาเป็น error -> นับ streak, ถ้าพลาด 2 ครั้งติดแนะนำ Plan Mode
    failStreak = ran.isError ? failStreak + 1 : 0
    if (failStreak >= 2) showTip($, 'plan-mode')

    return ran
  })

  // ==========================================================================
  // บทที่ 5: turn.complete - เช็ค context หลังจบแต่ละรอบ
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const { context } = await $.session.usage()
    if ((context.percent ?? 0) > 80) showTip($, 'context-usage')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 6: คำสั่งแบบมี subcommand - /tips random, /tips reset
  // ==========================================================================
  on('command.run', { command: 'tips' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === '' || arg === 'list') {
      const rows = TIPS.map(t => `${shownTips.has(t.id) ? '✅' : '⬜'} ${t.id.padEnd(16)} ${t.title}`)
      return {
        text: [
          `📚 คลังทิป (Mod 03) - แสดงไปแล้ว ${shownTips.size}/${TIPS.length}`,
          '----------------------------------------',
          ...rows,
          '',
          '/tips random = สุ่มทิป | /tips reset = รีเซ็ต | /tips <id> = ดูทิปนั้น',
        ].join('\n'),
      }
    }
    if (arg === 'random') {
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)]
      return { text: tip ? formatTip(tip) : 'ยังไม่มีทิป' }
    }
    if (arg === 'reset') {
      shownTips.clear()
      await $.store.delete('welcomed')
      return { text: '🔄 รีเซ็ตแล้ว ทิปทั้งหมดจะแสดงใหม่' }
    }

    const found = TIPS.find(t => t.id === arg)
    return { text: found ? formatTip(found) : `❌ ไม่เจอทิป "${arg}" ลอง /tips list` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เพิ่มทิปกฎของบริษัท เช่น "ห้าม push เข้า main ตรงๆ" แล้วเช็คใน tool.call
 *    ว่า e.tool === "Bash" && e.command.includes("git push origin main")
 * 2. เก็บ shownTips ลง $.store เพื่อจำข้าม session
 * 3. ใช้ $.model.complete สร้างทิปใหม่จากสิ่งที่ผู้ใช้ทำบ่อย
 */
