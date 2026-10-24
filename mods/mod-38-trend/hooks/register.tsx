/**
 * ============================================================================
 * MOD 38: Trend TH - เทรนด์ล่าสุดจากแหล่งข้อมูลจริง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Google Trends, Hacker News, GitHub Trending
 *
 * หน้าที่ของ Mod นี้:
 * 1. คำค้นมาแรงในไทยวันนี้ (Google Trends RSS) พร้อมจำนวนค้นหาโดยประมาณ
 * 2. ข่าว tech ที่ Dev ทั่วโลกคุยกัน (Hacker News)
 * 3. repo ใหม่ที่ได้ดาวเร็วที่สุด (GitHub search API)
 * 4. เหรียญคริปโตที่คนค้นมากสุด (CoinGecko trending)
 * 5. บทความ Wikipedia ไทย/อังกฤษที่คนอ่านมากสุดเมื่อวาน
 * 6. ติดตามคำ (watch): เด้งเตือนเมื่อคำที่สนใจขึ้นเทรนด์ Google
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const UA = { 'User-Agent': 'claude-code-trend-th/1.0 (educational mod)' }
let watches: string[] = []
let watchTimer: Timer | undefined
let alerted = new Set<string>()

async function get($: EngineInterface, url: string): Promise<string> {
  const res = await $.http.fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text
}

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

// ==========================================================================
// บทที่ 1: Google Trends - อ่าน RSS (XML) ด้วย regex
// ==========================================================================
interface GoogleTrend {
  title: string
  traffic: string
  news: string
}

async function googleTrends($: EngineInterface, geo: string): Promise<GoogleTrend[]> {
  const xml = await get($, `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`)
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const item = m[1] ?? ''
    const tag = (name: string) => decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? '')
    return { title: tag('title'), traffic: tag('ht:approx_traffic'), news: tag('ht:news_item_title') }
  })
}

// ==========================================================================
// บทที่ 2: Hacker News, GitHub, CoinGecko, Wikipedia (JSON ทั้งหมด)
// ==========================================================================
async function hackerNews($: EngineInterface, n: number): Promise<string[]> {
  const ids = (JSON.parse(await get($, 'https://hacker-news.firebaseio.com/v0/topstories.json')) as number[]).slice(0, n)
  const items = await Promise.all(ids.map(id => get($, `https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(t => JSON.parse(t) as { title?: string; score?: number; descendants?: number; url?: string }).catch(() => undefined)))
  return items.filter(Boolean).map(i => `▲${i?.score ?? 0} 💬${i?.descendants ?? 0}  ${i?.title ?? ''}${i?.url ? `\n      ${i.url}` : ''}`)
}

async function githubRising($: EngineInterface, days: number, language?: string): Promise<string[]> {
  const since = new Date((await $.clock.now()) - days * 86_400_000).toISOString().slice(0, 10)
  const q = `created:>${since}${language ? ` language:${language}` : ''}`
  const body = JSON.parse(await get($, `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`)) as { items?: { full_name: string; stargazers_count: number; description?: string | null; language?: string | null }[] }
  return (body.items ?? []).map(r => `⭐${r.stargazers_count.toLocaleString('en-US')}  ${r.full_name}${r.language ? ` [${r.language}]` : ''}${r.description ? `\n      ${r.description.slice(0, 90)}` : ''}`)
}

async function cryptoTrending($: EngineInterface): Promise<string[]> {
  const body = JSON.parse(await get($, 'https://api.coingecko.com/api/v3/search/trending')) as { coins?: { item: { name: string; symbol: string; market_cap_rank?: number | null } }[] }
  return (body.coins ?? []).slice(0, 10).map(c => `${c.item.symbol.padEnd(8)} ${c.item.name}${c.item.market_cap_rank ? ` (อันดับ ${c.item.market_cap_rank})` : ''}`)
}

async function wikiMostRead($: EngineInterface, lang: string): Promise<string[]> {
  const y = new Date((await $.clock.now()) - 86_400_000) // ข้อมูลของเมื่อวาน (วันนี้ยังนับไม่จบ)
  const path = `${y.getFullYear()}/${String(y.getMonth() + 1).padStart(2, '0')}/${String(y.getDate()).padStart(2, '0')}`
  const body = JSON.parse(await get($, `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${path}`)) as { mostread?: { articles?: { normalizedtitle: string; views: number; description?: string }[] } }
  return (body.mostread?.articles ?? [])
    // ตัดหน้าระบบ และหัวข้อสั้นเกินไป (มักเป็นคำหยาบหรือหน้าที่ไม่มีเนื้อหา)
    .filter(a => !/^(Main Page|หน้าหลัก|Special:|พิเศษ:)/.test(a.normalizedtitle) && [...a.normalizedtitle].length > 2)
    .slice(0, 10)
    .map(a => `👁️${a.views.toLocaleString('en-US')}  ${a.normalizedtitle}${a.description ? ` - ${a.description.slice(0, 60)}` : ''}`)
}

// ==========================================================================
// บทที่ 3: ติดตามคำ - เช็ค Google Trends ทุก 1 ชม. ขณะเปิด Claude Code
// ==========================================================================
async function checkWatches($: EngineInterface): Promise<void> {
  if (watches.length === 0) return
  const trends = await googleTrends($, 'TH')
  for (const w of watches) {
    const hit = trends.find(t => t.title.toLowerCase().includes(w.toLowerCase()) || t.news.toLowerCase().includes(w.toLowerCase()))
    const key = `${w}|${hit?.title}`
    if (hit && !alerted.has(key)) {
      alerted.add(key)
      $.ui.toast(`📈 "${w}" ขึ้นเทรนด์ Google: ${hit.title} (${hit.traffic})`)
    }
  }
}

function startWatch($: EngineInterface): void {
  watchTimer?.cancel()
  watchTimer = watches.length ? $.clock.every(60 * 60_000, () => void checkWatches($).catch(() => undefined)) : undefined
}

const section = (title: string, lines: string[]) => [title, ...lines.map((l, i) => `  ${i + 1}. ${l}`)].join('\n')

const HELP = `📈 Trend TH (Mod 38)
========================================
/trend                    สรุปทุกแหล่ง (สั้น)
/trend google [ประเทศ]    คำค้นมาแรง (ค่าเริ่มต้น TH เช่น US, JP)
/trend hn                 Hacker News
/trend github [วัน] [ภาษา]  repo ใหม่ดาวพุ่ง เช่น /trend github 7 typescript
/trend crypto             เหรียญที่คนค้นมากสุด
/trend wiki [th|en]       บทความที่คนอ่านมากสุดเมื่อวาน
/trend watch <คำ> | unwatch <คำ> | watch   เตือนเมื่อคำนี้ขึ้นเทรนด์`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('watches')
    watches = Array.isArray(saved) ? (saved as string[]) : []
    startWatch($)
    await $.command.register({ name: 'trend', description: 'เทรนด์ล่าสุด: Google ไทย, Hacker News, GitHub, คริปโต, Wikipedia (/trend help)', argumentHint: 'google|hn|github|crypto|wiki|watch' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /trend
  // ==========================================================================
  on('command.run', { command: 'trend' }, async ($, e) => {
    const [sub = '', a1, a2] = e.args.trim().split(/\s+/).filter(Boolean)
    try {
      switch (sub) {
        case '': {
          // ดึงพร้อมกัน แหล่งไหนพังก็ยังแสดงแหล่งอื่น
          const [g, h, gh, c] = await Promise.all([
            googleTrends($, 'TH').catch(() => [] as GoogleTrend[]),
            hackerNews($, 5).catch(() => ['(ดึงไม่ได้)']),
            githubRising($, 7).then(l => l.slice(0, 5)).catch(() => ['(ดึงไม่ได้)']),
            cryptoTrending($).then(l => l.slice(0, 5)).catch(() => ['(ดึงไม่ได้)']),
          ])
          return {
            text: [
              section('🇹🇭 Google ไทยวันนี้', g.slice(0, 8).map(t => `${t.title} (${t.traffic})`)),
              section('💻 Hacker News', h.map(l => l.split('\n')[0] ?? l)),
              section('⭐ GitHub repo ใหม่ดาวพุ่ง (7 วัน)', gh.map(l => l.split('\n')[0] ?? l)),
              section('🪙 คริปโตมาแรง', c),
              '',
              'ดูละเอียดแต่ละแหล่ง: /trend help',
            ].join('\n\n'),
          }
        }
        case 'google': {
          const geo = (a1 ?? 'TH').toUpperCase()
          const list = await googleTrends($, geo)
          return { text: section(`🔎 Google Trends ${geo}`, list.slice(0, 20).map(t => `${t.title} (${t.traffic})${t.news ? `\n      📰 ${t.news.slice(0, 90)}` : ''}`)) }
        }
        case 'hn':
          return { text: section('💻 Hacker News ตอนนี้', await hackerNews($, 15)) }
        case 'github': {
          const days = Math.min(30, Math.max(1, Number(a1) || 7))
          const language = a1 && !Number(a1) ? a1 : a2
          return { text: section(`⭐ GitHub repo ใหม่ (${days} วัน)${language ? ` ${language}` : ''}`, await githubRising($, days, language)) }
        }
        case 'crypto':
          return { text: section('🪙 CoinGecko trending', await cryptoTrending($)) }
        case 'wiki': {
          const lang = a1 === 'en' ? 'en' : 'th'
          return { text: section(`📚 Wikipedia ${lang} อ่านมากสุดเมื่อวาน`, await wikiMostRead($, lang)) }
        }
        case 'watch':
          if (!a1) return { text: watches.length ? `👀 ติดตาม: ${watches.join(', ')}` : 'ยังไม่ได้ติดตามคำไหน /trend watch <คำ>' }
          watches = [...new Set([...watches, [a1, a2].filter(Boolean).join(' ')])]
          await $.store.set('watches', watches)
          startWatch($)
          await checkWatches($)
          return { text: `👀 ติดตาม: ${watches.join(', ')} (เช็คทุก 1 ชม. ขณะเปิด Claude Code)` }
        case 'unwatch':
          watches = watches.filter(w => w !== [a1, a2].filter(Boolean).join(' '))
          await $.store.set('watches', watches)
          startWatch($)
          return { text: `👀 ติดตาม: ${watches.join(', ') || '-'}` }
        default:
          return { text: HELP }
      }
    } catch (err) {
      return { text: `❌ ดึงข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้ Claude สรุปว่าเทรนด์ไหนเกี่ยวกับธุรกิจ/โปรเจกต์ของคุณ ($.model.complete)
 * 2. เก็บประวัติเทรนด์รายวันใน $.store แล้วดูว่าคำไหนอยู่นาน
 * 3. ส่งสรุปเทรนด์ตอนเช้าไปมือถือ (ต่อกับ Mod 22 + Mod 24)
 */
