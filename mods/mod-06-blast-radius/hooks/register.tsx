/**
 * ============================================================================
 * MOD 06: Blast Radius TH - แก้ไฟล์นี้แล้วจะกระทบไปถึงไหน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ปลั๊กอิน "blast radius" ที่ Anthropic ทำเป็นตัวอย่าง
 *
 * ปัญหา: ถ้าแก้ src/utils/helpers.ts ที่ถูก import อยู่ 50 ไฟล์ พลาดนิดเดียวพังทั้งโปรเจกต์
 *
 * หน้าที่ของ Mod นี้:
 * 1. ก่อน Claude Edit/Write ไฟล์ที่มีอยู่แล้ว หาว่าไฟล์ไหน import ไฟล์นั้น (ด้วย git grep)
 * 2. ประเมินความเสี่ยง 4 ระดับ: LOW / MEDIUM / HIGH / CRITICAL
 * 3. ถ้าเสี่ยงสูง เด้ง toast เตือนคุณ และแนบรายชื่อไฟล์ให้ Claude อ่านด้วย
 *    (Claude จะได้รู้ว่าควรเช็คไฟล์ไหนต่อ)
 * 4. คำสั่ง /blast <ไฟล์> วิเคราะห์เอง, /blast list ดูที่วิเคราะห์ไปแล้ว
 *
 * ข้อจำกัด: ต้องอยู่ใน git repo และหาจากชื่อไฟล์ใน import/require เท่านั้น (ไม่ใช่ dependency graph เต็ม)
 */

import type { EngineInterface, Register } from 'claude-code'

type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type Analysis = { impacted: string[]; risk: Risk; analyzedAt: number; error?: string }

const CACHE_MS = 5 * 60 * 1000 // ผลวิเคราะห์ใช้ซ้ำได้ 5 นาที
const CORE_WORDS = ['utils', 'helpers', 'types', 'config', 'constants', 'lib']
const RISK_ICON: Record<Risk, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }

let projectRoot = ''

// ==========================================================================
// บทที่ 1: ใช้ Map เป็น cache - ไม่ต้องวิเคราะห์ไฟล์เดิมซ้ำทุกครั้ง
// ==========================================================================
const analysisCache = new Map<string, Analysis>()

function toRelative(path: string): string {
  const p = path.replace(/\\/g, '/')
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return root && p.toLowerCase().startsWith(root.toLowerCase() + '/') ? p.slice(root.length + 1) : p
}

// ==========================================================================
// บทที่ 2: เช็คว่าเป็นไฟล์ Core ไหม + ประเมินความเสี่ยง
// ==========================================================================
function isCoreFile(path: string): boolean {
  return CORE_WORDS.some(word => path.toLowerCase().includes(word))
}

function riskOf(count: number, isCore: boolean): Risk {
  if (count > 20 || (isCore && count > 5)) return 'CRITICAL'
  if (count > 10) return 'HIGH'
  if (count > 3) return 'MEDIUM'
  return 'LOW'
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ==========================================================================
// บทที่ 3: หาไฟล์ที่ import ไฟล์เป้าหมาย ด้วย git grep ($.process.run)
// ==========================================================================
async function analyze($: EngineInterface, filePath: string): Promise<Analysis> {
  const rel = toRelative(filePath)
  const now = await $.clock.now()
  const cached = analysisCache.get(rel)
  if (cached && now - cached.analyzedAt < CACHE_MS) return cached

  // ชื่อที่ใช้ใน import: ตัดนามสกุลออก, ถ้าเป็น index ใช้ชื่อโฟลเดอร์แทน
  const parts = rel.split('/')
  let name = (parts.at(-1) ?? rel).replace(/\.[^.]+$/, '')
  if (name === 'index' && parts.length > 1) name = parts.at(-2) ?? name

  // จับ from '.../helpers' , import('./helpers.js') , require("../helpers")
  const pattern = `(from|import|require)[ (]*['"][^'"]*/${escapeRegex(name)}(\\.[a-z]+)?['"]`

  let result: Analysis
  try {
    const run = await $.process.run(['git', 'grep', '-l', '-I', '-E', pattern], { timeoutMs: 10_000 })
    // exit 1 = หาไม่เจอ (ไม่ใช่ error), อย่างอื่นที่ไม่ใช่ 0 = ไม่ใช่ git repo หรือ git มีปัญหา
    if (run.exitCode > 1) throw new Error(run.stderr.trim() || `git exit ${run.exitCode}`)

    const impacted = run.stdout.split('\n').map(s => s.trim()).filter(s => s && s !== rel)
    result = { impacted, risk: riskOf(impacted.length, isCoreFile(rel)), analyzedAt: now }
  } catch (err) {
    result = { impacted: [], risk: 'LOW', analyzedAt: now, error: String(err) }
  }

  analysisCache.set(rel, result)
  return result
}

function buildReport(rel: string, a: Analysis): string {
  if (a.error) return `💥 Blast Radius: ${rel}\n❌ วิเคราะห์ไม่ได้ (ต้องอยู่ใน git repo): ${a.error}`

  const shown = a.impacted.slice(0, 10)
  const lines = [
    `💥 Blast Radius Analysis`,
    '----------------------------------------',
    `🎯 ไฟล์เป้าหมาย: ${rel}`,
    `${RISK_ICON[a.risk]} ระดับความเสี่ยง: ${a.risk} (ไฟล์ที่ import อยู่ ${a.impacted.length} ไฟล์)`,
  ]
  if (isCoreFile(rel)) lines.push('⚠️ ไฟล์นี้ดูเหมือนเป็น CORE FILE - แก้แล้วมักกระทบเยอะ')
  if (shown.length > 0) {
    lines.push('', '📊 ไฟล์ที่ได้รับผลกระทบ:')
    shown.forEach((f, i) => lines.push(`  ${i === shown.length - 1 && a.impacted.length <= 10 ? '└──' : '├──'} ${f}`))
    if (a.impacted.length > 10) lines.push(`  └── ... และอีก ${a.impacted.length - 10} ไฟล์`)
  }
  if (a.risk === 'HIGH' || a.risk === 'CRITICAL') {
    lines.push('', '💡 คำแนะนำ: สร้าง branch ใหม่, รัน test ก่อนและหลังแก้, แก้ทีละน้อย')
  }
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    analysisCache.clear()
    await $.command.register({ name: 'blast', description: 'วิเคราะห์ว่าแก้ไฟล์นี้แล้วกระทบไฟล์ไหนบ้าง (/blast list)', argumentHint: '<ไฟล์>|list' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ดักก่อนแก้จริง แล้วแนบผลวิเคราะห์ให้ Claude อ่าน (context)
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const target = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : undefined
    if (!target || !(await $.fs.exists(target))) return next(e) // ไฟล์ใหม่ไม่มีใคร import

    const analysis = await analyze($, target)
    const rel = toRelative(target)
    const isRisky = analysis.risk === 'HIGH' || analysis.risk === 'CRITICAL'

    if (isRisky) {
      $.ui.toast(`${RISK_ICON[analysis.risk]} Blast Radius ${analysis.risk}: ${rel} ถูก import อยู่ ${analysis.impacted.length} ไฟล์`)
      // ถ้าอยากบล็อกการแก้ไฟล์ที่เสี่ยงมาก ให้ return { deny: "เหตุผล" } แทน next(e)
    }

    const ran = await next(e)

    // context = ข้อความที่ Claude อ่านต่อท้ายผลของ tool (ผู้ใช้ไม่เห็น)
    if (isRisky && ran.deny === undefined && !ran.isError) {
      const note = `[blast-radius-th] ${rel} is imported by ${analysis.impacted.length} files, for example: ${analysis.impacted.slice(0, 15).join(', ')}. Check that these still work with the change.`
      return { ...ran, context: [...(ran.context ?? []), note] }
    }
    return ran
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /blast
  // ==========================================================================
  on('command.run', { command: 'blast' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === '') return { text: 'วิธีใช้: /blast src/utils/helpers.ts หรือ /blast list' }
    if (arg === 'list') {
      if (analysisCache.size === 0) return { text: 'ยังไม่ได้วิเคราะห์ไฟล์ไหนเลย' }
      const rows = [...analysisCache.entries()].map(([f, a]) => `${RISK_ICON[a.risk]} ${a.risk.padEnd(8)} ${String(a.impacted.length).padStart(3)} ไฟล์  ${f}`)
      return { text: ['💥 ไฟล์ที่วิเคราะห์ไปแล้ว', '----------------------------------------', ...rows].join('\n') }
    }

    analysisCache.delete(toRelative(arg)) // สั่งเองให้วิเคราะห์ใหม่เสมอ
    return { text: buildReport(toRelative(arg), await analyze($, arg)) }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ใช้ madge หรือ dependency-cruiser สร้าง dependency graph จริง (นับ import ทางอ้อมด้วย)
 * 2. ดู git log ว่าไฟล์ไหนไม่ได้แก้นาน = อาจเป็น dead code
 * 3. ทำเป็นด่านกั้น: ถ้า CRITICAL ให้ return { deny } แล้วต้องให้คนยืนยันก่อน
 */
