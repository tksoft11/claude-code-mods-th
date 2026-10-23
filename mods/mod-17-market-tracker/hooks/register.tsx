/**
 * ============================================================================
 * MOD 17: Market Tracker TH - ราคาทอง หุ้น คริปโต และค่าเงินจากแหล่งข้อมูลจริง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: แอปดูราคาตลาดบนมือถือ
 *
 * หน้าที่ของ Mod นี้:
 * 1. ราคาทองคำแท่งและทองรูปพรรณของไทย, ทองโลก, หุ้น SET และหุ้น US, คริปโต, ค่าเงิน USD/THB
 * 2. Watchlist ในแผงด้านข้าง
 * 3. พอร์ต: บันทึกต้นทุน แล้วดูกำไร/ขาดทุนตามราคาล่าสุด (รวมเป็นบาท)
 * 4. แจ้งเตือนเมื่อราคาข้ามระดับที่ตั้งไว้ (เช็คทุก 5 นาทีขณะเปิด Claude Code)
 *
 * แหล่งข้อมูล (ฟรี ไม่ต้องใช้ key):
 * - คริปโต: CoinGecko API
 * - ค่าเงิน: open.er-api.com (อัปเดตวันละครั้ง)
 * - ทองไทย: api.chnwt.dev/thai-gold-api (ไม่เป็นทางการ อ้างอิงราคาสมาคมค้าทองคำ)
 * - หุ้นและทองโลก: Yahoo Finance chart API (ไม่เป็นทางการ อาจล่าช้า ~15 นาที)
 *
 * ⚠️ ข้อมูลอาจล่าช้าหรือคลาดเคลื่อน ไม่ใช่คำแนะนำการลงทุน
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Quote {
  symbol: string
  name: string
  price: number
  currency: string
  changePct?: number
  source: string
  time: number // ms
}

interface Holding {
  symbol: string
  amount: number
  cost: number // ราคาต่อหน่วยตอนซื้อ (สกุลเดียวกับ quote)
}

interface PriceAlert {
  id: number
  symbol: string
  condition: 'above' | 'below'
  target: number
}

const PANE = 'market-tracker-th'
const UA = { 'User-Agent': 'Mozilla/5.0 (claude-code market-tracker-th)' }

// ชื่อย่อคริปโต -> id ของ CoinGecko
const CRYPTO: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano', USDT: 'tether' }

// ==========================================================================
// บทที่ 1: ดึงข้อมูลแต่ละแหล่ง (แต่ละแหล่งตอบ JSON คนละแบบ ต้องแปลงเป็น Quote เดียวกัน)
// ==========================================================================
async function getJson($: EngineInterface, url: string): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as Record<string, unknown>
}

async function cryptoQuotes($: EngineInterface, symbols: string[]): Promise<Quote[]> {
  const ids = symbols.map(s => CRYPTO[s] ?? s.toLowerCase())
  const body = await getJson($, `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=thb,usd&include_24hr_change=true&include_last_updated_at=true`)
  const now = await $.clock.now()
  return symbols.flatMap((symbol, i) => {
    const row = body[ids[i] ?? ''] as { thb?: number; usd?: number; thb_24h_change?: number; last_updated_at?: number } | undefined
    if (!row?.thb) return []
    return [{ symbol, name: ids[i] ?? symbol, price: row.thb, currency: 'THB', changePct: row.thb_24h_change, source: 'CoinGecko', time: (row.last_updated_at ?? 0) * 1000 || now }]
  })
}

async function yahooQuote($: EngineInterface, symbol: string): Promise<Quote> {
  const body = await getJson($, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`)
  const chart = body.chart as { result?: { meta?: Record<string, unknown> }[] | null; error?: { description?: string } | null }
  const meta = chart.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(chart.error?.description ?? `ไม่พบ ${symbol}`)
  const price = meta.regularMarketPrice
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0)
  return {
    symbol,
    name: String(meta.shortName ?? meta.longName ?? symbol),
    price,
    currency: String(meta.currency ?? 'USD'),
    changePct: prev ? ((price - prev) / prev) * 100 : undefined,
    source: 'Yahoo Finance',
    time: Number(meta.regularMarketTime ?? 0) * 1000,
  }
}

async function thaiGold($: EngineInterface): Promise<Quote[]> {
  const body = await getJson($, 'https://api.chnwt.dev/thai-gold-api/latest')
  const r = body.response as { update_date?: string; update_time?: string; price?: Record<string, { buy?: string; sell?: string }> } | undefined
  const num = (s: string | undefined) => Number((s ?? '').replace(/,/g, ''))
  const bar = r?.price?.gold_bar
  const ornament = r?.price?.gold
  if (!bar?.sell) throw new Error('รูปแบบข้อมูลทองเปลี่ยน')
  const label = `สมาคมค้าทองคำ ${r?.update_date ?? ''} ${r?.update_time ?? ''}`.trim()
  const now = await $.clock.now()
  return [
    { symbol: 'GOLD-BAR', name: `ทองคำแท่ง 96.5% (รับซื้อ ฿${bar.buy})`, price: num(bar.sell), currency: 'THB', source: label, time: now },
    { symbol: 'GOLD', name: `ทองรูปพรรณ 96.5% (รับซื้อ ฿${ornament?.buy ?? '-'})`, price: num(ornament?.sell), currency: 'THB', source: label, time: now },
  ]
}

async function usdThb($: EngineInterface): Promise<Quote> {
  const body = await getJson($, 'https://open.er-api.com/v6/latest/USD')
  const rate = (body.rates as Record<string, number> | undefined)?.THB
  if (!rate) throw new Error('ไม่มีอัตรา THB')
  return { symbol: 'USDTHB', name: 'ดอลลาร์ / บาท', price: rate, currency: 'THB', source: 'open.er-api.com (รายวัน)', time: Number(body.time_last_update_unix ?? 0) * 1000 }
}

// ==========================================================================
// บทที่ 2: ตัวเลือกแหล่งข้อมูลจากชื่อ + cache 60 วินาที (ไม่ยิง API ถี่เกิน)
// ==========================================================================
const cache = new Map<string, { at: number; quote: Quote }>()

// ชื่อเรียกง่ายๆ -> สัญลักษณ์ของ Yahoo (ราคาสัญญาซื้อขายล่วงหน้า เป็น USD)
const ALIASES: Record<string, string> = { XAU: 'GC=F', 'GOLD-WORLD': 'GC=F', OIL: 'CL=F', WTI: 'CL=F', BRENT: 'BZ=F', SILVER: 'SI=F', XAG: 'SI=F' }

// AAPL คงเดิม, BTC -> CoinGecko, GOLD -> ทองไทย, XAU -> ทองโลก, OIL -> น้ำมัน WTI
function normalize(input: string): string {
  const s = input.toUpperCase()
  return ALIASES[s] ?? s
}

async function quotes($: EngineInterface, inputs: string[]): Promise<{ quotes: Quote[]; errors: string[] }> {
  const now = await $.clock.now()
  const wanted = inputs.map(normalize)
  const result: Quote[] = []
  const errors: string[] = []
  const missing = wanted.filter(s => {
    const hit = cache.get(s)
    if (hit && now - hit.at < 60_000) return result.push(hit.quote), false
    return true
  })

  const cryptoSyms = missing.filter(s => CRYPTO[s])
  const goldSyms: string[] = missing.filter(s => s === 'GOLD' || s === 'GOLD-BAR')
  const others = missing.filter(s => !CRYPTO[s] && !goldSyms.includes(s))
  const save = (q: Quote) => {
    cache.set(q.symbol, { at: now, quote: q })
    if (wanted.includes(q.symbol)) result.push(q)
  }

  await Promise.all([
    cryptoSyms.length ? cryptoQuotes($, cryptoSyms).then(qs => qs.forEach(save)).catch(err => errors.push(`คริปโต: ${String(err)}`)) : undefined,
    goldSyms.length ? thaiGold($).then(qs => qs.forEach(save)).catch(err => errors.push(`ทองไทย: ${String(err)}`)) : undefined,
    ...others.map(s =>
      (s === 'USDTHB' ? usdThb($) : yahooQuote($, s)).then(save).catch(err => {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${s}: ${message === 'HTTP 404' ? 'ไม่พบชื่อนี้ (หุ้นไทยต้องลงท้าย .BK หรือใช้ /market set)' : message}`)
      }),
    ),
  ])
  // เรียงตามลำดับที่ขอ
  result.sort((a, b) => wanted.indexOf(a.symbol) - wanted.indexOf(b.symbol))
  return { quotes: result, errors }
}

// ==========================================================================
// บทที่ 3: จัดรูปแบบตัวเลข
// ==========================================================================
function fmt(n: number, currency: string): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 2 : 6
  const symbol = currency === 'THB' ? '฿' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`
}

function change(pct: number | undefined): string {
  return pct === undefined || Number.isNaN(pct) ? '' : `${pct >= 0 ? '📈 +' : '📉 '}${pct.toFixed(2)}%`
}

function quoteLine(q: Quote): string {
  return `${q.symbol.padEnd(9)} ${fmt(q.price, q.currency).padStart(14)} ${change(q.changePct).padEnd(10)} ${q.name}`
}

function age(ms: number, now: number): string {
  const min = Math.floor((now - ms) / 60000)
  return min < 1 ? 'เมื่อสักครู่' : min < 60 ? `${min} นาทีที่แล้ว` : `${Math.floor(min / 60)} ชม.ที่แล้ว`
}

const DISCLAIMER = 'ℹ️ ข้อมูลอาจล่าช้าหรือคลาดเคลื่อน ไม่ใช่คำแนะนำการลงทุน'

// ==========================================================================
// บทที่ 4: watchlist, พอร์ต และแจ้งเตือน (เก็บใน $.store)
// ==========================================================================
let watchlist: string[] = ['GOLD-BAR', 'BTC', 'USDTHB', 'PTT.BK', 'AAPL']
let portfolio: Holding[] = []
let alerts: PriceAlert[] = []
let nextAlertId = 0
let alertTimer: Timer | undefined
let paneQuotes: Quote[] = []

async function persist($: EngineInterface): Promise<void> {
  await $.store.set('market', { watchlist, portfolio, alerts, nextAlertId })
}

async function checkAlerts($: EngineInterface): Promise<void> {
  if (alerts.length === 0) return
  const { quotes: qs } = await quotes($, [...new Set(alerts.map(a => a.symbol))])
  const fired = alerts.filter(a => {
    const q = qs.find(x => x.symbol === a.symbol)
    return q && (a.condition === 'above' ? q.price >= a.target : q.price <= a.target)
  })
  if (fired.length === 0) return
  alerts = alerts.filter(a => !fired.includes(a)) // แจ้งครั้งเดียวแล้วลบ (ลบก่อน กันแจ้งซ้ำถ้าขั้นต่อไปพัง)
  await persist($)
  for (const a of fired) {
    const q = qs.find(x => x.symbol === a.symbol)
    const text = `🔔 ${a.symbol} ${a.condition === 'above' ? 'ขึ้นถึง' : 'ลงถึง'} ${fmt(a.target, q?.currency ?? 'THB')} แล้ว (ตอนนี้ ${fmt(q?.price ?? 0, q?.currency ?? 'THB')})`
    $.ui.toast(text)
    try {
      void $.ui.notify(text, { title: 'Market Tracker' }).catch(() => undefined)
    } catch {
      // บางหน้าจอแจ้งเตือนของระบบไม่ได้ ไม่เป็นไร มี toast แล้ว
    }
  }
  startAlertLoop($)
}

function startAlertLoop($: EngineInterface): void {
  alertTimer?.cancel()
  alertTimer = alerts.length ? $.clock.every(5 * 60 * 1000, () => void checkAlerts($).catch(() => undefined)) : undefined
}

async function refreshPane($: EngineInterface): Promise<string[]> {
  const { quotes: qs, errors } = await quotes($, watchlist)
  paneQuotes = qs
  $.ui.invalidate('ui.render')
  return errors
}

const HELP = `📊 Market Tracker TH (Mod 17)
========================================
/market                    watchlist + เปิดแผง
/market gold               ทองคำแท่ง ทองรูปพรรณ ทองโลก
/market oil                น้ำมัน WTI และ Brent (USD/บาร์เรล)
/market crypto [BTC ETH]   คริปโต (ราคาเป็นบาท)
/market stock <ชื่อ...>     หุ้น เช่น PTT.BK CPALL.BK AAPL NVDA
/market set <ชื่อ...>       หุ้นไทย ไม่ต้องใส่ .BK เช่น /market set PTT KBANK
/market fx                 ค่าเงิน USD/THB
/market watch add|remove <ชื่อ>
/market buy <ชื่อ> <จำนวน> <ราคาต่อหน่วย>  บันทึกเข้าพอร์ต
/market sell <ชื่อ>         เอาออกจากพอร์ต
/market portfolio          กำไร/ขาดทุน (รวมเป็นบาท)
/market alert <ชื่อ> above|below <ราคา>   แจ้งเตือนเมื่อราคาข้าม
/market alerts | alert remove <id>
ชื่อพิเศษ: GOLD-BAR, GOLD (ทองไทย), XAU (ทองโลก), OIL/WTI, BRENT, SILVER, USDTHB, BTC ETH SOL BNB XRP DOGE ADA USDT`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('market')) as { watchlist?: string[]; portfolio?: Holding[]; alerts?: PriceAlert[]; nextAlertId?: number } | undefined
    if (saved?.watchlist) watchlist = saved.watchlist
    portfolio = saved?.portfolio ?? []
    alerts = saved?.alerts ?? []
    nextAlertId = saved?.nextAlertId ?? 0
    startAlertLoop($)
    await $.command.register({ name: 'market', description: 'ราคาทอง หุ้น คริปโต ค่าเงิน (/market help)', argumentHint: 'gold|crypto|stock|fx|portfolio|alert' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: แผง watchlist
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column">
        {paneQuotes.length === 0 && <Text dimColor>พิมพ์ /market เพื่อโหลดราคา</Text>}
        {paneQuotes.map(q => (
          <Box justifyContent="space-between" gap={1}>
            <Text bold>{q.symbol}</Text>
            <Text>{fmt(q.price, q.currency)}</Text>
            <Text color={(q.changePct ?? 0) >= 0 ? '#2e7d32' : '#c62828'}>{change(q.changePct)}</Text>
          </Box>
        ))}
        <Text dimColor>{paneQuotes[0] ? `อัปเดต ${age(Math.min(...paneQuotes.map(q => q.time)), now)}` : ''}</Text>
        <Button key="refresh" label="รีเฟรช" hotkey="r" onPress={() => void refreshPane($)} />
      </Box>
    )
  })

  on('command.run', { command: 'market' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()

    // แสดงชุดราคา พร้อมแหล่งที่มาและ error ถ้ามี
    const show = async (title: string, symbols: string[]) => {
      const { quotes: qs, errors } = await quotes($, symbols)
      const sources = [...new Set(qs.map(q => `${q.source} (${age(q.time, now)})`))]
      return {
        text: [title, '----------------------------------------', ...qs.map(quoteLine), ...errors.map(err => `⚠️ ${err}`), '', `แหล่งข้อมูล: ${sources.join(', ') || '-'}`, DISCLAIMER].join('\n'),
      }
    }

    switch (sub) {
      case 'help':
        return { text: HELP }
      case '': {
        await $.ui.open({ id: PANE, title: '📊 Market' })
        await refreshPane($)
        return show('📊 Watchlist', watchlist)
      }
      case 'gold':
        return show('🥇 ราคาทอง', ['GOLD-BAR', 'GOLD', 'XAU'])
      case 'oil':
        return show('🛢️ น้ำมันดิบ (USD/บาร์เรล)', ['OIL', 'BRENT'])
      case 'crypto':
        return show('₿ คริปโต (บาท, เปลี่ยนแปลง 24 ชม.)', rest.length ? rest : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'])
      case 'stock':
        return rest.length ? show('📈 หุ้น', rest) : { text: 'วิธีใช้: /market stock PTT.BK AAPL' }
      case 'set':
        return rest.length ? show('📈 หุ้นไทย (SET)', rest.map(s => (s.includes('.') ? s : `${s}.BK`))) : { text: 'วิธีใช้: /market set PTT KBANK' }
      case 'fx':
        return show('💱 ค่าเงิน', ['USDTHB'])
      case 'watch': {
        const [action, symbol] = rest
        if (!symbol || (action !== 'add' && action !== 'remove')) return { text: `👀 Watchlist: ${watchlist.join(', ')}\nวิธีใช้: /market watch add|remove <ชื่อ>` }
        const s = normalize(symbol)
        watchlist = action === 'add' ? [...new Set([...watchlist, s])] : watchlist.filter(w => w !== s)
        await persist($)
        await refreshPane($)
        return { text: `👀 Watchlist: ${watchlist.join(', ')}` }
      }
      case 'buy': {
        const [symbol, amountText, costText] = rest
        const amount = Number(amountText)
        const cost = Number(costText)
        if (!symbol || !(amount > 0) || !(cost > 0)) return { text: 'วิธีใช้: /market buy BTC 0.01 2500000  (ชื่อ จำนวน ราคาต่อหน่วยตอนซื้อ)' }
        portfolio.push({ symbol: normalize(symbol), amount, cost })
        await persist($)
        return { text: `✅ บันทึก ${normalize(symbol)} ${amount} หน่วย ต้นทุน ${cost.toLocaleString('en-US')} ต่อหน่วย` }
      }
      case 'sell': {
        const s = normalize(rest[0] ?? '')
        const before = portfolio.length
        portfolio = portfolio.filter(h => h.symbol !== s)
        await persist($)
        return { text: before === portfolio.length ? `❌ ไม่มี ${s} ในพอร์ต` : `🗑️ เอา ${s} ออกจากพอร์ตแล้ว` }
      }
      case 'portfolio': {
        if (portfolio.length === 0) return { text: '📊 พอร์ตว่าง\nบันทึกด้วย /market buy BTC 0.01 2500000' }
        const { quotes: qs, errors } = await quotes($, [...new Set([...portfolio.map(h => h.symbol), 'USDTHB'])])
        const usd = qs.find(q => q.symbol === 'USDTHB')?.price ?? 0
        const toThb = (n: number, currency: string) => (currency === 'THB' ? n : currency === 'USD' && usd ? n * usd : NaN)
        let costThb = 0
        let valueThb = 0
        const rows = portfolio.map(h => {
          const q = qs.find(x => x.symbol === h.symbol)
          if (!q) return `⚠️ ${h.symbol}: ดึงราคาไม่ได้`
          const pnl = (q.price - h.cost) * h.amount
          costThb += toThb(h.cost * h.amount, q.currency)
          valueThb += toThb(q.price * h.amount, q.currency)
          return `${h.symbol} ${h.amount} × ${fmt(h.cost, q.currency)} → ${fmt(q.price, q.currency)}  ${pnl >= 0 ? '📈 +' : '📉 '}${fmt(pnl, q.currency)} (${(((q.price - h.cost) / h.cost) * 100).toFixed(2)}%)`
        })
        const total = valueThb - costThb
        return {
          text: [
            '📊 พอร์ต',
            '----------------------------------------',
            ...rows,
            '',
            Number.isNaN(total) ? 'รวมเป็นบาทไม่ได้ (มีสกุลเงินที่ไม่รู้อัตราแลกเปลี่ยน)' : `💰 ต้นทุน ${fmt(costThb, 'THB')} | มูลค่า ${fmt(valueThb, 'THB')} | ${total >= 0 ? '📈 +' : '📉 '}${fmt(total, 'THB')} (${((total / costThb) * 100).toFixed(2)}%)`,
            ...errors.map(err => `⚠️ ${err}`),
            DISCLAIMER,
          ].join('\n'),
        }
      }
      case 'alert': {
        if (rest[0] === 'remove') {
          alerts = alerts.filter(a => a.id !== Number(rest[1]))
          await persist($)
          startAlertLoop($)
          return { text: `🗑️ ลบการแจ้งเตือน #${rest[1] ?? ''} แล้ว` }
        }
        const [symbol, condition, targetText] = rest
        const target = Number((targetText ?? '').replace(/,/g, ''))
        if (!symbol || (condition !== 'above' && condition !== 'below') || !(target > 0)) return { text: 'วิธีใช้: /market alert BTC above 3000000  หรือ  /market alert GOLD-BAR below 60000' }
        alerts.push({ id: nextAlertId++, symbol: normalize(symbol), condition, target })
        await persist($)
        startAlertLoop($)
        await checkAlerts($).catch(() => undefined) // เช็คครั้งแรกทันที ไม่ต้องรอ 5 นาที
        return { text: `🔔 ตั้งแจ้งเตือน ${normalize(symbol)} ${condition === 'above' ? 'ขึ้นถึง' : 'ลงถึง'} ${target.toLocaleString('en-US')} (เช็คทุก 5 นาทีขณะเปิด Claude Code)` }
      }
      case 'alerts':
        return { text: alerts.length ? ['🔔 การแจ้งเตือน', ...alerts.map(a => `  #${a.id} ${a.symbol} ${a.condition === 'above' ? '≥' : '≤'} ${a.target.toLocaleString('en-US')}`)].join('\n') : 'ยังไม่มีการแจ้งเตือน' }
      default:
        // /market BTC PTT.BK = ดูราคาตามชื่อที่พิมพ์
        return show('📊 ราคา', [sub, ...rest])
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. วาดกราฟราคาย้อนหลัง: Yahoo chart API ใส่ range=1mo&interval=1d ได้ราคาปิดรายวัน
 * 2. ส่งแจ้งเตือนราคาเข้า LINE ด้วย Flex Message ของ Mod 12
 * 3. คำนวณ DCA: บันทึกการซื้อหลายครั้ง แล้วหาต้นทุนเฉลี่ย
 */
