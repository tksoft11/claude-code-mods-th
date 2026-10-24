/**
 * ============================================================================
 * MOD 27: Trip Planner TH - ผู้ช่วยวางแผนเที่ยว (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Google Travel, TripIt
 *
 * หน้าที่ของ Mod นี้:
 * 1. /trip plan ให้ Claude วางแผนทริปรายวัน งบประมาณ ของที่ต้องเตรียม แล้วบันทึกเป็นไฟล์ .md
 * 2. /trip search ทำลิงก์ค้นตั๋วเครื่องบิน รถทัวร์ รถไฟ และที่พัก ไปยังเว็บจองจริง
 * 3. กระเป๋าตั๋ว: เก็บตั๋วที่จองแล้ว (เลขที่จอง ที่นั่ง) พร้อมนับถอยหลัง และเตือนเมื่อใกล้เดินทาง
 *
 * หมายเหตุ: Mod จองตั๋วหรือรับเงินเองไม่ได้ (ไม่มี API สาธารณะของสายการบิน/บขส./รฟท.)
 * จึงพาไปหน้าค้นหาของเว็บจองจริงแทน ราคาและที่นั่งให้ดูจากเว็บนั้น
 */

import type { EngineInterface, Register } from 'claude-code'

type Mode = 'flight' | 'bus' | 'train' | 'van' | 'boat' | 'other'
interface Ticket {
  id: number
  mode: Mode
  from: string
  to: string
  at: number // เวลาออกเดินทาง (ms)
  ref: string // เลขที่จอง / ที่นั่ง / หมายเหตุ
}

const ICON: Record<Mode, string> = { flight: '✈️', bus: '🚌', train: '🚆', van: '🚐', boat: '⛴️', other: '🎫' }
const MODE_ALIAS: Record<string, Mode> = { flight: 'flight', บิน: 'flight', เครื่องบิน: 'flight', bus: 'bus', รถทัวร์: 'bus', train: 'train', รถไฟ: 'train', van: 'van', รถตู้: 'van', boat: 'boat', เรือ: 'boat' }
let tickets: Ticket[] = []
let nextId = 1
let projectRoot = ''

async function save($: EngineInterface): Promise<void> {
  await $.store.set('trip', { tickets, nextId })
}

// ==========================================================================
// บทที่ 1: แปลงวันที่และเวลา (รับ พ.ศ., วันนี้/พรุ่งนี้)
// ==========================================================================
function parseDate(text: string | undefined, now: number): Date | undefined {
  const base = new Date(now)
  if (!text) return undefined
  if (text === 'วันนี้' || text === 'today') return new Date(base.getFullYear(), base.getMonth(), base.getDate())
  if (text === 'พรุ่งนี้' || text === 'tomorrow') return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text)
  if (!m) return undefined
  let year = Number(m[3] ?? base.getFullYear())
  if (year > 2400) year -= 543
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]))
  // ไม่ใส่ปีและวันนั้นผ่านไปแล้ว = ปีหน้า
  if (!m[3] && d.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) d.setFullYear(d.getFullYear() + 1)
  return d
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function countdown(ms: number): string {
  if (ms < 0) return 'ออกเดินทางไปแล้ว'
  const h = Math.floor(ms / 3_600_000)
  return h < 24 ? `อีก ${h} ชม. ${Math.floor((ms % 3_600_000) / 60_000)} นาที` : `อีก ${Math.floor(h / 24)} วัน ${h % 24} ชม.`
}

// ==========================================================================
// บทที่ 2: ลิงก์ค้นหาไปเว็บจองจริง (ใส่ต้นทาง ปลายทาง วันที่ให้แล้ว)
// ==========================================================================
function searchLinks(from: string, to: string, date: string, mode: string): string[] {
  const q = (s: string) => encodeURIComponent(s)
  const links: string[] = []
  if (mode === 'all' || mode === 'flight') links.push(`✈️ เครื่องบิน (Google Flights): https://www.google.com/travel/flights?q=${q(`Flights from ${from} to ${to} on ${date}`)}`)
  if (mode === 'all' || mode === 'bus' || mode === 'van') {
    links.push(`🚌 รถทัวร์/รถตู้ (12Go): https://12go.asia/th`)
    links.push(`🚌 ค้นรอบรถ: https://www.google.com/search?q=${q(`รถทัวร์ ${from} ไป ${to} ${date}`)}`)
  }
  if (mode === 'all' || mode === 'train') links.push(`🚆 รถไฟ (D-Ticket การรถไฟฯ): https://dticket.railway.co.th`)
  if (mode === 'all' || mode === 'hotel') links.push(`🏨 ที่พัก (Google Hotels): https://www.google.com/travel/hotels?q=${q(`hotels in ${to}`)}`)
  return links
}

// ==========================================================================
// บทที่ 3: ให้ Claude วางแผนทริป (haiku ก่อน ใช้ไม่ได้ค่อยใช้ model ของ session)
// ==========================================================================
async function planTrip($: EngineInterface, dest: string, days: number, extra: string): Promise<string> {
  const system = 'You are a careful Thai travel planner. Write in Thai, in Markdown. Give a day-by-day plan, a rough budget table in baht, transport between places, a packing list, and local tips. Use real, well-known places only; where opening hours or prices may change, say to check before going. Keep it practical.'
  const prompt = `ปลายทาง: ${dest}\nจำนวนวัน: ${days}\nเพิ่มเติม: ${extra || 'ไม่มี'}`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens: 3000, timeoutMs: 120_000 }).catch(() => undefined)
    if (r?.isAnswered) return r.text.trim()
  }
  throw new Error('เรียก model ไม่สำเร็จ')
}

function ticketLine(t: Ticket, now: number): string {
  const d = new Date(t.at)
  return `${ICON[t.mode]} #${t.id} ${t.from} → ${t.to}  ${d.toLocaleDateString('th-TH')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}  (${countdown(t.at - now)})${t.ref ? `\n     ${t.ref}` : ''}`
}

const HELP = `🧳 Trip Planner TH (Mod 27)
========================================
/trip plan <ปลายทาง> <จำนวนวัน> [งบ/สไตล์...]   ให้ Claude วางแผน แล้วบันทึกเป็น trip-<ปลายทาง>.md
   เช่น /trip plan เชียงใหม่ 3 งบ 8000 ชอบคาเฟ่
/trip search <ต้นทาง> <ปลายทาง> <วันที่> [flight|bus|train|hotel|all]
   เช่น /trip search กรุงเทพ ภูเก็ต 15/12 flight
/trip add <ประเภท> <ต้นทาง>-<ปลายทาง> <วันที่> <เวลา> [เลขที่จอง/ที่นั่ง...]
   ประเภท: flight bus train van boat (หรือ บิน รถทัวร์ รถไฟ รถตู้ เรือ)
   เช่น /trip add บิน DMK-CNX 15/12 08:30 FD3433 PNR ABC123 ที่นั่ง 12A
/trip tickets | remove <id>
วันที่: วันนี้ | พรุ่งนี้ | 15/12 | 15/12/2569 | 2026-12-15`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd.replace(/[\\/]$/, '')
    const saved = (await $.store.get('trip')) as { tickets?: Ticket[]; nextId?: number } | undefined
    tickets = saved?.tickets ?? []
    nextId = saved?.nextId ?? 1
    // เตือนตั๋วที่จะออกเดินทางภายใน 24 ชม.
    const now = await $.clock.now()
    const soon = tickets.filter(t => t.at > now && t.at - now < 24 * 3_600_000)
    for (const t of soon) $.ui.toast(`🧳 ใกล้เดินทางแล้ว: ${t.from} → ${t.to} ${countdown(t.at - now)}`)
    await $.command.register({ name: 'trip', description: 'วางแผนเที่ยว ค้นตั๋ว และเก็บตั๋วที่จองแล้ว (/trip help)', argumentHint: 'plan|search|add|tickets' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /trip
  // ==========================================================================
  on('command.run', { command: 'trip' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()

    try {
      switch (sub) {
        case 'plan': {
          const [dest, daysText, ...extra] = rest
          const days = Number(daysText)
          if (!dest || !Number.isInteger(days) || days < 1 || days > 14) return { text: 'วิธีใช้: /trip plan เชียงใหม่ 3 งบ 8000 ชอบคาเฟ่ (1-14 วัน)' }
          const plan = await planTrip($, dest, days, extra.join(' '))
          const path = `${projectRoot}${projectRoot.includes('\\') ? '\\' : '/'}trip-${dest.replace(/[\\/:*?"<>|\s]/g, '_')}.md`
          await $.fs.write(path, `${plan}\n`)
          return { text: `${plan.slice(0, 2500)}${plan.length > 2500 ? '\n...' : ''}\n\n💾 บันทึกแผนเต็มไว้ที่ ${path}` }
        }
        case 'search': {
          const [from, to, dateText, mode = 'all'] = rest
          const date = parseDate(dateText, now)
          if (!from || !to || !date) return { text: 'วิธีใช้: /trip search กรุงเทพ ภูเก็ต 15/12 [flight|bus|train|hotel|all]' }
          return { text: [`🔎 ${from} → ${to}  ${date.toLocaleDateString('th-TH', { dateStyle: 'full' })}`, ...searchLinks(from, to, isoDate(date), mode), '', 'จองแล้วเก็บตั๋วไว้ด้วย /trip add ...'].join('\n') }
        }
        case 'add': {
          const [modeText = '', route = '', dateText, timeText = '', ...refWords] = rest
          const mode = MODE_ALIAS[modeText.toLowerCase()] ?? 'other'
          const [from, to] = route.split('-')
          const date = parseDate(dateText, now)
          const time = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(timeText)
          if (!from || !to || !date || !time) return { text: 'วิธีใช้: /trip add บิน DMK-CNX 15/12 08:30 FD3433 ที่นั่ง 12A' }
          date.setHours(Number(time[1]), Number(time[2]))
          const t: Ticket = { id: nextId++, mode, from, to, at: date.getTime(), ref: refWords.join(' ') }
          tickets.push(t)
          tickets.sort((a, b) => a.at - b.at)
          await save($)
          return { text: `✅ เก็บตั๋วแล้ว\n${ticketLine(t, now)}` }
        }
        case 'tickets': {
          const upcoming = tickets.filter(t => t.at > now - 24 * 3_600_000)
          return { text: upcoming.length ? ['🎫 ตั๋วของฉัน', ...upcoming.map(t => ticketLine(t, now))].join('\n') : 'ยังไม่มีตั๋ว เก็บด้วย /trip add ...' }
        }
        case 'remove': {
          const before = tickets.length
          tickets = tickets.filter(t => t.id !== Number(rest[0]))
          await save($)
          return { text: before === tickets.length ? `❌ ไม่พบตั๋ว #${rest[0] ?? ''}` : `🗑️ ลบตั๋ว #${rest[0]} แล้ว` }
        }
        default:
          return { text: HELP }
      }
    } catch (err) {
      return { text: `❌ ${sub} ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ใส่พยากรณ์อากาศของปลายทางในวันเดินทาง (ใช้ Open-Meteo แบบ Mod 29)
 * 2. แจ้งเตือนไปมือถือก่อนออกเดินทาง 3 ชม. (ต่อกับ Mod 22)
 * 3. ให้ Claude อ่านอีเมลยืนยันการจอง (copy มาวาง) แล้วเติมข้อมูลตั๋วให้เอง
 */
