/**
 * ============================================================================
 * MOD 30: Movie Finder TH - ค้นหนัง/ซีรีส์ ทำ watchlist และเปิดดูบนแพลตฟอร์ม (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Letterboxd, JustWatch
 *
 * หน้าที่ของ Mod นี้:
 * 1. ค้นหนังจาก Wikipedia (ไทย + อังกฤษ) และซีรีส์จาก TVmaze พร้อมเรื่องย่อ
 * 2. เปิดหน้าค้นหาบน Netflix, YouTube, Disney+, Prime Video, Apple TV หรือดูตัวอย่าง (trailer)
 * 3. Watchlist, บันทึกว่าดูแล้วพร้อมให้คะแนน, ประวัติ
 * 4. ให้ Claude แนะนำเรื่องต่อไปจากเรื่องที่ชอบ
 *
 * หมายเหตุ: Mod เล่นวิดีโอเองไม่ได้ และไม่รู้ว่าเรื่องไหนมีบนแพลตฟอร์มไหน (ไม่มี API สาธารณะ)
 * จึงเปิดหน้าค้นหาของแพลตฟอร์มนั้นให้ ต้องมีบัญชีของแพลตฟอร์มเอง
 */

import type { EngineInterface, Register } from 'claude-code'

interface Title {
  name: string
  kind: 'movie' | 'series'
  summary: string
  source: string
  year?: string
}
interface Entry {
  name: string
  kind: 'movie' | 'series'
  addedAt: number
  watchedAt?: number
  rating?: number // 1-10
}

const UA = { 'User-Agent': 'claude-code-movie-finder-th/1.0 (educational mod)' }
const PLATFORMS: Record<string, { name: string; url: (q: string) => string }> = {
  netflix: { name: 'Netflix', url: q => `https://www.netflix.com/search?q=${q}` },
  youtube: { name: 'YouTube', url: q => `https://www.youtube.com/results?search_query=${q}` },
  disney: { name: 'Disney+', url: q => `https://www.disneyplus.com/search?q=${q}` },
  prime: { name: 'Prime Video', url: q => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}` },
  apple: { name: 'Apple TV', url: q => `https://tv.apple.com/search?term=${q}` },
}

let list: Entry[] = []
let isWindows = false
let isMac = false

async function save($: EngineInterface): Promise<void> {
  await $.store.set('movies', list)
}

// ==========================================================================
// บทที่ 1: ค้นหนังจาก Wikipedia (กรองเฉพาะหน้าที่คำอธิบายบอกว่าเป็นภาพยนตร์)
// ==========================================================================
async function getJson($: EngineInterface, url: string): Promise<unknown> {
  const res = await $.http.fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text)
}

async function searchMovies($: EngineInterface, query: string): Promise<Title[]> {
  const isThai = /[฀-๿]/.test(query)
  const sites = isThai ? ['th', 'en'] : ['en', 'th']
  const found: Title[] = []
  for (const lang of sites) {
    const body = (await getJson($, `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=8`).catch(() => ({ pages: [] }))) as { pages: { title: string; description?: string | null }[] }
    for (const p of body.pages) {
      const d = p.description ?? ''
      if (!/film|movie|ภาพยนตร์|หนัง/i.test(d)) continue
      if (found.some(f => f.name === p.title)) continue
      const buddhistYear = /พ\.ศ\.\s*(\d{4})/.exec(d)?.[1] // วิกิไทยใช้ปี พ.ศ.
      found.push({ name: p.title, kind: 'movie', summary: d, source: `Wikipedia (${lang})`, year: buddhistYear ? `พ.ศ. ${buddhistYear}` : /\b(19|20)\d{2}\b/.exec(d)?.[0] })
    }
    if (found.length >= 5) break
  }
  return found.slice(0, 6)
}

// ==========================================================================
// บทที่ 2: ค้นซีรีส์จาก TVmaze (ฟรี ไม่ต้องใช้ key มีคะแนน แนว และช่อง/แพลตฟอร์ม)
// ==========================================================================
async function searchSeries($: EngineInterface, query: string): Promise<Title[]> {
  const body = (await getJson($, `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`)) as {
    show: { name: string; premiered?: string | null; genres?: string[]; rating?: { average?: number | null }; network?: { name?: string } | null; webChannel?: { name?: string } | null; summary?: string | null }
  }[]
  return body.slice(0, 6).map(({ show: s }) => ({
    name: s.name,
    kind: 'series' as const,
    year: s.premiered?.slice(0, 4),
    source: 'TVmaze',
    summary: [s.genres?.join('/'), s.rating?.average ? `⭐ ${s.rating.average}` : '', s.webChannel?.name ?? s.network?.name ?? '', (s.summary ?? '').replace(/<[^>]+>/g, '').slice(0, 140)].filter(Boolean).join(' · '),
  }))
}

// เรื่องย่อจาก Wikipedia
async function summaryOf($: EngineInterface, title: string): Promise<string> {
  for (const lang of /[฀-๿]/.test(title) ? ['th', 'en'] : ['en', 'th']) {
    const body = (await getJson($, `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`).catch(() => undefined)) as { title?: string; description?: string; extract?: string; content_urls?: { desktop?: { page?: string } } } | undefined
    if (body?.extract) return `🎬 ${body.title}\n${body.description ?? ''}\n\n${body.extract.slice(0, 700)}\n\n${body.content_urls?.desktop?.page ?? ''}`
  }
  return `ไม่พบเรื่องย่อของ "${title}" ลอง /movie search ${title}`
}

// ==========================================================================
// บทที่ 3: เปิดหน้าเว็บด้วย browser ของเครื่อง (ส่ง URL ผ่าน env กันคำสั่งแทรก)
// ==========================================================================
async function openUrl($: EngineInterface, url: string): Promise<void> {
  const argv = isWindows ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Start-Process $env:MF_URL'] : isMac ? ['open', url] : ['xdg-open', url]
  const r = await $.process.run(argv, { env: { MF_URL: url }, timeoutMs: 20_000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
}

function titleLine(t: Title, i: number): string {
  return `${i + 1}. ${t.kind === 'series' ? '📺' : '🎬'} ${t.name}${t.year ? ` (${t.year})` : ''}\n     ${t.summary}`
}

const HELP = `🎬 Movie Finder TH (Mod 30)
========================================
/movie search <ชื่อ>              ค้นหนัง (Wikipedia ไทย/อังกฤษ)
/movie series <ชื่อ>              ค้นซีรีส์ (TVmaze: แนว คะแนน ช่อง)
/movie info <ชื่อเรื่อง>           เรื่องย่อ
/movie watch <ชื่อ> [แพลตฟอร์ม]    เปิดหน้าค้นหา: ${Object.keys(PLATFORMS).join(' ')} (ค่าเริ่มต้น netflix)
/movie trailer <ชื่อ>             ค้นตัวอย่างบน YouTube
/movie add <ชื่อ> | remove <ชื่อ> | list      watchlist
/movie watched <ชื่อ> [คะแนน 1-10]          บันทึกว่าดูแล้ว
/movie history
/movie recommend                 ให้ Claude แนะนำจากเรื่องที่ให้คะแนนสูง`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    const saved = await $.store.get('movies')
    list = Array.isArray(saved) ? (saved as Entry[]) : []
    await $.command.register({ name: 'movie', description: 'ค้นหนัง/ซีรีส์ watchlist และเปิดดูบน Netflix YouTube ฯลฯ (/movie help)', argumentHint: 'search|series|info|watch|add|watched|recommend' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /movie
  // ==========================================================================
  on('command.run', { command: 'movie' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const query = rest.join(' ')
    const now = await $.clock.now()

    try {
      switch (sub) {
        case 'search':
        case 'series': {
          if (!query) return { text: `วิธีใช้: /movie ${sub} <ชื่อ>` }
          const results = sub === 'search' ? await searchMovies($, query) : await searchSeries($, query)
          if (results.length === 0) return { text: `ไม่พบ "${query}"${sub === 'search' ? ' (ถ้าเป็นซีรีส์ ลอง /movie series)' : ''}` }
          return { text: [`🔎 ผลค้นหา "${query}"`, ...results.map(titleLine), '', 'ดูเรื่องย่อ: /movie info <ชื่อ> | เปิดดู: /movie watch <ชื่อ>'].join('\n') }
        }
        case 'info':
          return { text: query ? await summaryOf($, query) : 'วิธีใช้: /movie info Inception' }
        case 'watch':
        case 'trailer': {
          const last = rest.at(-1)?.toLowerCase() ?? ''
          const platform = sub === 'trailer' ? 'youtube' : PLATFORMS[last] ? last : 'netflix'
          const name = sub === 'watch' && PLATFORMS[last] ? rest.slice(0, -1).join(' ') : query
          if (!name) return { text: `วิธีใช้: /movie ${sub} <ชื่อ>${sub === 'watch' ? ' [netflix|youtube|disney|prime|apple]' : ''}` }
          const p = PLATFORMS[platform] ?? PLATFORMS.netflix!
          const url = p.url(encodeURIComponent(sub === 'trailer' ? `${name} trailer` : name))
          await openUrl($, url)
          return { text: `▶️ เปิด${sub === 'trailer' ? 'ตัวอย่าง' : 'หน้าค้นหา'} "${name}" บน ${p.name}\n${url}` }
        }
        case 'add': {
          if (!query) return { text: 'วิธีใช้: /movie add <ชื่อ>' }
          if (list.some(x => x.name === query)) return { text: `ℹ️ "${query}" อยู่ใน watchlist แล้ว` }
          list.push({ name: query, kind: 'movie', addedAt: now })
          await save($)
          return { text: `➕ เพิ่ม "${query}" ใน watchlist แล้ว (${list.filter(x => !x.watchedAt).length} เรื่องรอดู)` }
        }
        case 'remove':
          list = list.filter(x => x.name !== query)
          await save($)
          return { text: `🗑️ เอา "${query}" ออกแล้ว` }
        case 'list': {
          const todo = list.filter(x => !x.watchedAt)
          return { text: todo.length ? ['📋 Watchlist (รอดู)', ...todo.map(x => `  • ${x.name}`)].join('\n') : 'Watchlist ว่าง เพิ่มด้วย /movie add <ชื่อ>' }
        }
        case 'watched': {
          const maybeRating = Number(rest.at(-1))
          const hasRating = Number.isInteger(maybeRating) && maybeRating >= 1 && maybeRating <= 10 && rest.length > 1
          const name = hasRating ? rest.slice(0, -1).join(' ') : query
          if (!name) return { text: 'วิธีใช้: /movie watched Inception 9' }
          const entry = list.find(x => x.name === name) ?? { name, kind: 'movie' as const, addedAt: now }
          entry.watchedAt = now
          if (hasRating) entry.rating = maybeRating
          list = [...list.filter(x => x.name !== name), entry]
          await save($)
          return { text: `✅ ดู "${name}" แล้ว${hasRating ? ` ให้ ${'⭐'.repeat(Math.round(maybeRating / 2))} ${maybeRating}/10` : ''}` }
        }
        case 'history': {
          const done = list.filter(x => x.watchedAt).sort((a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0))
          return { text: done.length ? ['🍿 ดูแล้ว', ...done.map(x => `  ${new Date(x.watchedAt ?? 0).toLocaleDateString('th-TH')}  ${x.name}${x.rating ? `  ${x.rating}/10` : ''}`)].join('\n') : 'ยังไม่มีประวัติ' }
        }
        case 'recommend': {
          const liked = list.filter(x => (x.rating ?? 0) >= 7).map(x => `${x.name} (${x.rating}/10)`)
          const disliked = list.filter(x => x.rating !== undefined && x.rating <= 4).map(x => x.name)
          if (liked.length === 0) return { text: 'ให้คะแนนเรื่องที่ชอบก่อน เช่น /movie watched Inception 9' }
          const ask = (model: string) =>
            $.model.complete({
              model,
              system: 'You recommend films and series. Answer in Thai. Suggest 5 real, well-known titles that are not in the lists given, each with the year and one short line on why it fits. Do not invent titles.',
              prompt: `Liked: ${liked.join(', ')}\nDisliked: ${disliked.join(', ') || 'none'}\nAlready seen or listed: ${list.map(x => x.name).join(', ')}`,
              maxTokens: 800,
            })
          // ใช้ haiku ก่อน ถ้าใช้ไม่ได้ (เช่น องค์กรไม่อนุญาต) ใช้ model ของ session
          let r = await ask('haiku').catch(() => undefined)
          if (!r?.isAnswered) r = await ask(await $.session.model())
          return { text: r.isAnswered ? `🎯 แนะนำจากเรื่องที่คุณชอบ\n${r.text.trim()}` : `❌ ขอคำแนะนำไม่สำเร็จ (${r.reason})` }
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
 * 1. ใช้ TMDB API (ต้องสมัครรับ key ฟรี) จะได้โปสเตอร์ คะแนน และรู้ว่าเรื่องไหนมีบนแพลตฟอร์มไหนในไทย
 * 2. แผงแสดง watchlist พร้อมปุ่มกดเปิดดู (ดูตัวอย่างปุ่มใน Mod 11)
 * 3. แจ้งเตือนเมื่อซีรีส์ที่ติดตามมีตอนใหม่ (TVmaze มีวันฉายตอนถัดไป)
 */
