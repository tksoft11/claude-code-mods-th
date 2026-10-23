/**
 * ============================================================================
 * MOD 08: Terminal Browser TH - เปิดเว็บโดยไม่ต้องออกจาก Claude Code (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/zenbu-labs/terminal-browser
 *
 * หน้าที่ของ Mod นี้:
 * 1. /browser <url>          ให้ Claude เปิดเว็บ (WebFetch) แล้วสรุปเป็นภาษาไทย
 * 2. /browser raw <url>      ดึงหน้าเว็บเองด้วย $.http.fetch แล้วแสดงข้อความดิบ (ไม่ใช้ token)
 * 3. /browser fav [ชื่อ]     เว็บโปรดคนไทยสาย dev
 * 4. /browser search <คำ>    ให้ Claude ค้นเว็บแล้วสรุป
 * 5. /browser history        ประวัติเว็บที่เปิด (รวมที่ Claude เปิดเองด้วย WebFetch)
 */

import type { EngineInterface, Register } from 'claude-code'

interface HistoryItem {
  url: string
  time: number
  status: 'loading' | 'success' | 'error'
}

// ==========================================================================
// บทที่ 1: เก็บประวัติ (เก็บแค่ 20 รายการล่าสุด)
// ==========================================================================
let history: HistoryItem[] = []

function addToHistory(url: string, time: number): HistoryItem {
  const item: HistoryItem = { url, time, status: 'loading' }
  history.push(item)
  if (history.length > 20) history.shift()
  return item
}

// ==========================================================================
// บทที่ 2: เว็บโปรดคนไทย - แก้/เพิ่มได้ตามใจ
// ==========================================================================
const THAI_FAVORITES = [
  { name: 'Google TH', url: 'https://www.google.co.th' },
  { name: 'Pantip', url: 'https://pantip.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'MDN', url: 'https://developer.mozilla.org/th/' },
  { name: 'NPM', url: 'https://www.npmjs.com' },
  { name: 'React Docs', url: 'https://react.dev' },
  { name: 'Claude Code Docs', url: 'https://code.claude.com/docs' },
]

function timeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return sec < 60 ? `${sec}วิที่แล้ว` : sec < 3600 ? `${Math.floor(sec / 60)}นาทีที่แล้ว` : `${Math.floor(sec / 3600)}ชม.ที่แล้ว`
}

// รับ url แบบไม่มี https:// ก็ได้ เช่น react.dev
function normalizeUrl(input: string): string | undefined {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    return new URL(withScheme).href
  } catch {
    return undefined
  }
}

// ==========================================================================
// บทที่ 3: ให้ Claude ทำงานแทน - ส่ง prompt ใหม่ด้วย $.prompt.submit
// ==========================================================================
// prompt จะเริ่ม turn ใหม่เมื่อ session ว่าง จึงใช้ void (ไม่ต้องรอ)
function askClaudeToOpen($: EngineInterface, url: string): void {
  void $.prompt.submit({ text: `ใช้ WebFetch เปิด ${url} แล้วสรุปเนื้อหาหลักเป็นภาษาไทยแบบกระชับ` })
}

// ==========================================================================
// บทที่ 4: ดึงเว็บเองด้วย $.http.fetch แล้วตัด HTML ออกให้อ่านง่าย
// ==========================================================================
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    history = []
    await $.command.register({
      name: 'browser',
      description: 'เปิดเว็บ: /browser <url> | raw <url> | fav [ชื่อ] | search <คำ> | history',
      argumentHint: '<url>|raw|fav|search|history',
    })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: ดัก WebFetch ของ Claude เพื่อบันทึกประวัติ
  // ==========================================================================
  on('tool.call', { tool: 'WebFetch' }, async ($, e, next) => {
    const item = addToHistory(e.url, await $.clock.now())
    const ran = await next(e)
    item.status = ran.deny === undefined && !ran.isError ? 'success' : 'error'
    return ran
  })

  on('command.run', { command: 'browser' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...restWords] = args.split(/\s+/)
    const rest = restWords.join(' ')
    const now = await $.clock.now()

    if (sub === '') {
      return { text: 'วิธีใช้: /browser react.dev | /browser raw example.com | /browser fav github | /browser search วิธีใช้ Claude Code | /browser history' }
    }

    if (sub === 'history') {
      if (history.length === 0) return { text: '🌐 ยังไม่มีประวัติ' }
      const icon = { loading: '⏳', success: '✅', error: '❌' }
      const rows = [...history].reverse().map(h => `${icon[h.status]} ${h.url} (${timeAgo(now - h.time)})`)
      return { text: ['🌐 ประวัติการเปิดเว็บ', '----------------------------------------', ...rows].join('\n') }
    }

    if (sub === 'fav') {
      if (!rest) {
        const rows = THAI_FAVORITES.map(f => `⭐ ${f.name.padEnd(17)} ${f.url}`)
        return { text: ['⭐ เว็บโปรด (/browser fav <ชื่อ> เพื่อเปิด)', ...rows].join('\n') }
      }
      const found = THAI_FAVORITES.find(f => f.name.toLowerCase().includes(rest.toLowerCase()))
      if (!found) return { text: `❌ ไม่เจอเว็บโปรดชื่อ "${rest}"` }
      askClaudeToOpen($, found.url)
      return { text: `🌐 ให้ Claude เปิด ${found.name} (${found.url})` }
    }

    if (sub === 'search') {
      if (!rest) return { text: 'วิธีใช้: /browser search วิธีใช้ Claude Code' }
      void $.prompt.submit({ text: `ค้นเว็บเรื่อง "${rest}" แล้วสรุปผลเป็นภาษาไทย พร้อมลิงก์แหล่งที่มา` })
      return { text: `🔎 ให้ Claude ค้นหา: ${rest}` }
    }

    if (sub === 'raw') {
      const url = normalizeUrl(rest)
      if (!url) return { text: 'วิธีใช้: /browser raw https://example.com' }
      const item = addToHistory(url, now)
      try {
        const res = await $.http.fetch(url, { headers: { 'User-Agent': 'claude-code-terminal-browser-th' } })
        item.status = res.ok ? 'success' : 'error'
        const body = htmlToText(res.text)
        const cut = body.length > 3000 ? body.slice(0, 3000) + `\n... (ตัดเหลือ 3,000 จาก ${body.length.toLocaleString('en-US')} ตัวอักษร)` : body
        return { text: `🌐 ${url} [HTTP ${res.status}]\n----------------------------------------\n${cut}` }
      } catch (err) {
        item.status = 'error'
        return { text: `❌ เปิด ${url} ไม่ได้: ${String(err)}` }
      }
    }

    // ไม่ตรง subcommand ไหน = ถือว่าเป็น url
    const url = normalizeUrl(args)
    if (!url) return { text: `❌ "${args}" ไม่ใช่ URL ที่ถูกต้อง` }
    askClaudeToOpen($, url)
    return { text: `🌐 ให้ Claude เปิด ${url} และสรุปเป็นภาษาไทย` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ทำแผง (Pane) แสดงประวัติ มีปุ่มกดเปิดซ้ำ (ดูตัวอย่าง Pane ใน Mod 04)
 * 2. เก็บเว็บโปรดใน $.store ให้ผู้ใช้เพิ่มเองได้ด้วย /browser fav add <ชื่อ> <url>
 * 3. ใช้ $.model.complete แปลข้อความดิบจาก raw เป็นภาษาไทยโดยไม่เข้าบทสนทนาหลัก
 */
