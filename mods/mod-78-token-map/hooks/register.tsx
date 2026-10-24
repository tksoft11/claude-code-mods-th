/**
 * ============================================================================
 * MOD 78: Token Map TH - แผนที่ความร้อนของ token (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: WinDirStat (ดูว่าอะไรกินดิสก์) แต่ดูว่าอะไรกิน context ของ Claude
 *
 * หน้าที่ของ Mod นี้:
 * 1. /tokenmap [โฟลเดอร์] - ประเมิน token ของทุกไฟล์ในโปรเจกต์ (ถ้าให้ Claude อ่านทั้งไฟล์)
 *    แสดงเป็นแท่งความร้อนต่อโฟลเดอร์ + 10 ไฟล์ที่ใหญ่สุด เทียบกับขนาด context
 * 2. /tokenmap session - ไฟล์ที่ Claude อ่านจริงใน session นี้ กินไปกี่ token (นับจากผลลัพธ์ Read)
 * 3. ชี้ไฟล์ที่ไม่ควรให้อ่าน (lock file, ไฟล์ build, ไฟล์ minified) แนะนำใส่ .claudeignore / permissions
 *
 * ค่าประมาณ: ไบต์ / 3.5 (โค้ดภาษาอังกฤษประมาณ 3.5-4 ตัวอักษรต่อ token, ภาษาไทยหนักกว่านี้)
 */

import type { EngineInterface, Register } from 'claude-code'

interface FileInfo {
  path: string
  bytes: number
}

const PANE = 'token-map-th'
const SKIP_DIR = /^(?:node_modules|\.git|\.next|\.nuxt|\.turbo|\.cache|__pycache__|\.venv|venv|target|vendor)$/
const NOISY = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|go\.sum)$|\.min\.(?:js|css)$|\.map$|(?:^|\/)(?:dist|build|out|coverage)\//
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp[34]|wav|exe|dll|so|dylib|bin|lockb|db|sqlite)$/i
const CONTEXT = 200_000

let lastMap: { title: string; rows: { label: string; tokens: number; noisy?: boolean }[] } | undefined
const readCost = new Map<string, number>() // ไฟล์ที่ Claude อ่านใน session นี้ -> token รวม

function tokens(bytes: number): number {
  return Math.round(bytes / 3.5)
}

function fmt(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// ==========================================================================
// บทที่ 1: เดินโฟลเดอร์ เก็บขนาดไฟล์ (ไม่อ่านเนื้อไฟล์ จึงเร็ว)
// ==========================================================================
async function walk($: EngineInterface, dir: string, rel: string, out: FileInfo[]): Promise<void> {
  if (out.length > 8000) return
  const entries = await $.fs.list(dir).catch(() => [])
  for (const e of entries) {
    if (e.kind === 'dir') {
      if (!SKIP_DIR.test(e.name)) await walk($, `${dir}/${e.name}`, rel ? `${rel}/${e.name}` : e.name, out)
    } else if (e.kind === 'file' && !BINARY.test(e.name)) out.push({ path: rel ? `${rel}/${e.name}` : e.name, bytes: e.size })
  }
}

function heat(share: number): string {
  return share > 0.25 ? '#ef5350' : share > 0.1 ? '#ffa726' : share > 0.03 ? '#ffee58' : '#66bb6a'
}

async function projectMap($: EngineInterface, folder: string): Promise<string> {
  const root = (await $.session.root()).replace(/\\/g, '/').replace(/\/$/, '')
  const base = folder ? `${root}/${folder.replace(/\\/g, '/').replace(/^\.\/|\/$/g, '')}` : root
  const files: FileInfo[] = []
  await walk($, base, '', files)
  if (files.length === 0) return `ไม่พบไฟล์ใน ${folder || 'โปรเจกต์นี้'}`
  const total = files.reduce((s, f) => s + tokens(f.bytes), 0)
  // รวมตามโฟลเดอร์ชั้นแรก
  const byDir = new Map<string, number>()
  for (const f of files) {
    const top = f.path.includes('/') ? `${f.path.split('/')[0]}/` : '(ไฟล์ชั้นบน)'
    byDir.set(top, (byDir.get(top) ?? 0) + tokens(f.bytes))
  }
  const dirs = [...byDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  const big = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 10)
  const noisy = files.filter(f => NOISY.test(f.path))
  const noisyTokens = noisy.reduce((s, f) => s + tokens(f.bytes), 0)
  lastMap = {
    title: `${folder || 'ทั้งโปรเจกต์'} · ${files.length} ไฟล์ · ~${fmt(total)} token`,
    rows: [...dirs.map(([label, t]) => ({ label, tokens: t })), ...big.map(f => ({ label: `  ${f.path}`, tokens: tokens(f.bytes), noisy: NOISY.test(f.path) }))],
  }
  const max = Math.max(...dirs.map(([, t]) => t))
  const lines = [
    `🌡️ ${lastMap.title} (= ${(total / CONTEXT).toFixed(1)} เท่าของ context 200k)`,
    '',
    '📁 ตามโฟลเดอร์',
    ...dirs.map(([d, t]) => `  ${d.padEnd(22)} ${fmt(t).padStart(7)}  ${'█'.repeat(Math.max(1, Math.round((t / max) * 24)))}`),
    '',
    '📄 ไฟล์ที่ใหญ่สุด (ถ้าให้ Claude อ่านทั้งไฟล์)',
    ...big.map(f => `  ${fmt(tokens(f.bytes)).padStart(7)}  ${f.path}${NOISY.test(f.path) ? '  ⚠️ ไม่ควรให้อ่าน' : tokens(f.bytes) > 25_000 ? '  ⚠️ ใหญ่: ให้อ่านทีละช่วง' : ''}`),
  ]
  if (noisy.length) {
    lines.push('', `🧹 ไฟล์ lock/build/minified ${noisy.length} ไฟล์ รวม ~${fmt(noisyTokens)} token ไม่ควรให้ Claude อ่าน`, '   กันไว้ได้ใน .claude/settings.json → permissions.deny เช่น "Read(./package-lock.json)"')
  }
  return lines.join('\n')
}

function sessionMap(): string {
  if (readCost.size === 0) return '📭 session นี้ Claude ยังไม่ได้อ่านไฟล์'
  const rows = [...readCost.entries()].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((s, [, t]) => s + t, 0)
  lastMap = { title: `ไฟล์ที่ Claude อ่านใน session นี้ · ~${fmt(total)} token`, rows: rows.slice(0, 22).map(([p, t]) => ({ label: p.split(/[\\/]/).slice(-2).join('/'), tokens: t })) }
  const max = rows[0]?.[1] ?? 1
  return [`📖 ${lastMap.title}`, ...rows.slice(0, 20).map(([p, t]) => `  ${fmt(t).padStart(7)}  ${'█'.repeat(Math.max(1, Math.round((t / max) * 20))).padEnd(20)}  ${p.split(/[\\/]/).slice(-2).join('/')}`)].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    readCost.clear()
    await $.command.register({ name: 'tokenmap', description: 'แผนที่ความร้อนของ token: ไฟล์ไหนกิน context มาก (/tokenmap [โฟลเดอร์] | session)', argumentHint: '[โฟลเดอร์]|session' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: นับ token จริงของสิ่งที่ Claude อ่าน (ความยาวผลลัพธ์ Read ที่โมเดลได้)
  // ==========================================================================
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && !r.isError && r.text) readCost.set(e.file_path, (readCost.get(e.file_path) ?? 0) + Math.round(r.text.length / 3.5))
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!lastMap) return <Text dimColor>/tokenmap</Text>
    const max = Math.max(...lastMap.rows.map(r => r.tokens), 1)
    const width = Math.max(10, Math.min(30, e.props.bodyColumns - 40))
    return (
      <Box flexDirection="column">
        <Text bold>{`🌡️ ${lastMap.title}`}</Text>
        {lastMap.rows.map(r => (
          <Text wrap="truncate-end">
            {`${fmt(r.tokens).padStart(7)} `}
            <Text color={r.noisy ? '#ab47bc' : heat(r.tokens / CONTEXT)}>{'█'.repeat(Math.max(1, Math.round((r.tokens / max) * width))).padEnd(width)}</Text>
            {` ${r.label}`}
          </Text>
        ))}
        <Text dimColor>สี: เขียว &lt;3% · เหลือง &lt;10% · ส้ม &lt;25% · แดง ≥25% ของ context 200k · ม่วง = ไม่ควรให้อ่าน</Text>
      </Box>
    )
  })

  on('command.run', { command: 'tokenmap' }, async ($, e) => {
    const arg = e.args.trim()
    const text = arg === 'session' ? sessionMap() : await projectMap($, arg)
    if (lastMap) {
      await $.ui.open({ id: PANE, title: '🌡️ Token Map' })
      $.ui.invalidate('ui.render')
    }
    return { text }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. นับ token จริงด้วย API count_tokens แทนการประมาณ
 * 2. สร้างรายการ permissions.deny ให้อัตโนมัติจากไฟล์ที่ไม่ควรอ่าน
 * 3. เตือนก่อน Claude อ่านไฟล์ที่ใหญ่เกิน 50k token
 */
