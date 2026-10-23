/**
 * ============================================================================
 * MOD 04: Filetree TH - แผงดูไฟล์ที่ Claude แตะ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/data-goblin/claude-filetree
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดักทุก tool ที่แตะไฟล์ (Read, Edit, Write, Bash rm)
 * 2. จำว่าแต่ละไฟล์ถูกทำอะไร กี่ครั้ง ล่าสุดเมื่อไหร่
 * 3. วาดแผง (Pane) ด้านข้าง จัดกลุ่มตามโฟลเดอร์ + ไอคอนตามสถานะและชนิดไฟล์
 * 4. คำสั่ง /files เปิดแผง, /files list แสดงเป็นข้อความ, /files clear ล้างรายการ
 */

import type { EngineInterface, Register } from 'claude-code'

type FileStatus = 'read' | 'edited' | 'created' | 'deleted'

type FileInfo = {
  path: string // path เทียบกับโฟลเดอร์โปรเจกต์
  status: FileStatus // สถานะล่าสุด
  count: number // ถูกแตะกี่ครั้ง
  lastTouched: number // เวลาล่าสุด (ms)
}

const PANE = 'filetree-th' // id ของแผง ใช้ทั้งตอนเปิดและตอนวาด
const MAX_FILES = 300

let projectRoot = '' // โฟลเดอร์โปรเจกต์ (ได้จาก session.start)
let files: FileInfo[] = [] // ไฟล์ทั้งหมดที่ถูกแตะ (เริ่มใหม่เมื่อ reload mod)

// ไอคอนตามสถานะ
const STATUS_ICON: Record<FileStatus, string> = { read: '👁️', edited: '✏️', created: '✨', deleted: '🗑️' }
const STATUS_TH: Record<FileStatus, string> = { read: 'อ่าน', edited: 'แก้ไข', created: 'สร้าง', deleted: 'ลบ' }

// ไอคอนตามนามสกุลไฟล์
function fileIcon(path: string): string {
  const name = path.toLowerCase()
  if (/\.(tsx|jsx)$/.test(name)) return '⚛️'
  if (/\.ts$/.test(name)) return '📘'
  if (/\.(js|mjs|cjs)$/.test(name)) return '📒'
  if (/\.py$/.test(name)) return '🐍'
  if (/(^|\/)\.env/.test(name)) return '🔐'
  if (/\.(css|scss|svg|png|jpg)$/.test(name)) return '🎨'
  if (/\.(md|txt)$/.test(name)) return '📝'
  if (/\.(json|ya?ml|toml)$/.test(name)) return '📋'
  return '📄'
}

// แปลง path เต็มเป็น path สั้นเทียบกับโปรเจกต์ (รองรับทั้ง / และ \ ของ Windows)
function shortPath(path: string): string {
  const p = path.replace(/\\/g, '/')
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return root && p.toLowerCase().startsWith(root.toLowerCase() + '/') ? p.slice(root.length + 1) : p
}

function timeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}วิที่แล้ว`
  if (sec < 3600) return `${Math.floor(sec / 60)}นาทีที่แล้ว`
  return `${Math.floor(sec / 3600)}ชม.ที่แล้ว`
}

// ==========================================================================
// บทที่ 1: จดไฟล์ - หาไฟล์เดิมแล้วอัปเดต หรือเพิ่มใหม่ แล้วสั่งให้แผงวาดใหม่
// ==========================================================================
async function touchFile($: EngineInterface, path: string, status: FileStatus): Promise<void> {
  const now = await $.clock.now()
  const key = shortPath(path)
  const old = files.find(f => f.path === key)
  const updated: FileInfo = { path: key, status, count: (old?.count ?? 0) + 1, lastTouched: now }
  files = [...files.filter(f => f.path !== key), updated].slice(-MAX_FILES)
  $.ui.invalidate('ui.render')
}

// ==========================================================================
// บทที่ 2: สร้าง tree แบบข้อความ (ใช้ทั้งในแผงและใน /files list)
// ==========================================================================
function buildTreeLines(list: FileInfo[], now: number): string[] {
  // จัดกลุ่มตามโฟลเดอร์
  const groups = new Map<string, FileInfo[]>()
  for (const f of list) {
    const slash = f.path.lastIndexOf('/')
    const dir = slash >= 0 ? f.path.slice(0, slash) : '.'
    groups.set(dir, [...(groups.get(dir) ?? []), f])
  }

  // โฟลเดอร์ที่แตะล่าสุดขึ้นก่อน, ในโฟลเดอร์ก็เรียงตามเวลาล่าสุด
  const latest = (list: FileInfo[]) => Math.max(...list.map(f => f.lastTouched))
  const dirs = [...groups.entries()].sort((a, b) => latest(b[1]) - latest(a[1]))

  const lines: string[] = []
  for (const [dir, inDir] of dirs) {
    lines.push(`📁 ${dir}/ (${inDir.length} ไฟล์)`)
    for (const f of [...inDir].sort((a, b) => b.lastTouched - a.lastTouched)) {
      const name = f.path.slice(f.path.lastIndexOf('/') + 1)
      lines.push(`  ${STATUS_ICON[f.status]} ${fileIcon(name)} ${name} - ${STATUS_TH[f.status]} x${f.count} (${timeAgo(now - f.lastTouched)})`)
    }
  }
  return lines
}

// หาไฟล์ที่คำสั่ง rm จะลบ (แบบง่าย: เอาคำที่ไม่ใช่ option หลัง rm)
function filesRemovedBy(command: string): string[] {
  const match = /(?:^|[;&|]\s*)rm\s+([^;&|]+)/.exec(command)
  return match?.[1]?.split(/\s+/).filter(arg => arg && !arg.startsWith('-')) ?? []
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    files = []
    await $.command.register({ name: 'files', description: 'เปิดแผงไฟล์ที่ Claude แตะ (/files list, /files clear)', argumentHint: '[list|clear]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดักทุก tool ที่แตะไฟล์ - หัวใจของ Filetree
  // ==========================================================================
  // จดหลังจาก tool รันสำเร็จเท่านั้น (ถ้าถูกปฏิเสธหรือ error ไม่นับ)
  on('tool.call', async ($, e, next) => {
    const existedBefore = e.tool === 'Write' ? await $.fs.exists(e.file_path) : true
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    if (e.tool === 'Read') await touchFile($, e.file_path, 'read')
    if (e.tool === 'Edit') await touchFile($, e.file_path, 'edited')
    if (e.tool === 'NotebookEdit') await touchFile($, e.notebook_path, 'edited')
    if (e.tool === 'Write') await touchFile($, e.file_path, existedBefore ? 'edited' : 'created')
    if (e.tool === 'Bash') {
      for (const file of filesRemovedBy(e.command)) await touchFile($, file, 'deleted')
    }
    return ran
  })

  // ==========================================================================
  // บทที่ 4: วาดแผงด้านข้าง (Pane)
  // ==========================================================================
  // engine เรียก hook นี้ใหม่ทุกครั้งที่ touchFile เรียก $.ui.invalidate
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lines = buildTreeLines(files, await $.clock.now())
    const room = Math.max(1, e.props.scroll.bodyRows - 1)

    return (
      <Box flexDirection="column">
        {lines.length === 0 && <Text dimColor>Claude ยังไม่ได้แตะไฟล์ไหนเลย</Text>}
        {lines.slice(0, room).map(line => (
          <Text dimColor={!line.startsWith('📁')} wrap="truncate-end">
            {line}
          </Text>
        ))}
        {lines.length > room && <Text dimColor>... อีก {lines.length - room} บรรทัด (/files list)</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'files' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === 'clear') {
      files = []
      $.ui.invalidate('ui.render')
      return { text: '🧹 ล้างรายการไฟล์แล้ว' }
    }
    if (arg === 'list') {
      const lines = buildTreeLines(files, await $.clock.now())
      return { text: [`📂 ไฟล์ที่ Claude แตะ (${files.length} ไฟล์)`, '----------------------------------------', ...lines].join('\n') }
    }

    const opened = await $.ui.open({ id: PANE, title: '📂 ไฟล์ที่ Claude แตะ' })
    return { text: opened.isPlaced ? '📂 เปิดแผงไฟล์แล้ว' : `เปิดแผงไม่ได้ (${opened.reason}) ลอง /files list แทน` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เพิ่ม Button ในแต่ละแถว กดแล้ว $.prompt.fill({ text: "@" + path }) เพื่อ mention ไฟล์นั้น
 * 2. นับ Grep/Glob ด้วย (เทียบด้วย String(e.tool) === "Grep" เพราะบาง build ไม่มี tool นี้)
 * 3. เก็บรายการลง $.store เพื่อดูย้อนหลังข้าม session
 */
