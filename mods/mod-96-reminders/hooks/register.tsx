/**
 * ============================================================================
 * MOD 96: Reminders TH - ตั้งเตือนที่อยู่ข้าม session (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: brewmod-reminders ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. /remind <เวลา> <ข้อความ> เช่น
 *    /remind 30m ยกขาตั้งกล้อง · /remind 17:30 กลับบ้าน · /remind พรุ่งนี้ 09:00 เช็ค prod
 * 2. ถึงเวลาเด้ง toast และแถบเหนือช่องพิมพ์จนกว่าจะกดรับทราบ
 * 3. เก็บใน $.store จึงอยู่ข้าม session: ปิด Claude ไปแล้วเปิดใหม่ เตือนที่พลาดไปจะขึ้นมาบอก
 * 4. ขึ้นต้นข้อความด้วย @claude = ถึงเวลาแล้วส่งเป็นงานให้ Claude ทำเลย
 *    เช่น /remind 18:00 @claude สรุปงานวันนี้แล้ว commit
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Reminder {
  id: number
  at: number
  text: string
  fired: boolean
}

let list: Reminder[] = []
let ringing: Reminder[] = []
let ticker: Timer | undefined

// ==========================================================================
// บทที่ 1: อ่านเวลาแบบคนพูด
// ==========================================================================
function parseWhen(tokens: string[], now: number): { at: number; used: number } | undefined {
  const [a = '', b = ''] = tokens
  const rel = /^(\d+(?:\.\d+)?)\s*(m|min|นาที|h|hr|ชม\.?|ชั่วโมง|d|วัน)$/i.exec(a)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]!.toLowerCase()
    const ms = /^(m|min|นาที)$/.test(unit) ? 60_000 : /^(d|วัน)$/.test(unit) ? 86_400_000 : 3_600_000
    return { at: now + n * ms, used: 1 }
  }
  const clock = (text: string): [number, number] | undefined => {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(text)
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? [Number(m[1]), Number(m[2])] : undefined
  }
  const at = (base: Date, hm: [number, number]): number => new Date(base.getFullYear(), base.getMonth(), base.getDate(), hm[0], hm[1]).getTime()
  if (/^(พรุ่งนี้|tomorrow)$/i.test(a)) {
    const hm = clock(b) ?? [9, 0]
    const d = new Date(now + 86_400_000)
    return { at: at(d, hm), used: clock(b) ? 2 : 1 }
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a)
  if (date) {
    const hm = clock(b) ?? [9, 0]
    return { at: at(new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])), hm), used: clock(b) ? 2 : 1 }
  }
  const hm = clock(a)
  if (hm) {
    const today = at(new Date(now), hm)
    return { at: today > now ? today : today + 86_400_000, used: 1 }
  }
  return undefined
}

function when(at: number, now: number): string {
  const d = new Date(at)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.floor((new Date(d.toDateString()).getTime() - new Date(new Date(now).toDateString()).getTime()) / 86_400_000)
  return days === 0 ? `วันนี้ ${hhmm}` : days === 1 ? `พรุ่งนี้ ${hhmm}` : `${d.getDate()}/${d.getMonth() + 1} ${hhmm}`
}

// ==========================================================================
// บทที่ 2: ตรวจทุก 20 วินาทีว่ามีอันไหนถึงเวลา
// ==========================================================================
async function save($: EngineInterface): Promise<void> {
  await $.store.set('list', list)
}

async function check($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  // อ่านจาก store ทุกครั้ง: หน้าต่างอื่นอาจเพิ่ม/ยิงไปแล้ว
  list = ((await $.store.get('list')) as Reminder[] | undefined) ?? list
  const due = list.filter(r => !r.fired && r.at <= now)
  if (due.length === 0) return
  list = list.map(r => (due.includes(r) ? { ...r, fired: true } : r))
  await save($)
  for (const r of due) {
    const late = now - r.at > 5 * 60_000
    const forClaude = /^@claude\s+/i.exec(r.text)
    if (forClaude) {
      $.ui.toast(`⏰ ถึงเวลา: ส่งงานให้ Claude - ${r.text.slice(forClaude[0].length)}`, { timeoutMs: 10_000 })
      void $.prompt.submit({ text: r.text.slice(forClaude[0].length), asUser: true })
    } else {
      $.ui.toast(`⏰ ${late ? '(พลาดไป) ' : ''}${r.text}`, { timeoutMs: 30_000 })
      ringing = [...ringing, r]
    }
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    list = ((await $.store.get('list')) as Reminder[] | undefined) ?? []
    ringing = []
    await $.command.register({ name: 'remind', description: 'ตั้งเตือน: /remind 30m พักสายตา, /remind พรุ่งนี้ 09:00 เช็ค prod (/remind help)', argumentHint: '<เวลา> <ข้อความ> | list | ok | del <id>' })
    ticker?.cancel()
    ticker = $.clock.every(20_000, () => void check($))
    await check($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แถบเตือนค้างจนกว่าจะรับทราบ
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (ringing.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {ringing.map(r => (
          <Text color="#ffb74d">{`⏰ ${r.text}`}</Text>
        ))}
        <Text dimColor>{'   /remind ok รับทราบ · /remind snooze 10m เลื่อน'}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'remind' }, async ($, e) => {
    const tokens = e.args.trim().split(/\s+/).filter(Boolean)
    const [sub = ''] = tokens
    const now = await $.clock.now()
    switch (sub) {
      case '':
      case 'list': {
        const upcoming = list.filter(r => !r.fired).sort((a, b) => a.at - b.at)
        if (upcoming.length === 0) return { text: '⏰ ไม่มีเตือนที่รออยู่ ตั้งด้วย /remind 30m พักสายตา' }
        return { text: ['⏰ เตือนที่รออยู่', ...upcoming.map(r => `#${r.id}  ${when(r.at, now)}  ${r.text}`)].join('\n') }
      }
      case 'ok':
        ringing = []
        $.ui.invalidate('ui.render')
        return { text: '👍 รับทราบแล้ว' }
      case 'snooze': {
        const w = parseWhen(tokens.slice(1), now) ?? { at: now + 10 * 60_000, used: 0 }
        const id = Math.max(0, ...list.map(r => r.id)) + 1
        list = [...list, ...ringing.map((r, i) => ({ ...r, id: id + i, at: w.at, fired: false }))]
        ringing = []
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `😴 เลื่อนไป ${when(w.at, now)}` }
      }
      case 'del': {
        const id = Number(tokens[1])
        const gone = list.find(r => r.id === id)
        if (!gone) return { text: 'วิธีใช้: /remind del <id> (ดู id จาก /remind list)' }
        list = list.filter(r => r.id !== id)
        await save($)
        return { text: `🗑 ลบเตือน #${id}: ${gone.text}` }
      }
      case 'help':
        return { text: '⏰ Reminders TH (Mod 96)\n/remind <เวลา> <ข้อความ>   ตั้งเตือน\n  เวลา: 30m, 2h, 1d, 17:30, พรุ่งนี้ 09:00, 2026-11-01 14:00\n  ข้อความขึ้นต้น @claude = ส่งเป็นงานให้ Claude ตอนถึงเวลา\n/remind list               เตือนที่รออยู่\n/remind ok                 รับทราบ\n/remind snooze 10m         เลื่อน\n/remind del <id>           ลบ' }
      default: {
        const w = parseWhen(tokens, now)
        const text = tokens.slice(w?.used ?? 0).join(' ')
        if (!w || !text) return { text: 'วิธีใช้: /remind 30m พักสายตา · /remind 17:30 กลับบ้าน · /remind พรุ่งนี้ 09:00 @claude เช็ค log ของ prod' }
        const r: Reminder = { id: Math.max(0, ...list.map(x => x.id)) + 1, at: w.at, text, fired: false }
        list = [...list.filter(x => !x.fired || now - x.at < 7 * 86_400_000), r]
        await save($)
        return { text: `⏰ ตั้งเตือน #${r.id} ${when(r.at, now)}: ${text}` }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เตือนซ้ำทุกวัน: /remind ทุกวัน 10:00 standup
 * 2. ส่งเตือนไปมือถือด้วย (ต่อกับ Mod 22)
 * 3. ให้ Claude ตั้งเตือนเองได้ด้วย $.tool.register (เช่น "เตือนฉันพรุ่งนี้ให้ลบ feature flag")
 */
