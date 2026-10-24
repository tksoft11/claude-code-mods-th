/**
 * ============================================================================
 * MOD 95: MD Preview TH - ดู Markdown ที่ Claude แก้แบบเรนเดอร์ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: md-preview ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. Claude แก้ไฟล์ .md (README, docs, CHANGELOG) แล้วดูผลแบบเรนเดอร์ในแผงข้าง
 *    หัวข้อ ตาราง โค้ด ลิงก์ เหมือนดูบน GitHub
 * 2. ดูก่อน / หลัง / เทียบสองฝั่ง (split) ได้
 * 3. /md <path> เปิดไฟล์ markdown ไหนก็ได้
 * 4. ตั้งให้เปิดแผงเองทุกครั้งที่ Claude แก้ .md ได้ (/md auto on)
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'md-preview-th'
const MD = /\.(md|markdown|mdx)$/i

type View = 'after' | 'before' | 'split'

let doc: { path: string; before: string; after: string } | undefined
let view: View = 'after'
let auto = false
let hinted = false
let root = ''

function rel(path: string): string {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  return r && p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : p
}

async function readText($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? ((await $.fs.read(path)) as string) : ''
}

async function open($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: `📄 ${doc ? rel(doc.path) : 'MD Preview'}` })
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    auto = ((await $.store.get('auto')) as boolean | undefined) ?? false
    doc = undefined
    hinted = false
    root = (await $.session.cwd()).replace(/[\\/]$/, '')
    await $.command.register({ name: 'md', description: 'ดู Markdown ที่ Claude แก้แบบเรนเดอร์ ก่อน/หลัง (/md help)', argumentHint: '<path> | before | after | split | auto on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 1: จับก่อนและหลัง Claude แก้ไฟล์ .md
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    if ((e.tool !== 'Edit' && e.tool !== 'Write') || !MD.test(e.file_path)) return next(e)
    const before = await readText($, e.file_path)
    const r = await next(e)
    if (r.deny !== undefined || r.isError) return r
    // แก้ไฟล์เดิมซ้ำ: เก็บ "ก่อน" ของครั้งแรกไว้ เทียบได้ทั้งชุด
    const keepBefore = doc?.path === e.file_path ? doc.before : before
    doc = { path: e.file_path, before: keepBefore, after: await readText($, e.file_path) }
    if (auto) await open($)
    else {
      $.ui.invalidate('ui.render')
      if (!hinted) {
        hinted = true
        $.ui.toast(`📄 Claude แก้ ${rel(e.file_path)} พิมพ์ /md เพื่อดูแบบเรนเดอร์`)
      }
    }
    return r
  })

  // ==========================================================================
  // บทที่ 2: วาดด้วย Markdown element ของ surface
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown } = $.ui.resolve(e)
    if (!doc) return <Text dimColor>ยังไม่มีไฟล์ markdown ที่ถูกแก้ ใช้ /md &lt;path&gt; เปิดไฟล์</Text>
    const side = (label: string, text: string, color: string) => (
      <Box flexDirection="column" flexGrow={1}>
        <Text color={color}>{label}</Text>
        {text.trim() ? <Markdown text={text.slice(0, 50_000)} /> : <Text dimColor>(ว่าง / ไฟล์ใหม่)</Text>}
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Text dimColor>{`${rel(doc.path)} · /md before | after | split`}</Text>
        {view === 'split' ? (
          <Box flexDirection="row" gap={2}>
            {side('◀ ก่อน', doc.before, '#ef9a9a')}
            {side('หลัง ▶', doc.after, '#a5d6a7')}
          </Box>
        ) : view === 'before' ? (
          side('◀ ก่อนแก้', doc.before, '#ef9a9a')
        ) : (
          side('หลังแก้ ▶', doc.after, '#a5d6a7')
        )}
      </Box>
    )
  })

  on('command.run', { command: 'md' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    if (sub === 'before' || sub === 'after' || sub === 'split') {
      view = sub
      await open($)
      return { text: `📄 มุมมอง: ${sub === 'split' ? 'เทียบสองฝั่ง' : sub === 'before' ? 'ก่อนแก้' : 'หลังแก้'}` }
    }
    if (sub === 'auto') {
      if (arg !== 'on' && arg !== 'off') return { text: 'วิธีใช้: /md auto on|off' }
      auto = arg === 'on'
      await $.store.set('auto', auto)
      return { text: `📄 เปิดแผงเองเมื่อ Claude แก้ .md: ${auto ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'help') return { text: '📄 MD Preview TH (Mod 95)\n/md               เปิดไฟล์ .md ล่าสุดที่ Claude แก้\n/md <path>        เปิดไฟล์ markdown ไหนก็ได้\n/md before|after|split  ก่อน / หลัง / เทียบสองฝั่ง\n/md auto on|off   เปิดแผงเองเมื่อ Claude แก้ .md' }
    if (sub) {
      const path = /^([A-Za-z]:[\\/]|\/)/.test(sub) ? sub : `${root}/${sub}`
      if (!(await $.fs.exists(path))) return { text: `ไม่พบไฟล์ ${sub}` }
      const text = await readText($, path)
      doc = { path, before: text, after: text }
      view = 'after'
    }
    if (!doc) return { text: 'ยังไม่มีไฟล์ markdown ที่ถูกแก้ ใช้ /md <path> เปิดไฟล์' }
    await open($)
    return { text: `📄 เปิด ${rel(doc.path)} ในแผงแล้ว` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ไฮไลต์ย่อหน้าที่เปลี่ยน (ใช้ diff จาก Mod 84)
 * 2. สารบัญจากหัวข้อ คลิกแล้วเลื่อนไปที่หัวข้อนั้น
 * 3. ตรวจลิงก์เสียในไฟล์ markdown
 */
