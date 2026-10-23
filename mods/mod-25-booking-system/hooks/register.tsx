/**
 * ============================================================================
 * MOD 25: Booking System TH - ระบบจองห้อง โต๊ะ สนาม หรือคิว (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ระบบจองห้องประชุม, จองสนามแบด, จองคิวร้านตัดผม
 *
 * หน้าที่ของ Mod นี้:
 * 1. ลงทะเบียนสิ่งที่ให้จอง (ห้อง/โต๊ะ/สนาม/ช่าง) พร้อมราคาต่อชั่วโมง
 * 2. จองตามวันและช่วงเวลา กันจองซ้อนอัตโนมัติ คิดราคาให้
 * 3. ดูตารางรายวันแบบปฏิทินในแผง, ดูช่วงว่าง
 * 4. ยกเลิก / ปิดงาน, สรุปรายได้รายเดือน, ส่งออก CSV
 * 5. ข้อมูลเก็บในเครื่อง ($.store) ไม่ส่งไปที่ไหน
 */

import type { EngineInterface, Register } from 'claude-code'

interface Resource {
  name: string
  type: string
  pricePerHour: number
}
interface Booking {
  id: number
  resource: string
  date: string // YYYY-MM-DD
  start: number // นาทีนับจากเที่ยงคืน เช่น 9:30 = 570
  end: number
  customer: string
  note: string
  price: number
  status: 'confirmed' | 'completed' | 'cancelled'
  createdAt: number
}

const PANE = 'booking-system-th'
const OPEN = 8 * 60 // เวลาเปิดให้จอง 08:00
const CLOSE = 22 * 60 // ปิด 22:00
let resources: Resource[] = []
let bookings: Booking[] = []
let nextId = 1
let viewDate = ''

async function save($: EngineInterface): Promise<void> {
  await $.store.set('booking', { resources, bookings, nextId })
}

// ==========================================================================
// บทที่ 1: แปลงวันที่และเวลา
// ==========================================================================
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// รับ today, tomorrow, วันนี้, พรุ่งนี้, 2026-10-25, 25/10, 25/10/2026
function parseDate(text: string | undefined, now: number): string | undefined {
  const base = new Date(now)
  if (!text || text === 'today' || text === 'วันนี้') return ymd(base)
  if (text === 'tomorrow' || text === 'พรุ่งนี้') return ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1))
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (m) return ymd(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text)
  if (m) {
    let year = Number(m[3] ?? base.getFullYear())
    if (year > 2400) year -= 543 // ปี พ.ศ. -> ค.ศ.
    return ymd(new Date(year, Number(m[2]) - 1, Number(m[1])))
  }
  return undefined
}

function toMinutes(t: string): number | undefined {
  const m = /^([01]?\d|2[0-4])[:.]?([0-5]\d)?$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : undefined
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

const baht = (n: number) => `฿${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

// ==========================================================================
// บทที่ 2: หัวใจของระบบจอง - เช็คช่วงเวลาซ้อนกัน
// ==========================================================================
// สองช่วง [a1, a2) กับ [b1, b2) ซ้อนกันเมื่อ a1 < b2 และ b1 < a2
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

function activeOn(resource: string, date: string): Booking[] {
  return bookings.filter(b => b.resource === resource && b.date === date && b.status !== 'cancelled').sort((a, b) => a.start - b.start)
}

function freeSlots(resource: string, date: string): { start: number; end: number }[] {
  const slots: { start: number; end: number }[] = []
  let cursor = OPEN
  for (const b of activeOn(resource, date)) {
    if (b.start > cursor) slots.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < CLOSE) slots.push({ start: cursor, end: CLOSE })
  return slots
}

// ==========================================================================
// บทที่ 3: ตารางรายวันแบบข้อความ (ช่องละ 30 นาที)
// ==========================================================================
function dayGrid(date: string): string[] {
  const header = `${'เวลา'.padEnd(12)}${Array.from({ length: (CLOSE - OPEN) / 60 }, (_, i) => String((OPEN / 60 + i) % 100).padStart(2, '0')).join('')}`
  const rows = resources.map(r => {
    let row = ''
    for (let t = OPEN; t < CLOSE; t += 30) row += activeOn(r.name, date).some(b => overlaps(b, { start: t, end: t + 30 })) ? '█' : '·'
    return `${r.name.slice(0, 11).padEnd(12)}${row}`
  })
  return [header, ...rows]
}

function bookingLine(b: Booking): string {
  const icon = b.status === 'cancelled' ? '❌' : b.status === 'completed' ? '✅' : '📌'
  return `${icon} #${b.id} ${b.date} ${hhmm(b.start)}-${hhmm(b.end)} ${b.resource} · ${b.customer} · ${baht(b.price)}${b.note ? ` · ${b.note}` : ''}`
}

const HELP = `📅 Booking System TH (Mod 25)
========================================
ตั้งค่า:
  /book resource add <ชื่อ> [ประเภท] [ราคา/ชม.]   เช่น /book resource add ห้องA ห้องประชุม 300
  /book resource list | remove <ชื่อ>
จอง:
  /book add <ชื่อ> <วัน> <เริ่ม>-<จบ> <ลูกค้า> [หมายเหตุ]
     เช่น /book add ห้องA พรุ่งนี้ 13:00-15:00 คุณสมชาย ประชุมทีม
     วัน: วันนี้ | พรุ่งนี้ | 25/10 | 2026-10-25
  /book free <ชื่อ> [วัน]          ช่วงที่ว่าง
  /book cancel <id> | done <id>
ดู:
  /book day [วัน]                  ตารางรายวัน + เปิดแผง
  /book list [วัน]                 รายการจอง
  /book revenue [YYYY-MM]          สรุปรายได้รายเดือน
  /book export                     ส่งออก CSV
เวลาเปิดให้จอง ${hhmm(OPEN)}-${hhmm(CLOSE)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('booking')) as { resources?: Resource[]; bookings?: Booking[]; nextId?: number } | undefined
    resources = saved?.resources ?? []
    bookings = saved?.bookings ?? []
    nextId = saved?.nextId ?? 1
    viewDate = ymd(new Date(await $.clock.now()))
    await $.command.register({ name: 'book', description: 'ระบบจองห้อง โต๊ะ สนาม หรือคิว (/book help)', argumentHint: 'add|free|day|list|cancel|revenue' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงตารางรายวัน
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = bookings.filter(b => b.date === viewDate && b.status !== 'cancelled').sort((a, b) => a.start - b.start)
    return (
      <Box flexDirection="column">
        <Text bold>📅 {viewDate}</Text>
        {dayGrid(viewDate).map((line, i) => (
          <Text dimColor={i === 0} wrap="truncate-end">
            {line}
          </Text>
        ))}
        <Box flexDirection="column" marginTop={1}>
          {list.length === 0 && <Text dimColor>ยังไม่มีการจองวันนี้</Text>}
          {list.map(b => (
            <Text wrap="truncate-end">
              {hhmm(b.start)}-{hhmm(b.end)} {b.resource} · {b.customer}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /book
  // ==========================================================================
  on('command.run', { command: 'book' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    const redraw = () => $.ui.invalidate('ui.render')

    switch (sub) {
      case 'resource': {
        const [action, name, type, price] = rest
        if (action === 'add' && name) {
          if (resources.some(r => r.name === name)) return { text: `ℹ️ มี ${name} อยู่แล้ว` }
          resources.push({ name, type: type ?? 'ทั่วไป', pricePerHour: Number(price) || 0 })
          await save($)
          redraw()
          return { text: `➕ เพิ่ม ${name} (${type ?? 'ทั่วไป'}) ${baht(Number(price) || 0)}/ชม.` }
        }
        if (action === 'remove' && name) {
          if (bookings.some(b => b.resource === name && b.status === 'confirmed' && b.date >= ymd(new Date(now)))) return { text: `❌ ${name} ยังมีการจองที่ยังไม่ถึงวัน ยกเลิกก่อน` }
          resources = resources.filter(r => r.name !== name)
          await save($)
          redraw()
          return { text: `🗑️ ลบ ${name} แล้ว` }
        }
        return { text: resources.length ? ['🏷️ รายการที่ให้จอง', ...resources.map(r => `  ${r.name.padEnd(12)} ${r.type.padEnd(12)} ${baht(r.pricePerHour)}/ชม.`)].join('\n') : 'ยังไม่มี เพิ่มด้วย /book resource add ห้องA ห้องประชุม 300' }
      }
      case 'add': {
        const [name = '', dateText, range = '', customer, ...noteWords] = rest
        const resource = resources.find(r => r.name === name)
        if (!resource) return { text: `❌ ไม่พบ "${name}" (ดูรายการด้วย /book resource list)` }
        const date = parseDate(dateText, now)
        const [s, en] = range.split('-')
        const start = toMinutes(s ?? '')
        const end = toMinutes(en ?? '')
        if (!date || start === undefined || end === undefined || !customer) return { text: 'วิธีใช้: /book add ห้องA พรุ่งนี้ 13:00-15:00 คุณสมชาย [หมายเหตุ]' }
        if (end <= start) return { text: '❌ เวลาจบต้องหลังเวลาเริ่ม' }
        if (start < OPEN || end > CLOSE) return { text: `❌ จองได้ช่วง ${hhmm(OPEN)}-${hhmm(CLOSE)}` }
        if (new Date(`${date}T00:00`).getTime() + end * 60_000 <= now) return { text: '❌ ช่วงเวลานี้ผ่านไปแล้ว' }
        const clash = activeOn(name, date).find(b => overlaps(b, { start, end }))
        if (clash) {
          const free = freeSlots(name, date).map(f => `${hhmm(f.start)}-${hhmm(f.end)}`).join(', ')
          return { text: `❌ ชนกับการจอง #${clash.id} ${hhmm(clash.start)}-${hhmm(clash.end)} (${clash.customer})\nช่วงว่างวันนั้น: ${free || 'ไม่มี'}` }
        }
        const b: Booking = { id: nextId++, resource: name, date, start, end, customer, note: noteWords.join(' '), price: ((end - start) / 60) * resource.pricePerHour, status: 'confirmed', createdAt: now }
        bookings.push(b)
        await save($)
        viewDate = date
        redraw()
        return { text: `✅ จองแล้ว\n${bookingLine(b)}` }
      }
      case 'free': {
        const [name = '', dateText] = rest
        const date = parseDate(dateText, now)
        if (!resources.some(r => r.name === name) || !date) return { text: 'วิธีใช้: /book free ห้องA พรุ่งนี้' }
        const free = freeSlots(name, date)
        return { text: `🟢 ${name} วันที่ ${date} ว่าง: ${free.map(f => `${hhmm(f.start)}-${hhmm(f.end)}`).join(', ') || 'เต็มทั้งวัน'}` }
      }
      case 'cancel':
      case 'done': {
        const b = bookings.find(x => x.id === Number(rest[0]))
        if (!b) return { text: `❌ ไม่พบการจอง #${rest[0] ?? ''}` }
        if (b.status !== 'confirmed') return { text: `ℹ️ #${b.id} ${b.status === 'cancelled' ? 'ยกเลิกไปแล้ว' : 'ปิดงานไปแล้ว'}` }
        b.status = sub === 'cancel' ? 'cancelled' : 'completed'
        await save($)
        redraw()
        return { text: `${sub === 'cancel' ? '❌ ยกเลิก' : '✅ ปิดงาน'} ${bookingLine(b)}` }
      }
      case 'day': {
        const date = parseDate(rest[0], now)
        if (!date) return { text: 'วิธีใช้: /book day พรุ่งนี้' }
        viewDate = date
        await $.ui.open({ id: PANE, title: '📅 Booking' })
        redraw()
        return { text: resources.length ? [`📅 ${date}  (█ = จองแล้ว, ช่องละ 30 นาที)`, ...dayGrid(date)].join('\n') : 'ยังไม่มีรายการให้จอง' }
      }
      case 'list': {
        const date = rest[0] ? parseDate(rest[0], now) : undefined
        const list = bookings.filter(b => (date ? b.date === date : b.date >= ymd(new Date(now)) && b.status === 'confirmed')).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
        return { text: list.length ? [`📋 การจอง${date ? ` วันที่ ${date}` : 'ที่กำลังจะถึง'}`, ...list.map(bookingLine)].join('\n') : 'ไม่มีการจอง' }
      }
      case 'revenue': {
        const month = /^\d{4}-\d{2}$/.test(rest[0] ?? '') ? (rest[0] ?? '') : ymd(new Date(now)).slice(0, 7)
        const inMonth = bookings.filter(b => b.date.startsWith(month) && b.status !== 'cancelled')
        const byResource = new Map<string, number>()
        for (const b of inMonth) byResource.set(b.resource, (byResource.get(b.resource) ?? 0) + b.price)
        const done = inMonth.filter(b => b.status === 'completed').reduce((s, b) => s + b.price, 0)
        const total = inMonth.reduce((s, b) => s + b.price, 0)
        const cancelled = bookings.filter(b => b.date.startsWith(month) && b.status === 'cancelled').length
        return { text: [`💰 รายได้ ${month}`, `  รวม ${baht(total)} (${inMonth.length} การจอง) | ปิดงานแล้ว ${baht(done)} | ยกเลิก ${cancelled}`, ...[...byResource.entries()].sort((a, b) => b[1] - a[1]).map(([r, v]) => `  ${r.padEnd(12)} ${baht(v)}`)].join('\n') }
      }
      case 'export': {
        const root = (await $.session.cwd()).replace(/[\\/]$/, '')
        const path = `${root}${root.includes('\\') ? '\\' : '/'}bookings.csv`
        const q = (s: string) => `"${s.replace(/"/g, '""')}"`
        const csv = ['id,date,start,end,resource,customer,note,price,status', ...bookings.map(b => [b.id, b.date, hhmm(b.start), hhmm(b.end), q(b.resource), q(b.customer), q(b.note), b.price, b.status].join(','))].join('\n')
        await $.fs.write(path, '﻿' + csv + '\n') // BOM ให้ Excel อ่านภาษาไทยถูก
        return { text: `💾 บันทึก ${bookings.length} รายการ: ${path}` }
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
 * 1. ส่งยืนยันการจองเป็น LINE Flex Message (Mod 12) พร้อม QR มัดจำพร้อมเพย์ (Mod 14)
 * 2. เตือนก่อนถึงเวลาจอง 30 นาทีด้วย $.clock.every + $.ui.toast หรือ Mod 22
 * 3. จองแบบซ้ำทุกสัปดาห์ (ทุกวันจันทร์ 10:00-12:00)
 */
