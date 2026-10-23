/**
 * ============================================================================
 * MOD 10: File Manager TH - ตัวจัดการไฟล์เต็มรูปแบบ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Mod ของเราเอง ต่อยอดจาก Mod 01-09
 *
 * หน้าที่ของ Mod นี้ (ทุกอย่างผ่านคำสั่ง /fm):
 * 1. CRUD ไฟล์ครบ: ls, cat, touch, mkdir, mv, cp
 * 2. ถังขยะกู้คืนได้: rm ย้ายไป .fm-trash/ ก่อน, rm! ลบถาวร, restore กู้คืน
 * 3. ค้นหา: find (ชื่อ), grep (เนื้อหา), ext (นามสกุล)
 * 4. backup, ไฟล์โปรด, ประวัติ, สถิติ
 * 5. ปลอดภัย: ไฟล์สำคัญ (.env, package.json, .git) ลบด้วย rm ธรรมดาไม่ได้
 *
 * เทคนิคสำคัญ:
 * - อ่าน/เขียน/list ไฟล์ใช้ $.fs (ข้ามระบบได้เลย)
 * - ย้าย/ก็อป/ลบ/สร้างโฟลเดอร์ $.fs ไม่มีให้ จึงใช้ $.process.run
 *   โดยส่ง path ผ่าน env (FM_SRC, FM_DST) ไม่ต่อสตริงเข้าคำสั่ง
 *   -> ชื่อไฟล์มีช่องว่างหรืออักขระพิเศษก็ไม่พัง และกัน command injection
 */

import type { EngineInterface, FsEntry, Register } from 'claude-code'

type Op = 'mkdir' | 'move' | 'copy' | 'remove'
type TrashItem = { name: string; original: string; deletedAt: number }
type HistoryItem = { time: number; action: string }

const TRASH_DIR = '.fm-trash'
const SKIP_DIRS = new Set(['node_modules', '.git', TRASH_DIR, 'dist', 'build', '.next'])
const PROTECTED = [/(^|[\\/])\.env(\.|$)/, /(^|[\\/])package(-lock)?\.json$/, /(^|[\\/])\.git([\\/]|$)/, /(^|[\\/])CLAUDE\.md$/]
const MAX_WALK = 3000 // เดินดูไฟล์ไม่เกินกี่รายการ (กันค้างในโปรเจกต์ใหญ่)

let cwd = ''
let isWindows = false
let history: HistoryItem[] = []
const stats = new Map<string, number>()

// ==========================================================================
// บทที่ 1: จัดการ path ให้ใช้ได้ทั้ง Windows และ macOS/Linux
// ==========================================================================
function sep(): string {
  return isWindows ? '\\' : '/'
}

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

function resolve(p: string): string {
  const clean = p.replace(/^["']|["']$/g, '')
  return isAbsolute(clean) ? clean : `${cwd}${sep()}${clean.replace(/[\\/]/g, sep())}`
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function relative(p: string): string {
  return p.toLowerCase().startsWith(cwd.toLowerCase() + sep()) ? p.slice(cwd.length + 1) : p
}

function isProtected(p: string): boolean {
  return PROTECTED.some(rx => rx.test(p))
}

// แยก argument โดยรองรับ "ชื่อ ที่มี ช่องว่าง"
function splitArgs(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

// เวลาท้องถิ่นแบบ 20261023-153000 (ใช้ตั้งชื่อไฟล์ ไม่ให้ซ้ำกัน)
function stamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function icon(entry: FsEntry): string {
  if (entry.kind === 'dir') return '📁'
  if (/\.(tsx|jsx)$/.test(entry.name)) return '⚛️'
  if (/\.ts$/.test(entry.name)) return '📘'
  if (/\.py$/.test(entry.name)) return '🐍'
  if (/\.(md|txt)$/.test(entry.name)) return '📝'
  if (/\.(json|ya?ml)$/.test(entry.name)) return '📋'
  if (/^\.env/.test(entry.name)) return '🔐'
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(entry.name)) return '🖼️'
  return '📄'
}

// ==========================================================================
// บทที่ 2: ย้าย/ก็อป/ลบ/สร้างโฟลเดอร์ ผ่าน $.process.run แบบปลอดภัย
// ==========================================================================
const POWERSHELL: Record<Op, string> = {
  mkdir: 'New-Item -ItemType Directory -Force -Path $env:FM_SRC | Out-Null',
  move: 'Move-Item -LiteralPath $env:FM_SRC -Destination $env:FM_DST -Force',
  copy: 'Copy-Item -LiteralPath $env:FM_SRC -Destination $env:FM_DST -Recurse -Force',
  remove: 'Remove-Item -LiteralPath $env:FM_SRC -Recurse -Force',
}
const SH: Record<Op, string> = {
  mkdir: 'mkdir -p -- "$FM_SRC"',
  move: 'mv -f -- "$FM_SRC" "$FM_DST"',
  copy: 'cp -R -- "$FM_SRC" "$FM_DST"',
  remove: 'rm -rf -- "$FM_SRC"',
}

async function runOp($: EngineInterface, op: Op, src: string, dst = ''): Promise<void> {
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; ${POWERSHELL[op]}`]
    : ['sh', '-c', SH[op]]
  const result = await $.process.run(argv, { env: { FM_SRC: src, FM_DST: dst }, timeoutMs: 60_000 })
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `exit ${result.exitCode}`)
}

// ==========================================================================
// บทที่ 3: เดินดูไฟล์ทั้งโปรเจกต์ (ใช้กับ find / grep / ext)
// ==========================================================================
async function walk($: EngineInterface, root: string, visit: (path: string, entry: FsEntry) => Promise<boolean | void>): Promise<void> {
  const queue = [root]
  let seen = 0
  while (queue.length > 0 && seen < MAX_WALK) {
    const dir = queue.shift() ?? root
    let entries: FsEntry[]
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue // อ่านโฟลเดอร์ไม่ได้ ข้ามไป
    }
    for (const entry of entries) {
      seen++
      const path = `${dir}${sep()}${entry.name}`
      if (entry.kind === 'dir') {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path)
        continue
      }
      if ((await visit(path, entry)) === false) return // visit คืน false = พอแล้ว หยุดเดิน
    }
  }
}

// ==========================================================================
// บทที่ 4: ถังขยะ - จำว่าไฟล์ไหนมาจากไหน (เก็บใน $.store แยกตามโปรเจกต์)
// ==========================================================================
const trashKey = () => `trash:${cwd}`

async function readTrash($: EngineInterface): Promise<TrashItem[]> {
  const saved = await $.store.get(trashKey())
  return Array.isArray(saved) ? (saved as TrashItem[]) : []
}

async function readFavs($: EngineInterface): Promise<string[]> {
  const saved = await $.store.get('favs')
  return Array.isArray(saved) ? (saved as string[]) : []
}

async function record($: EngineInterface, action: string, op: string): Promise<void> {
  history.push({ time: await $.clock.now(), action })
  if (history.length > 100) history.shift()
  stats.set(op, (stats.get(op) ?? 0) + 1)
}

const HELP = `🗂️ File Manager TH (Mod 10)
----------------------------------------
/fm ls [path]               ดูไฟล์ในโฟลเดอร์
/fm cat <ไฟล์>              อ่านไฟล์ (200 บรรทัดแรก)
/fm touch <ไฟล์>            สร้างไฟล์เปล่า
/fm mkdir <โฟลเดอร์>        สร้างโฟลเดอร์
/fm mv <เก่า> <ใหม่>        ย้าย/เปลี่ยนชื่อ
/fm cp <ต้นฉบับ> <ปลายทาง>  ก็อปปี้
/fm rm <ไฟล์>               ลบเข้าถังขยะ (กู้คืนได้)
/fm rm! <ไฟล์>              ลบถาวร
/fm trash                   ดูถังขยะ
/fm restore <ชื่อ>          กู้คืนจากถังขยะ
/fm empty-trash             เทถังขยะ (ลบถาวรทั้งหมด)
/fm find <ชื่อ>             ค้นหาตามชื่อไฟล์
/fm grep <คำ>               ค้นหาตามเนื้อหา
/fm ext <นามสกุล>           ค้นหาตามนามสกุล เช่น /fm ext tsx
/fm backup <ไฟล์>           สำรองเป็น <ไฟล์>.bak-วันที่
/fm fav [ไฟล์]              ดู/เพิ่มไฟล์โปรด
/fm history | stats         ประวัติ และสถิติ
ชื่อที่มีช่องว่างให้ใส่ "เครื่องหมายคำพูด"`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd.replace(/[\\/]$/, '')
    isWindows = /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')
    history = []
    stats.clear()
    await $.command.register({ name: 'fm', description: 'ตัวจัดการไฟล์ภาษาไทย (/fm help)', argumentHint: '<คำสั่ง> [ไฟล์]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: คำสั่งย่อยทั้งหมดของ /fm
  // ==========================================================================
  on('command.run', { command: 'fm' }, async ($, e) => {
    const [sub = 'help', ...args] = splitArgs(e.args.trim())
    const a0 = args[0] ?? ''
    const a1 = args[1] ?? ''
    const now = await $.clock.now()

    try {
      switch (sub) {
        case 'help':
          return { text: HELP }

        case 'ls': {
          const dir = a0 ? resolve(a0) : cwd
          const entries = (await $.fs.list(dir)).sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === 'dir' ? -1 : 1))
          await record($, `ls ${relative(dir) || '.'}`, 'ls')
          const rows = entries.map(en => `${icon(en)} ${en.name.padEnd(36)} ${en.kind === 'dir' ? '' : formatSize(en.size)}`)
          return { text: [`📂 ${dir} (${entries.length} รายการ)`, ...rows].join('\n') }
        }

        case 'cat': {
          if (!a0) return { text: 'วิธีใช้: /fm cat <ไฟล์>' }
          const path = resolve(a0)
          const st = await $.fs.stat(path)
          if (st.size > 2 * 1024 * 1024) return { text: `❌ ไฟล์ใหญ่เกินไป (${formatSize(st.size)})` }
          const lines = (await $.fs.read(path)).split('\n')
          await record($, `cat ${relative(path)}`, 'cat')
          const shown = lines.slice(0, 200).map((l, i) => `${String(i + 1).padStart(4)}  ${l}`)
          return { text: [`📄 ${relative(path)} (${lines.length} บรรทัด)`, ...shown, lines.length > 200 ? `... อีก ${lines.length - 200} บรรทัด` : ''].join('\n') }
        }

        case 'touch': {
          if (!a0) return { text: 'วิธีใช้: /fm touch <ไฟล์>' }
          const path = resolve(a0)
          if (await $.fs.exists(path)) return { text: `ℹ️ มีไฟล์ ${relative(path)} อยู่แล้ว` }
          await $.fs.write(path, '')
          await record($, `touch ${relative(path)}`, 'touch')
          return { text: `✨ สร้างไฟล์ ${relative(path)} แล้ว` }
        }

        case 'mkdir': {
          if (!a0) return { text: 'วิธีใช้: /fm mkdir <โฟลเดอร์>' }
          const path = resolve(a0)
          await runOp($, 'mkdir', path)
          await record($, `mkdir ${relative(path)}`, 'mkdir')
          return { text: `📁 สร้างโฟลเดอร์ ${relative(path)} แล้ว` }
        }

        case 'mv':
        case 'cp': {
          if (!a0 || !a1) return { text: `วิธีใช้: /fm ${sub} <ต้นทาง> <ปลายทาง>` }
          const [src, dst] = [resolve(a0), resolve(a1)]
          if (!(await $.fs.exists(src))) return { text: `❌ ไม่พบ ${a0}` }
          if (sub === 'mv' && isProtected(src)) return { text: `🔒 ${a0} เป็นไฟล์สำคัญ ย้ายด้วย /fm ไม่ได้` }
          await runOp($, sub === 'mv' ? 'move' : 'copy', src, dst)
          await record($, `${sub} ${relative(src)} -> ${relative(dst)}`, sub)
          return { text: `${sub === 'mv' ? '🚚 ย้าย' : '📑 ก็อป'} ${relative(src)} -> ${relative(dst)} แล้ว` }
        }

        case 'rm': {
          if (!a0) return { text: 'วิธีใช้: /fm rm <ไฟล์>' }
          const path = resolve(a0)
          if (!(await $.fs.exists(path))) return { text: `❌ ไม่พบ ${a0}` }
          if (isProtected(path)) return { text: `🔒 ${a0} เป็นไฟล์สำคัญ ถ้าแน่ใจจริงๆ ใช้ /fm rm! ${a0}` }

          // ย้ายเข้าถังขยะ ตั้งชื่อใหม่กันชื่อซ้ำ: 20261023-153000__ชื่อเดิม
          const trashName = `${stamp(now)}__${baseName(path)}`
          await runOp($, 'mkdir', `${cwd}${sep()}${TRASH_DIR}`)
          await runOp($, 'move', path, `${cwd}${sep()}${TRASH_DIR}${sep()}${trashName}`)
          await $.store.set(trashKey(), [...(await readTrash($)), { name: trashName, original: path, deletedAt: now }])
          await record($, `rm ${relative(path)}`, 'rm')
          return { text: `🗑️ ย้าย ${relative(path)} เข้าถังขยะแล้ว (/fm restore ${baseName(path)} เพื่อกู้คืน)` }
        }

        case 'rm!': {
          if (!a0) return { text: 'วิธีใช้: /fm rm! <ไฟล์>' }
          const path = resolve(a0)
          if (!(await $.fs.exists(path))) return { text: `❌ ไม่พบ ${a0}` }
          if (path.replace(/[\\/]$/, '') === cwd) return { text: '🔒 ไม่อนุญาตให้ลบโฟลเดอร์โปรเจกต์ทั้งก้อน' }
          await runOp($, 'remove', path)
          await record($, `rm! ${relative(path)}`, 'rm!')
          return { text: `💥 ลบ ${relative(path)} ถาวรแล้ว${isProtected(path) ? ' (เป็นไฟล์สำคัญ!)' : ''}` }
        }

        case 'trash': {
          const items = await readTrash($)
          if (items.length === 0) return { text: '🗑️ ถังขยะว่าง' }
          const rows = items.map(t => `🗑️ ${t.name.split('__').slice(1).join('__').padEnd(30)} จาก ${relative(t.original)} (${new Date(t.deletedAt).toLocaleString('th-TH')})`)
          return { text: [`🗑️ ถังขยะ (${items.length} รายการ)`, ...rows].join('\n') }
        }

        case 'restore': {
          if (!a0) return { text: 'วิธีใช้: /fm restore <ชื่อไฟล์>' }
          const items = await readTrash($)
          // ถ้ามีชื่อซ้ำหลายอัน เอาอันที่ลบล่าสุด
          const item = [...items].reverse().find(t => t.name === a0 || t.name.endsWith(`__${a0}`))
          if (!item) return { text: `❌ ไม่พบ ${a0} ในถังขยะ` }
          if (await $.fs.exists(item.original)) return { text: `❌ มีไฟล์ ${relative(item.original)} อยู่แล้ว ย้ายออกก่อนแล้วค่อยกู้คืน` }
          await runOp($, 'move', `${cwd}${sep()}${TRASH_DIR}${sep()}${item.name}`, item.original)
          await $.store.set(trashKey(), items.filter(t => t !== item))
          await record($, `restore ${relative(item.original)}`, 'restore')
          return { text: `♻️ กู้คืน ${relative(item.original)} แล้ว` }
        }

        case 'empty-trash': {
          const trashPath = `${cwd}${sep()}${TRASH_DIR}`
          if (await $.fs.exists(trashPath)) await runOp($, 'remove', trashPath)
          await $.store.delete(trashKey())
          await record($, 'empty-trash', 'empty-trash')
          return { text: '🧹 เทถังขยะแล้ว' }
        }

        case 'find':
        case 'ext': {
          if (!a0) return { text: `วิธีใช้: /fm ${sub} <${sub === 'find' ? 'ชื่อ' : 'นามสกุล'}>` }
          const want = a0.toLowerCase().replace(/^\./, '')
          const found: string[] = []
          await walk($, cwd, async path => {
            const name = baseName(path).toLowerCase()
            if (sub === 'find' ? name.includes(want) : name.endsWith(`.${want}`)) found.push(relative(path))
            return found.length < 100
          })
          await record($, `${sub} ${a0}`, sub)
          return { text: found.length ? [`🔎 เจอ ${found.length} ไฟล์${found.length >= 100 ? ' (แสดงแค่ 100)' : ''}`, ...found.map(f => `  ${f}`)].join('\n') : `🔎 ไม่เจอไฟล์ที่ตรงกับ "${a0}"` }
        }

        case 'grep': {
          if (!a0) return { text: 'วิธีใช้: /fm grep <คำ>' }
          const word = args.join(' ')
          const hits: string[] = []
          await walk($, cwd, async (path, entry) => {
            if (entry.size > 1024 * 1024 || /\.(png|jpe?g|gif|webp|zip|pdf|exe|dll|woff2?)$/i.test(path)) return
            const text = await $.fs.read(path).catch(() => '')
            text.split('\n').forEach((line, i) => {
              if (hits.length < 50 && line.includes(word)) hits.push(`  ${relative(path)}:${i + 1}  ${line.trim().slice(0, 100)}`)
            })
            return hits.length < 50
          })
          await record($, `grep ${word}`, 'grep')
          return { text: hits.length ? [`🔎 เจอ "${word}" ${hits.length} ที่${hits.length >= 50 ? ' (แสดงแค่ 50)' : ''}`, ...hits].join('\n') : `🔎 ไม่เจอ "${word}"` }
        }

        case 'backup': {
          if (!a0) return { text: 'วิธีใช้: /fm backup <ไฟล์>' }
          const path = resolve(a0)
          if (!(await $.fs.exists(path))) return { text: `❌ ไม่พบ ${a0}` }
          const dst = `${path}.bak-${stamp(now)}`
          await runOp($, 'copy', path, dst)
          await record($, `backup ${relative(path)}`, 'backup')
          return { text: `💾 สำรองเป็น ${relative(dst)} แล้ว` }
        }

        case 'fav': {
          const favs = await readFavs($)
          if (!a0) return { text: favs.length ? ['⭐ ไฟล์โปรด', ...favs.map(f => `  ⭐ ${f}`)].join('\n') : '⭐ ยังไม่มีไฟล์โปรด (/fm fav <ไฟล์> เพื่อเพิ่ม)' }
          const path = resolve(a0)
          if (favs.includes(path)) {
            await $.store.set('favs', favs.filter(f => f !== path))
            return { text: `☆ เอา ${relative(path)} ออกจากไฟล์โปรดแล้ว` }
          }
          await $.store.set('favs', [...favs, path])
          return { text: `⭐ เพิ่ม ${relative(path)} เป็นไฟล์โปรดแล้ว` }
        }

        case 'history':
          return { text: history.length ? ['📜 ประวัติ (session นี้)', ...[...history].reverse().slice(0, 30).map(h => `  ${new Date(h.time).toLocaleTimeString('th-TH')}  ${h.action}`)].join('\n') : '📜 ยังไม่มีประวัติ' }

        case 'stats': {
          const rows = [...stats.entries()].sort((x, y) => y[1] - x[1]).map(([op, c]) => `  ${op.padEnd(12)} ${c} ครั้ง`)
          const trash = await readTrash($)
          return { text: ['📊 สถิติ (session นี้)', ...(rows.length ? rows : ['  ยังไม่ได้ใช้คำสั่ง']), `🗑️ ในถังขยะ: ${trash.length} | ⭐ ไฟล์โปรด: ${(await readFavs($)).length}`].join('\n') }
        }

        default:
          return { text: `❌ ไม่รู้จักคำสั่ง "${sub}"\n\n${HELP}` }
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
 * 1. ทำแผง (Pane) file explorer มีปุ่มกดเข้าโฟลเดอร์ (รวม Mod 04 + Mod 10)
 * 2. ให้ Claude ใช้ได้ด้วย: $.tool.register เป็น tool "trash" แทนการ rm -rf
 * 3. ดัก tool.call ของ Bash ที่มี "rm " แล้วแนะนำให้ใช้ /fm rm แทน (แบบ Mod 03)
 */
