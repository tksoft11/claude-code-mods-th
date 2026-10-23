/**
 * ============================================================================
 * MOD 16: Stripe Dashboard TH - ดูยอดขายจาก Stripe ใน Claude Code (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Stripe Dashboard (https://dashboard.stripe.com)
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดึงยอดขายจริงจาก Stripe API (30 วันย้อนหลัง) แล้วสรุปวันนี้ / เมื่อวาน / สัปดาห์ / เดือน
 * 2. ค่าธรรมเนียมและยอดสุทธิจริงจาก balance transaction (ไม่ได้เดาสูตรเอง)
 * 3. MRR / ARR คำนวณจาก subscription ที่ active จริง
 * 4. กราฟรายวัน, ลูกค้าที่จ่ายมากสุด, ยอดแยกตามสินค้า, ส่งออก CSV
 * 5. Dashboard ในแผงด้านข้าง
 * 6. ยังไม่มี key ก็ลองได้ด้วย /stripe demo (ข้อมูลตัวอย่าง มีป้ายบอกทุกจุด)
 *
 * ความปลอดภัยของ key:
 * - อ่านจากตัวแปร environment STRIPE_SECRET_KEY เท่านั้น ไม่รับ key ผ่านคำสั่ง
 *   (พิมพ์ key ลงช่อง prompt = key ไปอยู่ใน transcript)
 * - แนะนำใช้ Restricted key (rk_...) ที่ให้สิทธิ์อ่านอย่างเดียว
 * - Mod นี้อ่านข้อมูลอย่างเดียว ไม่สร้างหรือแก้อะไรใน Stripe
 */

import type { EngineInterface, Register } from 'claude-code'

interface Txn {
  id: string
  amount: number // หน่วยหลัก เช่น บาท (Stripe ส่งมาเป็นสตางค์ ต้องหาร 100)
  refunded: number
  fee?: number
  net?: number
  currency: string
  created: number // ms
  description: string
  email: string
}

interface Data {
  source: 'live' | 'test' | 'demo'
  txns: Txn[]
  mrr: Record<string, number> // MRR แยกตามสกุลเงิน
  fetchedAt: number
}

const PANE = 'stripe-dashboard-th'
const STRIPE_PURPLE = '#635bff'
const DAY = 24 * 60 * 60 * 1000

// สกุลเงินที่ไม่มีทศนิยม (Stripe ส่งมาเป็นหน่วยเต็มอยู่แล้ว)
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'])
const toMajor = (amount: number, currency: string) => (ZERO_DECIMAL.has(currency) ? amount : amount / 100)

let data: Data | undefined
let isDemo = false

// ==========================================================================
// บทที่ 1: เรียก Stripe API ด้วย $.http.fetch (มี pagination)
// ==========================================================================
async function stripeGet($: EngineInterface, key: string, path: string): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } })
  const body = JSON.parse(res.text) as Record<string, unknown>
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body
}

// list API ของ Stripe ส่งทีละ 100 รายการ ต้องขอหน้าถัดไปด้วย starting_after
async function listAll($: EngineInterface, key: string, path: string, maxPages = 10): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = []
  let after = ''
  for (let page = 0; page < maxPages; page++) {
    const glue = path.includes('?') ? '&' : '?'
    const body = await stripeGet($, key, `${path}${glue}limit=100${after ? `&starting_after=${after}` : ''}`)
    const list = (body.data as Record<string, unknown>[] | undefined) ?? []
    items.push(...list)
    if (!body.has_more || list.length === 0) break
    after = String(list[list.length - 1]?.id ?? '')
  }
  return items
}

// ==========================================================================
// บทที่ 2: แปลงข้อมูลดิบของ Stripe เป็นรายการขาย + คำนวณ MRR
// ==========================================================================
function toTxn(c: Record<string, unknown>): Txn {
  const currency = String(c.currency ?? 'thb')
  const bt = c.balance_transaction as { fee?: number; net?: number; currency?: string } | string | null
  const billing = c.billing_details as { email?: string | null } | undefined
  const sameCurrency = typeof bt === 'object' && bt !== null && bt.currency === currency
  return {
    id: String(c.id),
    amount: toMajor(Number(c.amount ?? 0), currency),
    refunded: toMajor(Number(c.amount_refunded ?? 0), currency),
    // fee/net อยู่ในสกุลเงินที่เข้าบัญชี ถ้าไม่ตรงกับสกุลที่ขาย ไม่แสดง (กันบวกผิดสกุล)
    fee: sameCurrency ? toMajor(Number(bt.fee ?? 0), currency) : undefined,
    net: sameCurrency ? toMajor(Number(bt.net ?? 0), currency) : undefined,
    currency,
    created: Number(c.created ?? 0) * 1000,
    description: String(c.description ?? 'ไม่ระบุสินค้า'),
    email: String(billing?.email ?? c.receipt_email ?? 'ไม่ระบุลูกค้า'),
  }
}

// MRR = รายได้ต่อเดือนจาก subscription: ปรับทุกรอบบิลให้เป็นต่อเดือน
function monthlyAmount(item: { quantity?: number; price?: { unit_amount?: number | null; currency?: string; recurring?: { interval?: string; interval_count?: number } | null } }): [string, number] {
  const price = item.price
  const currency = price?.currency ?? 'thb'
  const amount = toMajor((price?.unit_amount ?? 0) * (item.quantity ?? 1), currency)
  const count = price?.recurring?.interval_count ?? 1
  const perMonth = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 }[price?.recurring?.interval ?? 'month'] ?? 1
  return [currency, (amount * perMonth) / count]
}

async function fetchLive($: EngineInterface, key: string): Promise<Data> {
  const since = Math.floor(((await $.clock.now()) - 31 * DAY) / 1000)
  const charges = await listAll($, key, `charges?created%5Bgte%5D=${since}&expand%5B%5D=data.balance_transaction`)
  const txns = charges.filter(c => c.status === 'succeeded' && c.paid === true).map(toTxn)

  const mrr: Record<string, number> = {}
  const subs = await listAll($, key, 'subscriptions?status=active', 5)
  for (const sub of subs) {
    const items = ((sub.items as { data?: unknown[] } | undefined)?.data ?? []) as Parameters<typeof monthlyAmount>[0][]
    for (const item of items) {
      const [currency, value] = monthlyAmount(item)
      mrr[currency] = (mrr[currency] ?? 0) + value
    }
  }
  return { source: key.includes('_test_') ? 'test' : 'live', txns, mrr, fetchedAt: await $.clock.now() }
}

// ==========================================================================
// บทที่ 3: ข้อมูลตัวอย่าง (สุ่มแบบกำหนด seed ได้ผลเดิมทุกครั้ง) - ใช้ลองเมื่อยังไม่มี key
// ==========================================================================
function demoData(now: number): Data {
  let seed = 42
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const products = [
    { name: 'คอร์สเรียน Claude Code', price: 1290 },
    { name: 'เสื้อยืดลายไทย', price: 390 },
    { name: 'Mod พิเศษ', price: 590 },
  ]
  const txns: Txn[] = []
  for (let d = 29; d >= 0; d--) {
    const day = new Date(now - d * DAY)
    const isWeekend = day.getDay() === 0 || day.getDay() === 6
    const count = Math.floor((isWeekend ? 5 : 2) + rand() * 4)
    for (let i = 0; i < count; i++) {
      const p = products[Math.floor(rand() * products.length)] ?? products[0]!
      const fee = Math.round(p.price * 0.0365 + 10) // ตัวเลขตัวอย่าง ไม่ใช่อัตราจริงของ Stripe
      txns.push({
        id: `demo_${d}_${i}`,
        amount: p.price,
        refunded: 0,
        fee,
        net: p.price - fee,
        currency: 'thb',
        created: day.getTime() - Math.floor(rand() * 8) * 60 * 60 * 1000,
        description: p.name,
        email: `customer${Math.floor(rand() * 15) + 1}@example.com`,
      })
    }
  }
  return { source: 'demo', txns, mrr: { thb: 18_900 }, fetchedAt: now }
}

// ==========================================================================
// บทที่ 4: โหลดข้อมูล (cache 5 นาที) + ป้ายบอกแหล่งข้อมูล
// ==========================================================================
const SOURCE_LABEL = { live: '🟢 Stripe (live)', test: '🧪 Stripe (test mode)', demo: '📝 ข้อมูลตัวอย่าง - ไม่ใช่ยอดจริง' }

async function load($: EngineInterface, force = false): Promise<Data> {
  const now = await $.clock.now()
  if (isDemo) return (data = data?.source === 'demo' ? data : demoData(now))
  if (data && data.source !== 'demo' && !force && now - data.fetchedAt < 5 * 60 * 1000) return data

  const key = await $.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error('NO_KEY')
  return (data = await fetchLive($, key))
}

const NO_KEY_HELP = `🔑 ยังไม่ได้ตั้ง STRIPE_SECRET_KEY
1. ไปที่ https://dashboard.stripe.com/apikeys สร้าง Restricted key แบบอ่านอย่างเดียว
   (ให้สิทธิ์ Read ที่ Charges, Balance transactions และ Subscriptions)
2. ตั้งตัวแปรก่อนเปิด claude แล้วเปิดใหม่:
   PowerShell:  $env:STRIPE_SECRET_KEY = "rk_live_..."
   macOS/Linux: export STRIPE_SECRET_KEY=rk_live_...
⚠️ อย่าพิมพ์ key ลงในช่องแชต (จะถูกบันทึกใน transcript)

ยังไม่มี key? ลอง /stripe demo ดูหน้าตาด้วยข้อมูลตัวอย่างก่อน`

// ==========================================================================
// บทที่ 5: คำนวณสถิติ (แยกตามสกุลเงิน เลือกสกุลหลักมาแสดง)
// ==========================================================================
function mainCurrency(d: Data): string {
  const count = new Map<string, number>()
  for (const t of d.txns) count.set(t.currency, (count.get(t.currency) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'thb'
}

function money(n: number, currency: string): string {
  const symbol = currency === 'thb' ? '฿' : currency === 'usd' ? '$' : `${currency.toUpperCase()} `
  return `${symbol}${n.toLocaleString('en-US', { maximumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2 })}`
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

type Range = { total: number; count: number; refunded: number; fee: number; net: number }

function sumRange(d: Data, currency: string, from: number, to: number): Range {
  const list = d.txns.filter(t => t.currency === currency && t.created >= from && t.created < to)
  return {
    total: list.reduce((s, t) => s + t.amount - t.refunded, 0),
    count: list.length,
    refunded: list.reduce((s, t) => s + t.refunded, 0),
    fee: list.reduce((s, t) => s + (t.fee ?? 0), 0),
    net: list.reduce((s, t) => s + (t.net ?? 0), 0),
  }
}

function growth(now: number, before: number): string {
  if (before === 0) return now > 0 ? '🆕 (ช่วงก่อนไม่มียอด)' : '-'
  const pct = ((now - before) / before) * 100
  return `${pct >= 0 ? '📈 +' : '📉 '}${pct.toFixed(1)}%`
}

function dailyBars(d: Data, currency: string, days: number, now: number): { label: string; total: number; count: number }[] {
  const today = startOfDay(now)
  return Array.from({ length: days }, (_, i) => {
    const from = today - (days - 1 - i) * DAY
    const r = sumRange(d, currency, from, from + DAY)
    const date = new Date(from)
    return { label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`, total: r.total, count: r.count }
  })
}

function chartText(d: Data, currency: string, days: number, now: number): string {
  const bars = dailyBars(d, currency, days, now)
  const max = Math.max(1, ...bars.map(b => b.total))
  return bars.map(b => `${b.label} ${'█'.repeat(Math.round((b.total / max) * 20)).padEnd(20, '░')} ${money(b.total, currency)} (${b.count})`).join('\n')
}

function summary(d: Data, now: number): string {
  const c = mainCurrency(d)
  const today = startOfDay(now)
  const t = sumRange(d, c, today, today + DAY)
  const y = sumRange(d, c, today - DAY, today)
  const week = sumRange(d, c, today - 6 * DAY, today + DAY)
  const lastWeek = sumRange(d, c, today - 13 * DAY, today - 6 * DAY)
  const month = sumRange(d, c, today - 29 * DAY, today + DAY)
  const mrr = d.mrr[c] ?? 0
  const others = new Set(d.txns.map(x => x.currency)).size - 1
  return [
    `💰 Stripe Dashboard  ${SOURCE_LABEL[d.source]}`,
    '----------------------------------------',
    `วันนี้       ${money(t.total, c)} (${t.count} รายการ) ${growth(t.total, y.total)} จากเมื่อวาน`,
    `เมื่อวาน     ${money(y.total, c)} (${y.count} รายการ)`,
    `7 วัน        ${money(week.total, c)} ${growth(week.total, lastWeek.total)} จาก 7 วันก่อนหน้า`,
    `30 วัน       ${money(month.total, c)} (${month.count} รายการ) เฉลี่ย ${money(month.total / 30, c)}/วัน`,
    `ค่าธรรมเนียม 30 วัน ${money(month.fee, c)} | สุทธิ ${money(month.net, c)}${month.refunded ? ` | คืนเงิน ${money(month.refunded, c)}` : ''}`,
    `MRR ${money(mrr, c)} | ARR ${money(mrr * 12, c)}${mrr === 0 ? ' (ไม่มี subscription ที่ active)' : ''}`,
    others > 0 ? `ℹ️ มีอีก ${others} สกุลเงิน ไม่ได้รวมในยอดนี้` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isDemo = (await $.store.get('demo')) === true
    data = undefined
    await $.command.register({ name: 'stripe', description: 'ดูยอดขายจาก Stripe (/stripe help)', argumentHint: 'today|week|month|7days|transactions|top|demo' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 6: Dashboard ในแผง - การ์ดยอด + กราฟ 7 วัน + รายการล่าสุด
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!data) return <Text dimColor>พิมพ์ /stripe เพื่อโหลดข้อมูล</Text>

    const d = data
    const now = await $.clock.now()
    const c = mainCurrency(d)
    const today = startOfDay(now)
    const cards = [
      ['วันนี้', sumRange(d, c, today, today + DAY).total],
      ['7 วัน', sumRange(d, c, today - 6 * DAY, today + DAY).total],
      ['30 วัน', sumRange(d, c, today - 29 * DAY, today + DAY).total],
      ['MRR', d.mrr[c] ?? 0],
    ] as const
    const bars = dailyBars(d, c, 7, now)
    const max = Math.max(1, ...bars.map(b => b.total))

    return (
      <Box flexDirection="column" gap={1}>
        <Box backgroundColor={STRIPE_PURPLE} paddingX={1}>
          <Text color="#ffffff" bold>
            💰 Stripe {d.source === 'demo' ? '· ข้อมูลตัวอย่าง' : d.source === 'test' ? '· test mode' : ''}
          </Text>
        </Box>
        <Box gap={2} flexWrap="wrap">
          {cards.map(([label, value]) => (
            <Box flexDirection="column" borderStyle="round" borderColor={STRIPE_PURPLE} paddingX={1}>
              <Text dimColor>{label}</Text>
              <Text bold>{money(value, c)}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          {bars.map(b => (
            <Text>
              {b.label} <Text color={STRIPE_PURPLE}>{'█'.repeat(Math.round((b.total / max) * 16)).padEnd(16, '░')}</Text> {money(b.total, c)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>รายการล่าสุด</Text>
          {[...d.txns].sort((a, b) => b.created - a.created).slice(0, 5).map(t => (
            <Text wrap="truncate-end">
              {money(t.amount, t.currency)} · {t.description}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 7: คำสั่ง /stripe
  // ==========================================================================
  on('command.run', { command: 'stripe' }, async ($, e) => {
    const [sub = 'dashboard', arg] = e.args.trim().split(/\s+/).filter(Boolean)

    if (sub === 'demo') {
      isDemo = arg !== 'off'
      data = undefined
      await $.store.set('demo', isDemo)
      if (!isDemo) return { text: '🟢 ปิดโหมดข้อมูลตัวอย่างแล้ว ใช้ข้อมูลจริงจาก STRIPE_SECRET_KEY' }
    }
    if (sub === 'help') {
      return {
        text: `💰 Stripe Dashboard TH (Mod 16)
========================================
/stripe                  สรุป + เปิด dashboard ในแผง
/stripe today | yesterday | week | month
/stripe 7days | 30days   กราฟรายวัน
/stripe transactions [n] รายการล่าสุด
/stripe top              ลูกค้าที่จ่ายมากสุด
/stripe products         ยอดแยกตามสินค้า (จาก description)
/stripe refresh          ดึงข้อมูลใหม่
/stripe status           ดูว่าใช้ key แบบไหนอยู่
/stripe export           ส่งออก CSV
/stripe demo [off]       เปิด/ปิดโหมดข้อมูลตัวอย่าง`,
      }
    }
    if (sub === 'status') {
      const key = await $.env.get('STRIPE_SECRET_KEY')
      const mode = isDemo ? 'โหมดข้อมูลตัวอย่าง' : key ? `${key.startsWith('rk_') ? 'Restricted key' : 'Secret key'} ${key.includes('_test_') ? '(test)' : '(live)'} ลงท้าย …${key.slice(-4)}` : 'ยังไม่ได้ตั้ง STRIPE_SECRET_KEY'
      const warn = key?.startsWith('sk_') ? '\n💡 แนะนำเปลี่ยนเป็น Restricted key (rk_) แบบอ่านอย่างเดียว' : ''
      return { text: `🔑 ${mode}${data ? `\nโหลดล่าสุด ${new Date(data.fetchedAt).toLocaleTimeString('th-TH')} (${data.txns.length} รายการ)` : ''}${warn}` }
    }

    let d: Data
    try {
      d = await load($, sub === 'refresh')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { text: message === 'NO_KEY' ? NO_KEY_HELP : `❌ ดึงข้อมูลจาก Stripe ไม่ได้: ${message}` }
    }
    $.ui.invalidate('ui.render')

    const now = await $.clock.now()
    const c = mainCurrency(d)
    const today = startOfDay(now)
    const label = SOURCE_LABEL[d.source]
    const rangeText = (title: string, r: Range, compare?: Range) =>
      `${title} ${label}\n  ยอดรวม ${money(r.total, c)} | ${r.count} รายการ | เฉลี่ย ${money(r.count ? r.total / r.count : 0, c)}\n  ค่าธรรมเนียม ${money(r.fee, c)} | สุทธิ ${money(r.net, c)}${compare ? `\n  เทียบช่วงก่อน ${growth(r.total, compare.total)}` : ''}`

    switch (sub) {
      case 'today':
        return { text: rangeText('💰 วันนี้', sumRange(d, c, today, today + DAY), sumRange(d, c, today - DAY, today)) }
      case 'yesterday':
        return { text: rangeText('💰 เมื่อวาน', sumRange(d, c, today - DAY, today), sumRange(d, c, today - 2 * DAY, today - DAY)) }
      case 'week':
        return { text: rangeText('💰 7 วันล่าสุด', sumRange(d, c, today - 6 * DAY, today + DAY), sumRange(d, c, today - 13 * DAY, today - 6 * DAY)) }
      case 'month':
        return { text: `${rangeText('💰 30 วันล่าสุด', sumRange(d, c, today - 29 * DAY, today + DAY))}\n  MRR ${money(d.mrr[c] ?? 0, c)} | ARR ${money((d.mrr[c] ?? 0) * 12, c)}` }
      case '7days':
      case '30days':
        return { text: `📈 ยอดรายวัน ${label}\n${chartText(d, c, sub === '7days' ? 7 : 30, now)}` }
      case 'transactions': {
        const n = Math.min(50, Math.max(1, Number(arg) || 10))
        const rows = [...d.txns].sort((a, b) => b.created - a.created).slice(0, n).map(t => {
          const when = new Date(t.created).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
          return `✅ ${money(t.amount, t.currency)} ${t.description} · ${t.email} · ${when}${t.fee !== undefined ? `\n   ค่าธรรมเนียม ${money(t.fee, t.currency)} | สุทธิ ${money(t.net ?? 0, t.currency)}` : ''}${t.refunded ? ` | คืนเงิน ${money(t.refunded, t.currency)}` : ''}`
        })
        return { text: [`💳 ${n} รายการล่าสุด ${label}`, ...rows].join('\n') }
      }
      case 'top':
      case 'products': {
        const group = new Map<string, { total: number; count: number }>()
        for (const t of d.txns.filter(x => x.currency === c)) {
          const k = sub === 'top' ? t.email : t.description
          const g = group.get(k) ?? { total: 0, count: 0 }
          group.set(k, { total: g.total + t.amount - t.refunded, count: g.count + 1 })
        }
        const rows = [...group.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, sub === 'top' ? 5 : 15)
        return { text: [`${sub === 'top' ? '🏆 ลูกค้าที่จ่ายมากสุด' : '📦 ยอดแยกตามสินค้า'} (30 วัน) ${label}`, ...rows.map(([k, g], i) => `${i + 1}. ${k} - ${money(g.total, c)} (${g.count} ครั้ง)`)].join('\n') }
      }
      case 'export': {
        const root = (await $.session.cwd()).replace(/[\\/]$/, '')
        const sep = root.includes('\\') ? '\\' : '/'
        const path = `${root}${sep}stripe-${d.source}-${new Date(now).toISOString().slice(0, 10)}.csv`
        const csv = ['id,date,amount,refunded,fee,net,currency,description,email', ...d.txns.map(t => [t.id, new Date(t.created).toISOString(), t.amount, t.refunded, t.fee ?? '', t.net ?? '', t.currency, `"${t.description.replace(/"/g, '""')}"`, t.email].join(','))].join('\n')
        await $.fs.write(path, csv + '\n')
        return { text: `💾 บันทึก ${d.txns.length} รายการแล้ว: ${path}${d.source === 'live' ? '\n⚠️ ไฟล์มีอีเมลลูกค้า อย่า commit เข้า git' : ''}` }
      }
      default: {
        await $.ui.open({ id: PANE, title: '💰 Stripe' })
        return { text: summary(d, now) }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. รีเฟรชอัตโนมัติทุก 15 นาทีด้วย $.clock.every แล้วเด้ง toast เมื่อมียอดขายใหม่
 * 2. ใช้ Stripe Webhooks + เซิร์ฟเวอร์เล็กๆ ส่งแจ้งเตือนเข้า LINE ทุกครั้งที่ขายได้ (ต่อกับ Mod 12)
 * 3. ดึงข้อมูลย้อนหลังนานกว่า 30 วันด้วย created[gte] แล้วทำกราฟรายเดือน
 */
