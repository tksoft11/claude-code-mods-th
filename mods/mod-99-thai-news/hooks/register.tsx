/**
 * ============================================================================
 * MOD 99: Thai News TH - ข่าวไทยล่าสุดเหนือช่องพิมพ์ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: world-news (ข่าวไต้หวัน) ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดึงหัวข้อข่าวไทยจาก Google News (RSS ภาษาไทย) ทุก 15 นาที
 * 2. แถบเหนือช่องพิมพ์หมุนเปลี่ยนข่าวทุก 30 วินาที พร้อมชื่อสำนักข่าวและเวลา
 * 3. เลือกหมวดได้: เด่น, เทคโนโลยี, ธุรกิจ, ในประเทศ, ต่างประเทศ, กีฬา, บันเทิง, วิทยาศาสตร์, สุขภาพ
 * 4. /news เปิดแผงรายการข่าว 15 ข่าว คลิกลิงก์อ่านต่อได้
 * 5. /news ask: ให้ Claude สรุปข่าวเด่นวันนี้ให้ฟัง
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const PANE = 'thai-news-th'
const TOPICS: Record<string, { label: string; id?: string }> = {
  top: { label: 'ข่าวเด่น' },
  tech: { label: 'เทคโนโลยี', id: 'TECHNOLOGY' },
  business: { label: 'ธุรกิจ', id: 'BUSINESS' },
  nation: { label: 'ในประเทศ', id: 'NATION' },
  world: { label: 'ต่างประเทศ', id: 'WORLD' },
  sports: { label: 'กีฬา', id: 'SPORTS' },
  entertainment: { label: 'บันเทิง', id: 'ENTERTAINMENT' },
  science: { label: 'วิทยาศาสตร์', id: 'SCIENCE' },
  health: { label: 'สุขภาพ', id: 'HEALTH' },
}

interface News {
  title: string
  source: string
  link: string
  at: number
}

let topic = 'top'
let band = true
let news: News[] = []
let index = 0
let refresher: Timer | undefined
let rotator: Timer | undefined

function feedUrl(t: string): string {
  const id = TOPICS[t]?.id
  return id ? `https://news.google.com/rss/headlines/section/topic/${id}?hl=th&gl=TH&ceid=TH:th` : 'https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th'
}

// ==========================================================================
// บทที่ 1: อ่าน RSS ด้วย regex (ไม่มี DOM ให้ใช้ใน mod)
// ==========================================================================
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .trim()
}

function parse(xml: string): News[] {
  const out: News[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1] ?? ''
    const tag = (name: string): string => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? '')
    const source = tag('source')
    let title = tag('title')
    // หัวข้อของ Google News ลงท้ายด้วย " - ชื่อสำนักข่าว" ตัดออกเพราะแสดงแยกแล้ว
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    if (title) out.push({ title, source, link: tag('link'), at: Date.parse(tag('pubDate')) || 0 })
  }
  return out.sort((a, b) => b.at - a.at)
}

async function refresh($: EngineInterface): Promise<string | undefined> {
  try {
    const r = await $.http.fetch(feedUrl(topic))
    if (!r.ok) return `ดึงข่าวไม่ได้ (HTTP ${r.status})`
    const items = parse(r.text)
    if (items.length === 0) return 'ไม่พบข่าวใน feed'
    news = items.slice(0, 30)
    index = 0
    $.ui.invalidate('ui.render')
    return undefined
  } catch (err) {
    return `ดึงข่าวไม่ได้: ${String(err)}`
  }
}

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 60 ? `${m} นาทีก่อน` : m < 1440 ? `${Math.round(m / 60)} ชม.ก่อน` : `${Math.round(m / 1440)} วันก่อน`
}

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ==========================================================================
// บทที่ 2: ตั้งเวลาดึงข่าวใหม่และหมุนหัวข้อ
// ==========================================================================
function startTimers($: EngineInterface): void {
  refresher?.cancel()
  rotator?.cancel()
  refresher = $.clock.every(15 * 60_000, () => void refresh($))
  rotator = $.clock.every(30_000, () => {
    if (news.length === 0) return
    index = (index + 1) % Math.min(news.length, 15)
    $.ui.invalidate('ui.render')
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const s = (await $.store.get('settings')) as { topic?: string; band?: boolean } | undefined
    topic = s?.topic && TOPICS[s.topic] ? s.topic : 'top'
    band = s?.band ?? true
    news = []
    await $.command.register({ name: 'news', description: 'ข่าวไทยล่าสุดจาก Google News (/news help)', argumentHint: `${Object.keys(TOPICS).join('|')} | band on|off | ask` })
    startTimers($)
    void refresh($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แถบข่าวเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = news[index]
    if (!band || !n || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          <Text color="#ef5350">{`📰 ${TOPICS[topic]?.label ?? ''} `}</Text>
          <Text>{short(n.title, 90)}</Text>
          <Text dimColor>{`  · ${n.source} ${ago(n.at, await $.clock.now())}`}</Text>
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const now = await $.clock.now()
    if (news.length === 0) return <Text dimColor>กำลังโหลดข่าว…</Text>
    return (
      <Box flexDirection="column">
        <Text color="#ef5350">{`📰 ${TOPICS[topic]?.label ?? ''} · Google News`}</Text>
        {news.slice(0, 15).map((n, i) => (
          <Box flexDirection="column" marginTop={1}>
            <Text>{`${i + 1}. ${n.title}`}</Text>
            <Text dimColor>
              {`   ${n.source} · ${ago(n.at, now)}  `}
              <Link href={n.link} label="อ่านต่อ" />
            </Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'news' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', { topic, band })
    if (TOPICS[sub]) {
      topic = sub
      await save()
      const err = await refresh($)
      return { text: err ? `❌ ${err}` : `📰 เปลี่ยนเป็นหมวด${TOPICS[sub]!.label} (${news.length} ข่าว)` }
    }
    if (sub === 'band') {
      if (arg !== 'on' && arg !== 'off') return { text: 'วิธีใช้: /news band on|off' }
      band = arg === 'on'
      await save()
      $.ui.invalidate('ui.render')
      return { text: `📰 แถบข่าว: ${band ? 'แสดง' : 'ซ่อน'}` }
    }
    if (sub === 'ask') {
      if (news.length === 0) await refresh($)
      const list = news.slice(0, 15).map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n')
      void $.prompt.submit({ text: `นี่คือหัวข้อข่าว${TOPICS[topic]?.label ?? ''}ล่าสุดจาก Google News ช่วยสรุปเป็นภาษาไทย 5 ประเด็นที่น่าสนใจที่สุด สั้นๆ (ไม่ต้องใช้ tool):\n${list}` })
      return { text: '📰 ส่งให้ Claude สรุปข่าวแล้ว' }
    }
    if (sub === 'help') return { text: `📰 Thai News TH (Mod 99)\n/news               เปิดแผงข่าว 15 ข่าว\n/news <หมวด>         ${Object.entries(TOPICS).map(([k, v]) => `${k}=${v.label}`).join(', ')}\n/news band on|off   แถบข่าวเหนือช่องพิมพ์\n/news ask           ให้ Claude สรุปข่าวเด่น` }
    if (news.length === 0) {
      const err = await refresh($)
      if (err) return { text: `❌ ${err}` }
    }
    await $.ui.open({ id: PANE, title: `📰 ${TOPICS[topic]?.label ?? 'ข่าว'}` })
    const now = await $.clock.now()
    return { text: news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title} · ${n.source} ${ago(n.at, now)}`).join('\n') }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. กรองข่าวตามคำที่สนใจ เช่น AI, หุ้น, ทอง (ต่อกับ Mod 17)
 * 2. ซ่อนแถบข่าวตอน Claude ทำงาน ไม่ให้เสียสมาธิ (ต่อกับ turn.start)
 * 3. อ่านหัวข้อข่าวเป็นเสียงตอนเช้า (ต่อกับ Mod 98)
 */
