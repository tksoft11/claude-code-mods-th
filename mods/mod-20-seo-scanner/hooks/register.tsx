/**
 * ============================================================================
 * MOD 20: SEO Scanner TH - ตรวจ SEO ของหน้าเว็บจริง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Lighthouse SEO audit และ Google Search Central
 *
 * หน้าที่ของ Mod นี้:
 * 1. /seo <url> ดึงหน้าเว็บจริงแล้วตรวจ 15+ ข้อ ให้คะแนน 0-100 พร้อมวิธีแก้
 * 2. ตรวจ title, meta description, H1, alt รูป, lang, viewport, canonical, OG/Twitter tags,
 *    structured data (JSON-LD), robots.txt, sitemap.xml, noindex, ขนาดหน้าและเวลาโหลด
 * 3. /seo links <url> ตรวจลิงก์เสีย (สูงสุด 30 ลิงก์)
 * 4. /seo compare เทียบหลายเว็บ, /seo export บันทึกรายงานเป็น Markdown
 *
 * ข้อจำกัด: อ่าน HTML ที่เซิร์ฟเวอร์ส่งมา (ไม่รัน JavaScript) เว็บที่สร้างหน้าด้วย JS ล้วนอาจได้คะแนนต่ำกว่าจริง
 */

import type { EngineInterface, Register } from 'claude-code'

type Status = 'pass' | 'warn' | 'fail'
interface Check {
  name: string
  status: Status
  detail: string
  fix?: string
  weight: number
}
interface Report {
  url: string
  finalUrl: string
  status: number
  ms: number
  bytes: number
  checks: Check[]
  score: number
  at: number
}

const ICON: Record<Status, string> = { pass: '✅', warn: '🟡', fail: '❌' }
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; claude-code-seo-scanner-th)' }
let reports: Report[] = []

// ==========================================================================
// บทที่ 1: อ่านค่าจาก HTML ด้วย regex (ไม่มี DOM ใน Mod)
// ==========================================================================
function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

function tagText(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map(m => decode((m[1] ?? '').replace(/<[^>]+>/g, '')))
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined
}

// <meta name="description" content="..."> หรือ <meta property="og:title" ...>
function meta(html: string, key: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    if ((attr(tag, 'name') ?? attr(tag, 'property'))?.toLowerCase() === key) return attr(tag, 'content')
  }
  return undefined
}

function link(html: string, rel: string): string | undefined {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attr(m[0], 'rel')?.toLowerCase().split(/\s+/).includes(rel)) return attr(m[0], 'href')
  }
  return undefined
}

// ==========================================================================
// บทที่ 2: เกณฑ์ตรวจแต่ละข้อ (ความยาวอิงคำแนะนำทั่วไปของ Google)
// ==========================================================================
function check(name: string, ok: boolean | 'warn', detail: string, fix: string, weight: number): Check {
  return { name, status: ok === true ? 'pass' : ok === 'warn' ? 'warn' : 'fail', detail, fix: ok === true ? undefined : fix, weight }
}

function auditHtml(html: string, url: URL): Check[] {
  const checks: Check[] = []
  const title = tagText(html, 'title')[0] ?? ''
  checks.push(check('Title', title.length >= 15 && title.length <= 65 ? true : title ? 'warn' : false, title ? `"${title.slice(0, 70)}" (${title.length} ตัว)` : 'ไม่มี <title>', 'ใส่ title 15-65 ตัวอักษร มีคีย์เวิร์ดหลัก', 15))

  const desc = meta(html, 'description') ?? ''
  checks.push(check('Meta description', desc.length >= 50 && desc.length <= 160 ? true : desc ? 'warn' : false, desc ? `${desc.length} ตัว` : 'ไม่มี', 'ใส่ <meta name="description"> 50-160 ตัวอักษร สรุปเนื้อหาหน้า', 10))

  const h1 = tagText(html, 'h1')
  checks.push(check('H1', h1.length === 1 ? true : h1.length > 1 ? 'warn' : false, h1.length ? `${h1.length} อัน: "${(h1[0] ?? '').slice(0, 50)}"` : 'ไม่มี H1', 'ควรมี H1 หนึ่งอันต่อหน้า', 10))

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
  const noAlt = imgs.filter(t => attr(t, 'alt') === undefined)
  checks.push(check('Alt ของรูป', noAlt.length === 0 ? true : noAlt.length <= imgs.length / 4 ? 'warn' : false, `${imgs.length - noAlt.length}/${imgs.length} รูปมี alt`, 'ใส่ alt อธิบายรูปทุกรูป (รูปตกแต่งใส่ alt="")', 10))

  const lang = /<html\b[^>]*\blang\s*=\s*["']?([\w-]+)/i.exec(html)?.[1]
  checks.push(check('ภาษา (lang)', Boolean(lang), lang ?? 'ไม่ระบุ', 'ใส่ <html lang="th">', 5))

  const viewport = meta(html, 'viewport')
  checks.push(check('Mobile viewport', Boolean(viewport?.includes('width=device-width')), viewport ?? 'ไม่มี', 'ใส่ <meta name="viewport" content="width=device-width, initial-scale=1">', 10))

  const canonical = link(html, 'canonical')
  checks.push(check('Canonical', canonical ? true : 'warn', canonical ?? 'ไม่มี', 'ใส่ <link rel="canonical"> กันเนื้อหาซ้ำ', 5))

  const og = ['og:title', 'og:description', 'og:image'].filter(k => !meta(html, k))
  checks.push(check('Open Graph (แชร์ Facebook/LINE)', og.length === 0 ? true : og.length < 3 ? 'warn' : false, og.length ? `ขาด ${og.join(', ')}` : 'ครบ', 'ใส่ og:title, og:description, og:image ให้แชร์แล้วมีรูปและหัวข้อ', 10))

  const twitter = meta(html, 'twitter:card')
  checks.push(check('Twitter card', twitter ? true : 'warn', twitter ?? 'ไม่มี', 'ใส่ <meta name="twitter:card" content="summary_large_image">', 3))

  const jsonLd = (html.match(/<script[^>]+application\/ld\+json/gi) ?? []).length
  checks.push(check('Structured data (JSON-LD)', jsonLd > 0 ? true : 'warn', jsonLd ? `${jsonLd} ชุด` : 'ไม่มี', 'ใส่ JSON-LD ของ schema.org (เช่น Organization, Product) ช่วยให้ Google แสดงผลพิเศษ', 5))

  const robotsMeta = meta(html, 'robots') ?? ''
  checks.push(check('ไม่ถูกบล็อกจาก Google', !/noindex/i.test(robotsMeta), robotsMeta || 'ไม่มี meta robots (index ได้)', 'เอา noindex ออกถ้าต้องการให้หน้านี้ขึ้น Google', 15))

  checks.push(check('HTTPS', url.protocol === 'https:', url.protocol, 'ใช้ HTTPS (Google ให้คะแนนเว็บที่ปลอดภัย)', 10))
  return checks
}

// ==========================================================================
// บทที่ 3: ดึงหน้าเว็บ + robots.txt + sitemap แล้วรวมคะแนน
// ==========================================================================
async function scan($: EngineInterface, input: string): Promise<Report> {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  const start = await $.clock.now()
  const res = await $.http.fetch(url.href, { headers: UA })
  const ms = (await $.clock.now()) - start
  const bytes = new TextEncoder().encode(res.text).length
  const checks = res.ok ? auditHtml(res.text, url) : []
  checks.unshift(check('หน้าเว็บตอบกลับ', res.ok, `HTTP ${res.status}`, 'หน้าเว็บต้องตอบ 200', 20))
  checks.push(check('ความเร็วโหลด HTML', ms < 1000 ? true : ms < 3000 ? 'warn' : false, `${ms} ms`, 'ลดเวลาตอบของเซิร์ฟเวอร์ ใช้ cache/CDN', 5))
  checks.push(check('ขนาด HTML', bytes < 300_000 ? true : bytes < 1_000_000 ? 'warn' : false, `${(bytes / 1024).toFixed(0)} KB`, 'ลดขนาด HTML (ย้าย inline script/style ออก)', 3))

  const robots = await $.http.fetch(`${url.origin}/robots.txt`, { headers: UA }).catch(() => undefined)
  const hasRobots = Boolean(robots?.ok && /user-agent/i.test(robots.text))
  checks.push(check('robots.txt', hasRobots ? true : 'warn', hasRobots ? 'มี' : 'ไม่มี', 'สร้าง /robots.txt และระบุ Sitemap:', 3))
  const sitemapUrl = /^\s*sitemap:\s*(\S+)/im.exec(robots?.text ?? '')?.[1] ?? `${url.origin}/sitemap.xml`
  const sitemap = await $.http.fetch(sitemapUrl, { headers: UA }).catch(() => undefined)
  const hasSitemap = Boolean(sitemap?.ok && /<(urlset|sitemapindex)/i.test(sitemap.text))
  checks.push(check('sitemap.xml', hasSitemap ? true : 'warn', hasSitemap ? sitemapUrl : 'ไม่พบ', 'สร้าง sitemap.xml แล้วส่งใน Google Search Console', 5))

  // คะแนน: ผ่าน = เต็ม, เตือน = ครึ่ง, ไม่ผ่าน = 0
  const total = checks.reduce((s, c) => s + c.weight, 0)
  const got = checks.reduce((s, c) => s + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight / 2 : 0), 0)
  return { url: input, finalUrl: url.href, status: res.status, ms, bytes, checks, score: Math.round((got / total) * 100), at: await $.clock.now() }
}

function grade(score: number): string {
  return score >= 90 ? '🟢 ดีมาก' : score >= 70 ? '🟡 พอใช้' : score >= 50 ? '🟠 ควรปรับ' : '🔴 ต้องแก้ด่วน'
}

function reportText(r: Report): string {
  const fails = r.checks.filter(c => c.status !== 'pass').sort((a, b) => b.weight - a.weight)
  return [
    `🔍 SEO: ${r.finalUrl}`,
    `คะแนน ${r.score}/100 ${grade(r.score)} | HTTP ${r.status} | ${r.ms} ms | ${(r.bytes / 1024).toFixed(0)} KB`,
    '----------------------------------------',
    ...r.checks.map(c => `${ICON[c.status]} ${c.name}: ${c.detail}`),
    ...(fails.length ? ['', '💡 แก้ก่อน (เรียงตามผลต่อคะแนน):', ...fails.slice(0, 6).map((c, i) => `  ${i + 1}. ${c.fix}`)] : ['', '🎉 ผ่านทุกข้อ']),
  ].join('\n')
}

// ==========================================================================
// บทที่ 4: ตรวจลิงก์เสีย (ขอพร้อมกันทีละ 5 ลิงก์ ไม่ยิงเว็บเขาหนักเกิน)
// ==========================================================================
async function checkLinks($: EngineInterface, input: string): Promise<string> {
  const base = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  const res = await $.http.fetch(base.href, { headers: UA })
  const hrefs = [...res.text.matchAll(/<a\b[^>]*>/gi)].map(m => attr(m[0], 'href')).filter((h): h is string => Boolean(h) && !/^(#|mailto:|tel:|javascript:)/i.test(h ?? ''))
  const urls = [...new Set(hrefs.map(h => { try { return new URL(h, base).href } catch { return '' } }).filter(Boolean))].slice(0, 30)
  const broken: string[] = []
  for (let i = 0; i < urls.length; i += 5) {
    await Promise.all(
      urls.slice(i, i + 5).map(async u => {
        const r = await $.http.fetch(u, { headers: UA }).catch(() => undefined)
        if (!r || r.status >= 400) broken.push(`${r ? r.status : 'error'}  ${u}`)
      }),
    )
  }
  return [`🔗 ตรวจ ${urls.length} ลิงก์${hrefs.length > 30 ? ` (จาก ${hrefs.length})` : ''}: เสีย ${broken.length}`, ...broken.map(b => `  ❌ ${b}`)].join('\n')
}

const HELP = `🔍 SEO Scanner TH (Mod 20)
========================================
/seo <url>               ตรวจ SEO ให้คะแนน 0-100 พร้อมวิธีแก้
/seo links <url>         ตรวจลิงก์เสีย (สูงสุด 30 ลิงก์)
/seo compare <url> <url> เทียบคะแนนหลายเว็บ
/seo list                ผลที่ตรวจไว้
/seo export              บันทึกรายงานล่าสุดเป็น seo-report.md`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    reports = []
    await $.command.register({ name: 'seo', description: 'ตรวจ SEO ของหน้าเว็บ (/seo <url>)', argumentHint: '<url>|links|compare|export' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /seo
  // ==========================================================================
  on('command.run', { command: 'seo' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    try {
      switch (sub) {
        case 'help':
          return { text: HELP }
        case 'links':
          return { text: rest[0] ? await checkLinks($, rest[0]) : 'วิธีใช้: /seo links https://example.com' }
        case 'compare': {
          if (rest.length < 2) return { text: 'วิธีใช้: /seo compare https://a.com https://b.com' }
          const results = await Promise.all(rest.slice(0, 5).map(u => scan($, u).catch(err => ({ url: u, score: -1, error: String(err) }))))
          for (const r of results) if ('checks' in r) reports.push(r)
          return { text: ['📊 เทียบคะแนน SEO', ...results.sort((a, b) => b.score - a.score).map(r => ('checks' in r ? `  ${String(r.score).padStart(3)} ${grade(r.score)}  ${r.url}` : `  ❌ ${r.url}: ${r.error}`))].join('\n') }
        }
        case 'list':
          return { text: reports.length ? ['📋 ผลที่ตรวจไว้', ...reports.map(r => `  ${r.score} ${grade(r.score)}  ${r.finalUrl}`)].join('\n') : 'ยังไม่ได้ตรวจ ลอง /seo https://example.com' }
        case 'export': {
          const last = reports.at(-1)
          if (!last) return { text: 'ยังไม่ได้ตรวจ' }
          const root = (await $.session.cwd()).replace(/[\\/]$/, '')
          const path = `${root}${root.includes('\\') ? '\\' : '/'}seo-report.md`
          await $.fs.write(path, `# SEO Report\n\n\`\`\`\n${reportText(last)}\n\`\`\`\n`)
          return { text: `💾 บันทึกแล้ว: ${path}` }
        }
        default: {
          const r = await scan($, sub)
          reports = [...reports.filter(x => x.finalUrl !== r.finalUrl), r].slice(-20)
          return { text: reportText(r) }
        }
      }
    } catch (err) {
      return { text: `❌ ตรวจไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. วัด Core Web Vitals จริงด้วย PageSpeed Insights API (ต้องใช้ API key ของ Google)
 * 2. ให้ Claude ช่วยเขียน title/description ใหม่: $.model.complete จากเนื้อหาหน้าเว็บ
 * 3. ตรวจทั้งเว็บ: อ่าน sitemap.xml แล้ววนตรวจทุกหน้า
 */
