/**
 * ============================================================================
 * MOD 22: Smartwatch Notify TH - แจ้งเตือนจาก Claude Code ไปมือถือและนาฬิกา (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: สมาร์ทวอทช์ที่สั่นเตือนเมื่อมีเรื่องสำคัญ
 *
 * ปัญหา: สั่ง Claude ทำงานยาวแล้วลุกไปทำอย่างอื่น ไม่รู้ว่าเสร็จหรือยัง หรือติดรออนุญาตอยู่
 *
 * หน้าที่ของ Mod นี้:
 * 1. ส่งแจ้งเตือนผ่าน ntfy (https://ntfy.sh) ไปแอป ntfy บนมือถือ
 *    นาฬิกาที่จับคู่กับมือถือ (Apple Watch, Wear OS, Galaxy Watch, Mi Band) จะสั่นตามเอง
 * 2. แจ้งเมื่อ: งานเสร็จ (ถ้านานกว่าที่ตั้งไว้), Claude รออนุญาต/รอคำตอบ, เกิด error
 * 3. โหมดห้ามรบกวนตามช่วงเวลา, เลือกได้ว่าจะส่งตัวอย่างคำตอบไปด้วยไหม
 * 4. แผง "หน้าปัดนาฬิกา" สรุปแจ้งเตือนล่าสุด
 *
 * ความเป็นส่วนตัว: ใครรู้ชื่อ topic ก็อ่านแจ้งเตือนได้ Mod จึงสุ่มชื่อยาวให้ และค่าเริ่มต้นไม่ส่งเนื้อหาคำตอบ
 */

import type { EngineInterface, Register } from 'claude-code'

interface Settings {
  enabled: boolean
  server: string
  topic: string
  minSeconds: number // แจ้งงานเสร็จเฉพาะ turn ที่นานกว่านี้
  dnd?: { from: string; to: string } // "22:00" - "07:00"
  preview: boolean // ส่งข้อความตัวอย่างของคำตอบไปด้วยไหม
}
interface Sent {
  at: number
  title: string
  ok: boolean
}

const PANE = 'smartwatch-notify-th'
let settings: Settings = { enabled: false, server: 'https://ntfy.sh', topic: '', minSeconds: 30, preview: false }
let sent: Sent[] = []
let turnStartedAt = 0

// ==========================================================================
// บทที่ 1: สุ่มชื่อ topic ยาวๆ (ชื่อ topic = รหัสผ่าน ใครรู้ก็อ่านได้)
// ==========================================================================
function randomTopic(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `claude-th-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`
}

// ==========================================================================
// บทที่ 2: ช่วงห้ามรบกวน (รองรับข้ามเที่ยงคืน เช่น 22:00-07:00)
// ==========================================================================
function minutesOf(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

function inDnd(now: number): boolean {
  if (!settings.dnd) return false
  const d = new Date(now)
  const t = d.getHours() * 60 + d.getMinutes()
  const from = minutesOf(settings.dnd.from)
  const to = minutesOf(settings.dnd.to)
  return from <= to ? t >= from && t < to : t >= from || t < to
}

// ==========================================================================
// บทที่ 3: ส่งแจ้งเตือนแบบ JSON ไปที่ ntfy (ส่งภาษาไทยได้ไม่เพี้ยน)
// ==========================================================================
async function send($: EngineInterface, title: string, message: string, priority: 1 | 2 | 3 | 4 | 5, tags: string[], force = false): Promise<boolean> {
  const now = await $.clock.now()
  if (!force && (!settings.enabled || !settings.topic || inDnd(now))) return false
  let ok = false
  try {
    const res = await $.http.fetch(settings.server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: settings.topic, title, message, priority, tags }),
    })
    ok = res.ok
  } catch {
    ok = false
  }
  sent = [...sent, { at: now, title, ok }].slice(-20)
  $.ui.invalidate('ui.render')
  return ok
}

async function saveSettings($: EngineInterface): Promise<void> {
  await $.store.set('settings', settings)
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} วิ` : `${Math.floor(s / 60)} นาที ${s % 60} วิ`
}

const help = () => `⌚ Smartwatch Notify TH (Mod 22)
========================================
/smartwatch setup          สร้าง topic ส่วนตัว + วิธีติดตั้งแอปบนมือถือ
/smartwatch test           ส่งข้อความทดสอบ
/smartwatch on | off       เปิด/ปิดการแจ้งเตือน
/smartwatch min <วินาที>   แจ้งงานเสร็จเฉพาะงานที่นานกว่านี้ (ตอนนี้ ${settings.minSeconds} วิ)
/smartwatch dnd 22:00-07:00 | dnd off   ช่วงห้ามรบกวน
/smartwatch preview on|off ส่งตัวอย่างคำตอบของ Claude ไปด้วย (ค่าเริ่มต้น: ปิด)
/smartwatch server <url>   ใช้ ntfy server ของตัวเอง
/smartwatch status         ดูการตั้งค่า + หน้าปัดในแผง`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('settings')) as Partial<Settings> | undefined
    settings = { ...settings, ...saved }
    await $.command.register({ name: 'smartwatch', description: 'ส่งแจ้งเตือนจาก Claude Code ไปมือถือ/นาฬิกา (/smartwatch help)', argumentHint: 'setup|test|on|off|dnd|min|status' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ฟัง event ที่ควรแจ้ง - เริ่ม/จบ turn และการแจ้งเตือนของ Claude Code เอง
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turnStartedAt = await $.clock.now()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result // นับเฉพาะงานหลัก ไม่นับ subagent
    const took = (await $.clock.now()) - turnStartedAt
    if (e.reason === 'error') {
      void send($, '❌ Claude Code เจอ error', 'งานหยุดกลางคัน กลับไปดูที่เครื่องได้เลย', 4, ['warning'])
    } else if (e.reason !== 'aborted' && took >= settings.minSeconds * 1000) {
      const preview = settings.preview ? `\n${e.answer.replace(/\s+/g, ' ').slice(0, 120)}` : ''
      void send($, '✅ Claude ทำงานเสร็จแล้ว', `ใช้เวลา ${duration(took)}${preview}`, 3, ['white_check_mark'])
    }
    return result
  })

  // Claude Code ยิงแจ้งเตือนเองเมื่อรออนุญาตหรือรอคำตอบนาน -> ส่งต่อไปที่นาฬิกา
  on('classic.Notification', async ($, e, next) => {
    void send($, '⏳ Claude รอคุณอยู่', e.message.slice(0, 160), 4, ['hourglass'])
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: หน้าปัดนาฬิกาในแผง
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = new Date(await $.clock.now())
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const state = !settings.topic ? 'ยังไม่ตั้งค่า' : !settings.enabled ? 'ปิดอยู่' : inDnd(now.getTime()) ? 'ห้ามรบกวน' : 'พร้อมแจ้ง'
    return (
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor="#455a64" paddingX={2}>
        <Text bold color="#26a69a">
          {clock}
        </Text>
        <Text dimColor>⌚ {state}</Text>
        {sent.slice(-5).reverse().map(s => (
          <Text wrap="truncate-end">
            {s.ok ? '·' : '✗'} {new Date(s.at).toTimeString().slice(0, 5)} {s.title}
          </Text>
        ))}
        {sent.length === 0 && <Text dimColor>ยังไม่มีแจ้งเตือน</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'smartwatch' }, async ($, e) => {
    const [sub = 'help', arg] = e.args.trim().split(/\s+/).filter(Boolean)

    switch (sub) {
      case 'setup': {
        if (!settings.topic || arg === 'new') settings.topic = randomTopic()
        settings.enabled = true
        await saveSettings($)
        return {
          text: [
            '⌚ ตั้งค่าแจ้งเตือนไปมือถือ/นาฬิกา',
            '----------------------------------------',
            '1. ติดตั้งแอป "ntfy" บนมือถือ (App Store / Google Play)',
            `2. กด + แล้ว Subscribe topic: ${settings.topic}`,
            `   (server: ${settings.server})`,
            '3. เปิดการแจ้งเตือนของแอป ntfy ในแอปนาฬิกาของมือถือ ถ้าอยากให้ข้อมือสั่น',
            '4. พิมพ์ /smartwatch test',
            '',
            '🔒 ชื่อ topic คือรหัสผ่าน อย่าแชร์ ถ้าหลุดให้สร้างใหม่ด้วย /smartwatch setup new',
          ].join('\n'),
        }
      }
      case 'test': {
        if (!settings.topic) return { text: 'ยังไม่ได้ตั้งค่า พิมพ์ /smartwatch setup ก่อน' }
        const ok = await send($, '⌚ ทดสอบจาก Claude Code', 'ถ้าเห็นข้อความนี้ แปลว่าตั้งค่าสำเร็จ 🎉', 3, ['tada'], true)
        return { text: ok ? '✅ ส่งแล้ว ดูที่มือถือได้เลย' : `❌ ส่งไม่สำเร็จ ตรวจ server: ${settings.server}` }
      }
      case 'on':
      case 'off':
        settings.enabled = sub === 'on'
        await saveSettings($)
        $.ui.invalidate('ui.render')
        return { text: settings.enabled ? '🔔 เปิดการแจ้งเตือนแล้ว' : '🔕 ปิดการแจ้งเตือนแล้ว' }
      case 'min':
        if (arg === undefined || !/^\d+$/.test(arg)) return { text: 'วิธีใช้: /smartwatch min 30  (0 = แจ้งทุกงาน)' }
        settings.minSeconds = Number(arg)
        await saveSettings($)
        return { text: `⏱️ แจ้งงานเสร็จเฉพาะงานที่นานกว่า ${settings.minSeconds} วินาที` }
      case 'dnd': {
        if (arg === 'off') {
          settings.dnd = undefined
        } else {
          const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(arg ?? '')
          const valid = (t: string | undefined) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t ?? '')
          if (!m || !valid(m[1]) || !valid(m[2])) return { text: 'วิธีใช้: /smartwatch dnd 22:00-07:00  หรือ  /smartwatch dnd off' }
          settings.dnd = { from: m[1] ?? '22:00', to: m[2] ?? '07:00' }
        }
        await saveSettings($)
        return { text: settings.dnd ? `🌙 ห้ามรบกวน ${settings.dnd.from}-${settings.dnd.to}` : '☀️ ปิดช่วงห้ามรบกวนแล้ว' }
      }
      case 'preview':
        settings.preview = arg === 'on'
        await saveSettings($)
        return { text: settings.preview ? '👀 จะส่งตัวอย่างคำตอบ 120 ตัวอักษรไปด้วย (ข้อมูลจะผ่าน server ของ ntfy)' : '🙈 ไม่ส่งเนื้อหาคำตอบ' }
      case 'server': {
        try {
          settings.server = new URL(arg ?? '').origin
        } catch {
          return { text: 'วิธีใช้: /smartwatch server https://ntfy.example.com' }
        }
        await saveSettings($)
        return { text: `🖥️ ใช้ server ${settings.server}` }
      }
      case 'status':
        await $.ui.open({ id: PANE, title: '⌚ Watch' })
        return {
          text: [
            `⌚ ${settings.enabled ? '🔔 เปิด' : '🔕 ปิด'} | topic: ${settings.topic ? `${settings.topic.slice(0, 14)}…` : 'ยังไม่ตั้ง'} | server: ${settings.server}`,
            `งานเสร็จ: แจ้งเมื่อนานกว่า ${settings.minSeconds} วิ | ห้ามรบกวน: ${settings.dnd ? `${settings.dnd.from}-${settings.dnd.to}` : 'ไม่ตั้ง'} | ตัวอย่างคำตอบ: ${settings.preview ? 'ส่ง' : 'ไม่ส่ง'}`,
            `ส่งไปแล้ว ${sent.length} ครั้งใน session นี้`,
          ].join('\n'),
        }
      default:
        return { text: help() }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งเข้า LINE แทน ntfy: ใช้ LINE Messaging API push message (ต้องมี Channel Access Token)
 * 2. ปุ่มกดตอบจากนาฬิกา: ntfy รองรับ actions ส่ง HTTP กลับมาที่เครื่องได้
 * 3. แจ้งเตือนเมื่อ Mod 21 เจอ service ล่ม
 */
