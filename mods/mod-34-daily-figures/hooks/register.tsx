/**
 * ============================================================================
 * MOD 34: Daily Figures TH - บุคคลสำคัญประจำวันจาก Wikipedia (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: หน้า "On this day" ของ Wikipedia
 *
 * หน้าที่ของ Mod นี้:
 * 1. วันนี้ในประวัติศาสตร์มีใครเกิดบ้าง (ข้อมูลจริงจาก Wikipedia "On this day")
 * 2. เลือกบุคคลเด่นประจำวัน (นักวิทยาศาสตร์ นักประดิษฐ์ นักเขียน ผู้นำ ศิลปิน ...)
 * 3. ให้ Claude สรุปเป็นภาษาไทย: เขาเป็นใคร ทำอะไรสำคัญ และบทเรียนสำหรับ Dev
 * 4. ค้นประวัติบุคคลอื่น, เหตุการณ์สำคัญวันนี้, บันทึกคนที่ชอบ
 *
 * หมายเหตุ: API "On this day" รองรับเฉพาะ Wikipedia ภาษาอังกฤษ จึงดึงจากฉบับอังกฤษแล้วให้ Claude สรุปเป็นไทย
 */

import type { EngineInterface, Register } from 'claude-code'

interface Person {
  name: string
  year: number
  text: string // ข้อความสั้นจาก Wikipedia
  description: string
  extract: string
  url: string
}

const UA = { 'User-Agent': 'claude-code-daily-figures-th/1.0 (educational mod)' }
// อาชีพที่ถือว่า "สร้างแรงบันดาลใจ" ใช้คัดเลือกคนประจำวัน
// \b = ต้องตรงทั้งคำ (ไม่ให้ "songwriter" ตรงกับ writer หรือ "artistic" ตรงกับ artist)
const INSPIRING = /\b(scientist|physicist|chemist|mathematician|inventor|engineer|computer scientist|programmer|astronomer|biologist|physician|philosopher|writer|novelist|poet|composer|painter|artist|architect|explorer|entrepreneur|businessman|economist|president|prime minister|king|queen|emperor|activist|educator|nobel)\b/i

let favorites: { name: string; year: number }[] = []
let cache: { key: string; people: Person[] } | undefined

// ==========================================================================
// บทที่ 1: ดึงรายชื่อคนที่เกิดวันนี้ (เดือน/วัน) จาก Wikimedia API
// ==========================================================================
async function bornOn($: EngineInterface, month: number, day: number): Promise<Person[]> {
  const key = `${month}/${day}`
  if (cache?.key === key) return cache.people
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const res = await $.http.fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/births/${mm}/${dd}`, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = JSON.parse(res.text) as { births?: { year: number; text: string; pages?: { description?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }[] }[] }
  const people = (body.births ?? []).map(b => {
    const p = b.pages?.[0]
    return { name: b.text.split(',')[0] ?? b.text, year: b.year, text: b.text, description: p?.description ?? '', extract: p?.extract ?? '', url: p?.content_urls?.desktop?.page ?? '' }
  })
  cache = { key, people }
  return people
}

// ==========================================================================
// บทที่ 2: เลือกคนประจำวัน - คัดอาชีพที่น่าสนใจ แล้วเลือกตามวันที่ (ได้คนเดิมทั้งวัน)
// ==========================================================================
// อาชีพที่คำตรงกันแต่ไม่ใช่ความหมายที่ต้องการ เช่น "martial artist", "musical artist"
const EXCLUDE = /martial artist|musical artist|storyboard artist|voice actor|actress|singer|gymnast|footballer|wrestler/i

function candidates(people: Person[]): Person[] {
  return people.filter(p => INSPIRING.test(`${p.description} ${p.text}`) && !EXCLUDE.test(p.description) && p.extract.length > 200)
}

function pickOfDay(people: Person[], now: number): Person | undefined {
  const list = candidates(people)
  const d = new Date(now)
  return list[(d.getFullYear() * 31 + d.getDate()) % Math.max(1, list.length)]
}

// ==========================================================================
// บทที่ 3: ให้ Claude สรุปเป็นไทย + บทเรียน (ใช้เฉพาะข้อมูลจาก Wikipedia)
// ==========================================================================
async function thaiStory($: EngineInterface, p: Person): Promise<string> {
  const system = 'You write short, accurate summaries of real people for Thai software developers. Write the whole answer in Thai (ภาษาไทย); keep names in their original spelling. Use only the facts in the text given; do not add facts. Format: 1) who they are (1-2 sentences) 2) what they did that mattered (2-3 bullets) 3) one lesson a developer can take from their life (1-2 sentences, marked as ข้อคิด).'
  const prompt = `สรุปเป็นภาษาไทย:\n\n${p.name}${p.year ? ` (born ${p.year})` : ''}\n${p.description}\n\n${p.extract}`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens: 900 }).catch(() => undefined)
    if (r?.isAnswered) return r.text.trim()
  }
  return p.extract // ใช้ model ไม่ได้ ก็แสดงต้นฉบับภาษาอังกฤษ
}

async function personCard($: EngineInterface, p: Person, now: number): Promise<string> {
  const born = p.year ? ` (เกิด ค.ศ. ${p.year}, ${new Date(now).getFullYear() - p.year} ปีที่แล้ว)` : ''
  return [`🌟 ${p.name}${born}`, p.description, '', await thaiStory($, p), '', `อ่านต่อ: ${p.url}`].join('\n')
}

async function searchPerson($: EngineInterface, name: string): Promise<Person | undefined> {
  const res = await $.http.fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`, { headers: UA }).catch(() => undefined)
  if (!res?.ok) return undefined
  const b = JSON.parse(res.text) as { title?: string; description?: string; extract?: string; type?: string; content_urls?: { desktop?: { page?: string } } }
  if (!b.extract || b.type === 'disambiguation') return undefined
  // ปีเกิดมักอยู่ใน description เช่น "English mathematician (1815–1852)"; หาไม่เจอ = 0 (ไม่แสดง)
  const year = Number(/\((?:born )?(\d{3,4})/.exec(b.description ?? '')?.[1] ?? /\(born[^)]*?(\d{4})\)/.exec(b.extract)?.[1] ?? 0)
  return { name: b.title ?? name, year, text: b.title ?? name, description: b.description ?? '', extract: b.extract, url: b.content_urls?.desktop?.page ?? '' }
}

const HELP = `🌟 Daily Figures TH (Mod 34)
========================================
/figure                   บุคคลสำคัญประจำวันนี้ (สรุปไทยโดย Claude)
/figure list              ทุกคนที่เกิดวันนี้ (คัดเฉพาะอาชีพน่าสนใจ)
/figure random            สุ่มอีกคนที่เกิดวันนี้
/figure date <วัน/เดือน>   ดูวันอื่น เช่น /figure date 9/1
/figure search <ชื่อ>      ประวัติคนที่สนใจ (ชื่อภาษาอังกฤษ เช่น Ada Lovelace)
/figure fav [ชื่อ]         บันทึก/ดูคนที่ชอบ`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('favorites')
    favorites = Array.isArray(saved) ? (saved as typeof favorites) : []
    await $.command.register({ name: 'figure', description: 'บุคคลสำคัญประจำวันจาก Wikipedia สรุปไทย (/figure help)', argumentHint: 'list|random|date|search|fav' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /figure
  // ==========================================================================
  on('command.run', { command: 'figure' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    const d = new Date(now)
    try {
      switch (sub) {
        case '':
        case 'today': {
          const p = pickOfDay(await bornOn($, d.getMonth() + 1, d.getDate()), now)
          return { text: p ? await personCard($, p, now) : 'ไม่พบข้อมูลวันนี้' }
        }
        case 'list': {
          const list = candidates(await bornOn($, d.getMonth() + 1, d.getDate()))
          return { text: [`📜 คนสำคัญที่เกิดวันที่ ${d.getDate()}/${d.getMonth() + 1} (${list.length} คน)`, ...list.slice(0, 40).map(p => `  ${p.year}  ${p.name} - ${p.description}`)].join('\n') }
        }
        case 'random': {
          const list = candidates(await bornOn($, d.getMonth() + 1, d.getDate()))
          const p = list[Math.floor(Math.random() * list.length)]
          return { text: p ? await personCard($, p, now) : 'ไม่พบข้อมูล' }
        }
        case 'date': {
          const m = /^(\d{1,2})\/(\d{1,2})$/.exec(rest[0] ?? '')
          if (!m) return { text: 'วิธีใช้: /figure date 9/1  (วัน/เดือน)' }
          const people = await bornOn($, Number(m[2]), Number(m[1]))
          const p = pickOfDay(people, new Date(d.getFullYear(), Number(m[2]) - 1, Number(m[1])).getTime())
          return { text: p ? await personCard($, p, now) : 'ไม่พบข้อมูลวันนั้น' }
        }
        case 'search': {
          const name = rest.join(' ')
          if (!name) return { text: 'วิธีใช้: /figure search Ada Lovelace' }
          const p = await searchPerson($, name)
          return { text: p ? await personCard($, p, now) : `ไม่พบ "${name}" ลองพิมพ์ชื่อเต็มภาษาอังกฤษ` }
        }
        case 'fav': {
          const name = rest.join(' ')
          if (!name) return { text: favorites.length ? ['⭐ คนที่ชอบ', ...favorites.map(f => `  ${f.name} (${f.year})`)].join('\n') : 'ยังไม่มี /figure fav <ชื่อ>' }
          favorites = favorites.some(f => f.name === name) ? favorites.filter(f => f.name !== name) : [...favorites, { name, year: 0 }]
          await $.store.set('favorites', favorites)
          return { text: favorites.some(f => f.name === name) ? `⭐ บันทึก ${name} แล้ว` : `☆ เอา ${name} ออกแล้ว` }
        }
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
 * 1. ดึงเหตุการณ์สำคัญวันนี้ด้วย endpoint onthisday/events (โครงสร้างเดียวกัน)
 * 2. แสดงบุคคลประจำวันอัตโนมัติตอนเปิด Claude Code ครั้งแรกของวัน (ดูวิธีใน Mod 32)
 * 3. เน้นบุคคลในวงการคอมพิวเตอร์: กรองด้วย description ที่มีคำว่า computer/programmer
 */
