/**
 * ============================================================================
 * MOD 62: Session Bridge TH - ท่อเชื่อม Claude Code หลายหน้าต่าง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เปิด Claude 2 หน้าต่าง ตัวหนึ่งเขียน backend อีกตัวเขียน frontend
 *                แล้วต้องก๊อปข้อความไปมาเอง
 *
 * หน้าที่ของ Mod นี้:
 * 1. /bridge list - ดูว่ามี session / agent ไหนที่ส่งหาได้ (ใช้ tool ListAgents ของ Claude Code)
 * 2. /bridge send <ชื่อ> <ข้อความ> - ส่งข้อความไปให้ Claude อีกหน้าต่างอ่าน
 * 3. /bridge share <ชื่อ> [หมายเหตุ] - ส่งคำตอบล่าสุดของ Claude หน้าต่างนี้ไปให้อีกฝั่ง
 *    เช่น ส่งสเปก API ที่เพิ่งออกแบบ ไปให้หน้าต่างที่ทำ frontend
 * 4. แจ้งเตือนเมื่อมีข้อความเข้ามาจาก session อื่น + /bridge inbox ดูย้อนหลัง
 *
 * ข้อความที่ส่งไปถูกส่งผ่านกลไก SendMessage ของ Claude Code เอง (เครื่องเดียวกัน บัญชีเดียวกัน)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Mail {
  at: number
  from: string
  text: string
}

let inbox: Mail[] = []
let sent = 0

// ==========================================================================
// บทที่ 1: รายชื่อที่ส่งหาได้ - เรียก tool ListAgents เหมือนที่โมเดลเรียก
// ==========================================================================
async function peers($: EngineInterface): Promise<string> {
  const r = await $.tool.call({ tool: 'ListAgents' }).catch((err: unknown) => ({ deny: String(err) }))
  if ('deny' in r && r.deny !== undefined) return `❌ ดูรายชื่อไม่ได้: ${r.deny}`
  const text = 'text' in r && r.text ? r.text : ''
  return text ? `🔗 session / agent ที่ส่งหาได้\n\n${text.trim()}\n\nส่ง: /bridge send <ชื่อ> <ข้อความ>` : '🔗 ยังไม่เห็น session อื่น (เปิด Claude Code อีกหน้าต่างก่อน)'
}

// ==========================================================================
// บทที่ 2: ส่งข้อความ - ใส่หัวบอกว่ามาจากไหน ให้ฝั่งรับรู้บริบท
// ==========================================================================
async function send($: EngineInterface, to: string, body: string): Promise<string> {
  const root = (await $.session.root()).split(/[\\/]/).pop() ?? ''
  const text = `[ส่งผ่าน Session Bridge จากหน้าต่างที่ทำงานในโปรเจกต์ "${root}"]\n${body}`
  try {
    const r = await $.session.send({ to, text })
    if (!r.isDelivered) return `❌ ส่งไม่ถึง ${to}: ${r.reason}\nดูชื่อที่ถูกต้องด้วย /bridge list`
    sent++
    return `📨 ส่งถึง ${to} แล้ว (${[...body].length} ตัวอักษร)`
  } catch (err) {
    return `❌ ส่งไม่สำเร็จ: ${String(err).slice(0, 200)}\nดูชื่อที่ถูกต้องด้วย /bridge list`
  }
}

async function lastAnswer($: EngineInterface): Promise<string | undefined> {
  const messages = await $.session.messages()
  const last = [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())
  return last?.text.trim()
}

const HELP = `🔗 Session Bridge TH (Mod 62)
========================================
/bridge list                    session / agent ที่ส่งหาได้
/bridge send <ชื่อ> <ข้อความ>    ส่งข้อความให้ Claude อีกหน้าต่าง
/bridge share <ชื่อ> [หมายเหตุ]  ส่งคำตอบล่าสุดของหน้าต่างนี้ไปให้
/bridge inbox                   ข้อความที่ได้รับ`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    inbox = []
    sent = 0
    await $.command.register({ name: 'bridge', description: 'ส่งข้อความ/งานล่าสุดไปให้ Claude Code อีกหน้าต่าง (/bridge help)', argumentHint: 'list|send <ชื่อ> <ข้อความ>|share <ชื่อ>|inbox' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ข้อความเข้า - จดลงกล่อง แล้วปล่อยให้ Claude อ่านตามปกติ
  // ==========================================================================
  on('session.receive', async ($, e, next) => {
    if (e.origin.kind === 'peer' || e.origin.kind === 'peer-send-message') {
      const from = /จากหน้าต่างที่ทำงานในโปรเจกต์ "([^"]+)"/.exec(e.text)?.[1] ?? 'session อื่น'
      inbox = [...inbox, { at: await $.clock.now(), from, text: e.text.slice(0, 2000) }].slice(-30)
      $.ui.toast(`📬 ข้อความจาก ${from}: ${e.text.replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').slice(0, 60)}`, { timeoutMs: 12_000 })
    }
    return next(e)
  })

  on('command.run', { command: 'bridge' }, async ($, e) => {
    const [sub = '', to = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'list':
        return { text: await peers($) }
      case 'send': {
        const body = rest.join(' ')
        if (!to || !body) return { text: 'วิธีใช้: /bridge send backend ช่วยเพิ่ม endpoint GET /users ให้ด้วย' }
        return { text: await send($, to, body) }
      }
      case 'share': {
        if (!to) return { text: 'วิธีใช้: /bridge share frontend [หมายเหตุ]' }
        const answer = await lastAnswer($)
        if (!answer) return { text: 'ยังไม่มีคำตอบของ Claude ในหน้าต่างนี้ให้ส่ง' }
        const note = rest.join(' ')
        return { text: await send($, to, `${note ? `${note}\n\n` : ''}คำตอบล่าสุดจากหน้าต่างนั้น:\n${answer.slice(0, 6000)}`) }
      }
      case 'inbox':
        return {
          text: inbox.length
            ? ['📬 ข้อความที่ได้รับ', ...inbox.slice(-10).map(m => `\n${new Date(m.at).toLocaleTimeString('th-TH')} · จาก ${m.from}\n${m.text.replace(/^\[[^\]]*\]\s*/, '').slice(0, 400)}`)].join('\n')
            : '📭 ยังไม่มีข้อความเข้า',
        }
      default:
        return { text: `${HELP}\n\nsession นี้ส่งไป ${sent} · ได้รับ ${inbox.length}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. /bridge ask - ส่งคำถามแล้วรอคำตอบกลับมาแสดงในแผง
 * 2. ส่งไฟล์ diff ล่าสุดไปให้อีกหน้าต่างรีวิว
 * 3. ตั้งชื่อเล่นให้ session (backend / frontend) จำไว้ใช้ครั้งหน้า
 */
