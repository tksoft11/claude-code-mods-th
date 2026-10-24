/**
 * ============================================================================
 * MOD 60: File Badges TH - ป้ายสีตามภาษาหน้าแถวไฟล์ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ไอคอนไฟล์สีๆ ใน VS Code และสีภาษาบน GitHub
 *
 * หน้าที่ของ Mod นี้:
 * 1. แถว tool ที่อ่าน/แก้ไฟล์ (Read, Edit, Write, MultiEdit, NotebookEdit) จะมีป้ายสีภาษานำหน้า
 *    เช่น [TS] สีน้ำเงิน, [PY] สีฟ้า-เหลือง, [RS] สีส้ม ใช้สีเดียวกับ GitHub
 * 2. ไฟล์ทดสอบ / ไฟล์ตั้งค่า / ไฟล์ลับ (.env) มีป้ายของตัวเอง
 * 3. /badges - สรุปว่า session นี้ Claude อ่านและแก้ไฟล์ภาษาอะไรไปบ้าง
 *
 * ห่อแถวเดิมไว้ ({await next(e)}) จึงใช้ร่วมกับ Mod อื่นที่แต่งแถว tool ได้ (เช่น Mod 50)
 */

import type { Register } from 'claude-code'

interface Lang {
  label: string
  color: string
}

// ==========================================================================
// บทที่ 1: สีของแต่ละภาษา (อิงสีของ GitHub linguist)
// ==========================================================================
const LANGS: Record<string, Lang> = {
  ts: { label: 'TS', color: '#3178c6' }, tsx: { label: 'TSX', color: '#3178c6' }, js: { label: 'JS', color: '#f1e05a' }, jsx: { label: 'JSX', color: '#f1e05a' }, mjs: { label: 'JS', color: '#f1e05a' }, cjs: { label: 'JS', color: '#f1e05a' },
  py: { label: 'PY', color: '#3572a5' }, rs: { label: 'RS', color: '#dea584' }, go: { label: 'GO', color: '#00add8' }, java: { label: 'JAVA', color: '#b07219' }, kt: { label: 'KT', color: '#a97bff' }, swift: { label: 'SWIFT', color: '#f05138' },
  rb: { label: 'RB', color: '#cc342d' }, php: { label: 'PHP', color: '#4f5d95' }, cs: { label: 'C#', color: '#178600' }, c: { label: 'C', color: '#8f8f8f' }, h: { label: 'H', color: '#8f8f8f' }, cpp: { label: 'C++', color: '#f34b7d' }, dart: { label: 'DART', color: '#00b4ab' },
  html: { label: 'HTML', color: '#e34c26' }, css: { label: 'CSS', color: '#663399' }, scss: { label: 'SCSS', color: '#c6538c' }, vue: { label: 'VUE', color: '#41b883' }, svelte: { label: 'SVLT', color: '#ff3e00' },
  json: { label: 'JSON', color: '#cbcb41' }, yaml: { label: 'YAML', color: '#cb171e' }, yml: { label: 'YAML', color: '#cb171e' }, toml: { label: 'TOML', color: '#9c4221' }, xml: { label: 'XML', color: '#0060ac' },
  md: { label: 'MD', color: '#4a90d9' }, sql: { label: 'SQL', color: '#e38c00' }, sh: { label: 'SH', color: '#89e051' }, ps1: { label: 'PS', color: '#012456' }, dockerfile: { label: 'DOCKER', color: '#384d54' },
  ipynb: { label: 'NB', color: '#da5b0b' }, lua: { label: 'LUA', color: '#000080' }, ex: { label: 'EX', color: '#6e4a7e' }, zig: { label: 'ZIG', color: '#ec915c' },
}
const SPECIAL: { test: RegExp; lang: Lang }[] = [
  { test: /(^|[\\/])\.env(\.|$)/, lang: { label: 'ENV🔒', color: '#e53935' } },
  { test: /\.(test|spec)\.[a-z]+$|(^|[\\/])(tests?|__tests__)[\\/]/i, lang: { label: 'TEST', color: '#43a047' } },
  { test: /(^|[\\/])(package\.json|tsconfig[^\\/]*\.json|\.eslintrc[^\\/]*|vite\.config\.[a-z]+|next\.config\.[a-z]+)$/, lang: { label: 'CONF', color: '#8d6e63' } },
  { test: /(^|[\\/])Dockerfile$/, lang: { label: 'DOCKER', color: '#384d54' } },
]
const FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']

function langOf(path: string): Lang | undefined {
  const special = SPECIAL.find(s => s.test.test(path))
  if (special) return special.lang
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase()
  return ext ? LANGS[ext] : undefined
}

function pathOf(input: unknown): string | undefined {
  const i = input as Record<string, unknown> | undefined
  const p = i?.file_path ?? i?.notebook_path
  return typeof p === 'string' ? p : undefined
}

let enabled = true
const touched = new Map<string, { read: number; edit: number; color: string }>()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    touched.clear()
    await $.command.register({ name: 'badges', description: 'ป้ายสีภาษาหน้าแถวไฟล์ + สรุปภาษาที่ Claude แตะ (/badges)', argumentHint: 'on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: นับภาษาที่ Claude อ่าน/แก้ (เฉพาะที่สำเร็จ)
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!FILE_TOOLS.includes(e.tool) || r.deny !== undefined || r.isError) return r
    const lang = langOf(pathOf(e) ?? '')
    if (lang) {
      const t = touched.get(lang.label) ?? { read: 0, edit: 0, color: lang.color }
      if (e.tool === 'Read') t.read++
      else t.edit++
      touched.set(lang.label, t)
    }
    return r
  })

  // ==========================================================================
  // บทที่ 3: ป้ายหน้าแถว - วางป้ายไว้ซ้าย แล้วตามด้วยแถวเดิมทั้งแถว
  // ==========================================================================
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!enabled || !FILE_TOOLS.includes(e.props.tool)) return next(e)
    const lang = langOf(pathOf(e.props.input) ?? '')
    if (!lang) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text color={lang.color} bold>
          {`[${lang.label}]`}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {await next(e)}
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'badges' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await $.store.set('enabled', enabled)
      $.ui.invalidate('ui.render')
      return { text: enabled ? '🏷️ แสดงป้ายภาษาแล้ว' : 'ซ่อนป้ายภาษาแล้ว' }
    }
    if (touched.size === 0) return { text: '🏷️ session นี้ Claude ยังไม่ได้อ่าน/แก้ไฟล์ (/badges on|off เปิดปิดป้าย)' }
    const rows = [...touched.entries()].sort((a, b) => b[1].read + b[1].edit - (a[1].read + a[1].edit))
    const max = Math.max(...rows.map(([, v]) => v.read + v.edit))
    return {
      text: [
        '🏷️ ภาษาที่ Claude แตะใน session นี้',
        `${'ภาษา'.padEnd(8)} ${'อ่าน'.padStart(5)} ${'แก้'.padStart(5)}`,
        ...rows.map(([label, v]) => `${label.padEnd(8)} ${String(v.read).padStart(5)} ${String(v.edit).padStart(5)}  ${'▇'.repeat(Math.max(1, Math.round(((v.read + v.edit) / max) * 16)))}`),
      ].join('\n'),
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ใส่ป้ายใน Grep / Glob ด้วย (ดูจาก pattern ของไฟล์)
 * 2. ให้ป้ายกะพริบเมื่อ Claude แก้ไฟล์ที่ไม่เคยแตะมาก่อนใน session
 * 3. อ่านสีจาก .gitattributes / linguist ของโปรเจกต์เอง
 */
