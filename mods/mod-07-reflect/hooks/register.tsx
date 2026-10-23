/**
 * ============================================================================
 * MOD 07: Reflect TH - ทบทวนตัวเองหลังจบงาน แบบ Scrum Retrospective (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/BayramAnnakov/claude-reflect
 *
 * หน้าที่ของ Mod นี้:
 * 1. เก็บ Work Log ทุกครั้งที่ Claude เรียก tool (tool อะไร, แตะไฟล์ไหน, สำเร็จไหม)
 * 2. ถ้าล้มเหลวติดๆ กัน เด้งเตือนว่าอาจต้องเปลี่ยนวิธี
 * 3. /reflect สรุปงาน + วิเคราะห์อัตโนมัติ + คำถามทบทวน
 * 4. /reflect feedback <ข้อความ> จดบทเรียน (จำข้าม session)
 * 5. /reflect save บันทึกรายงานเป็นไฟล์ REFLECT-YYYY-MM-DD.md
 */

import type { EngineInterface, Register } from 'claude-code'

interface WorkLog {
  time: number
  tool: string
  target: string // ไฟล์หรือคำสั่งที่เกี่ยวข้อง
  ok: boolean
}

interface Feedback {
  time: number
  text: string
}

// ==========================================================================
// บทที่ 1: state ของ Mod (เริ่มใหม่ทุก session)
// ==========================================================================
let workLogs: WorkLog[] = []
let task = '' // prompt แรกของ session = "งาน" ที่ทำ
let startedAt = 0
let projectRoot = ''
let hasWarnedStreak = false

// สรุปสั้นๆ ว่า tool นี้ทำอะไร
function targetOf(e: { tool: string } & Record<string, unknown>): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'url', 'pattern', 'description']) {
    const value = e[key]
    if (typeof value === 'string' && value) return value.length > 70 ? value.slice(0, 67) + '...' : value
  }
  return ''
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return sec < 60 ? `${sec}วิ` : `${Math.floor(sec / 60)}นาที ${sec % 60}วิ`
}

function timeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return sec < 60 ? `${sec}วิที่แล้ว` : `${Math.floor(sec / 60)}นาทีที่แล้ว`
}

async function readFeedbacks($: EngineInterface): Promise<Feedback[]> {
  const saved = await $.store.get('feedbacks')
  return Array.isArray(saved) ? (saved as Feedback[]) : []
}

// ==========================================================================
// บทที่ 2: วิเคราะห์อัตโนมัติ - หัวใจของ Reflect
// ==========================================================================
function buildReport(now: number, feedbacks: Feedback[]): string {
  const total = workLogs.length
  const success = workLogs.filter(w => w.ok).length
  const failed = total - success
  const rate = total === 0 ? 0 : (success / total) * 100
  const files = new Set(workLogs.filter(w => /[/\\.]/.test(w.target) && w.tool !== 'Bash').map(w => w.target))

  // นับว่าใช้ tool ไหนบ่อยสุด
  const toolCount = new Map<string, number>()
  for (const w of workLogs) toolCount.set(w.tool, (toolCount.get(w.tool) ?? 0) + 1)
  const [topTool, topCount] = [...toolCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['-', 0]

  const lines = [
    '🪞 Reflect Report - ทบทวนงาน (Mod 07)',
    '========================================',
    `📝 งาน: ${task || '(ยังไม่มี prompt)'}`,
    `⏱️ ใช้เวลา: ${formatDuration(now - startedAt)}`,
    `🔧 เรียก tool: ${total} ครั้ง (สำเร็จ ${success}, ล้มเหลว ${failed}) - ${rate.toFixed(1)}%`,
    `📁 แตะไฟล์: ${files.size} ไฟล์`,
    `🛠️ ใช้เยอะสุด: ${topTool} (${topCount} ครั้ง)`,
  ]

  if (total > 0) {
    lines.push('', '📊 ล่าสุด 8 รายการ:')
    for (const w of workLogs.slice(-8).reverse()) {
      lines.push(`  ${w.ok ? '✅' : '❌'} ${w.tool} - ${w.target || '-'} (${timeAgo(now - w.time)})`)
    }
  }

  lines.push('', '🤔 การทบทวน (Self-Reflection):')
  if (total === 0) lines.push('  ยังไม่มีงานให้ทบทวน')
  else if (failed === 0) lines.push('  ✅ สำเร็จ 100% - แผนดีมาก')
  if (failed > total * 0.3) lines.push('  ⚠️ ล้มเหลวเกิน 30% - งานถัดไปลองใช้ Plan Mode วางแผนก่อน')
  if (total >= 5 && topCount > total * 0.6) lines.push(`  💡 ใช้ ${topTool} เกิน 60% ของทั้งหมด - อาจมีวิธีที่เร็วกว่า`)
  if (files.size > 10) lines.push('  💡 แตะไฟล์เยอะมาก - ลองแบ่งงานเป็นชิ้นเล็กลง')

  if (feedbacks.length > 0) {
    lines.push('', '📌 บทเรียนที่จดไว้:')
    for (const f of feedbacks.slice(-5)) lines.push(`  - ${f.text}`)
  }

  lines.push('', '💡 คำถามทบทวน:', '  1. งานนี้สำเร็จตามที่ต้องการไหม?', '  2. มีอะไรที่ทำได้ดีกว่านี้ไหม?', '  3. รอบหน้าควรบอก Claude อะไรตั้งแต่แรก?')
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    workLogs = []
    task = ''
    hasWarnedStreak = false
    startedAt = await $.clock.now()
    projectRoot = e.cwd
    await $.command.register({ name: 'reflect', description: 'ทบทวนงาน (/reflect stats, /reflect feedback <ข้อความ>, /reflect save)', argumentHint: '[stats|feedback|save]' })
    return next(e)
  })

  // จด prompt แรกเป็นชื่องาน (ข้ามคำสั่ง / และข้อความที่ระบบส่งเอง)
  on('prompt.submit', ($, e, next) => {
    if (!task && !e.command && !e.isMeta) task = e.text.split('\n')[0]?.slice(0, 100) ?? ''
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: เก็บ Log ทุกครั้งที่เรียก tool แล้วอัปเดตว่าสำเร็จไหม
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const log: WorkLog = { time: await $.clock.now(), tool: e.tool, target: targetOf(e as unknown as { tool: string } & Record<string, unknown>), ok: true }
    workLogs.push(log)
    if (workLogs.length > 500) workLogs.shift()

    const ran = await next(e)
    log.ok = ran.deny === undefined && !ran.isError

    // ใน 5 ครั้งล่าสุด ล้มเหลว 3 ครั้งขึ้นไป -> เตือน (ครั้งเดียวจนกว่าจะดีขึ้น)
    const recentFails = workLogs.slice(-5).filter(w => !w.ok).length
    if (recentFails >= 3 && !hasWarnedStreak) {
      $.ui.toast('🪞 ล้มเหลวหลายครั้งติดกัน อาจต้องเปลี่ยนวิธี ลองกด Esc แล้วบอก Claude ให้วางแผนใหม่')
      hasWarnedStreak = true
    }
    if (recentFails === 0) hasWarnedStreak = false

    return ran
  })

  // ==========================================================================
  // บทที่ 4: Feedback Loop และคำสั่ง /reflect
  // ==========================================================================
  on('command.run', { command: 'reflect' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/)
    const now = await $.clock.now()

    if (sub === 'feedback') {
      const text = rest.join(' ')
      if (!text) return { text: 'วิธีใช้: /reflect feedback รอบหน้าควรรัน test ก่อน' }
      const feedbacks = [...(await readFeedbacks($)), { time: now, text }].slice(-50)
      await $.store.set('feedbacks', feedbacks)
      return { text: `📌 จดบทเรียนแล้ว (${feedbacks.length} ข้อ): ${text}` }
    }

    if (sub === 'stats') {
      const ok = workLogs.filter(w => w.ok).length
      return { text: `🪞 ${formatDuration(now - startedAt)} | tool ${workLogs.length} ครั้ง | สำเร็จ ${ok} | ล้มเหลว ${workLogs.length - ok}` }
    }

    const report = buildReport(now, await readFeedbacks($))

    if (sub === 'save') {
      const d = new Date(now) // วันที่ตามเวลาเครื่อง (toISOString จะเป็นเวลา UTC)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const sep = projectRoot.includes('\\') ? '\\' : '/'
      const path = `${projectRoot}${sep}REFLECT-${date}.md`
      await $.fs.write(path, '```\n' + report + '\n```\n')
      return { text: `💾 บันทึกแล้ว: ${path}` }
    }

    return { text: report }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เก็บสรุปทุก session ลง $.store แล้วดูว่าเราทำงานเร็วขึ้นไหม
 * 2. ส่ง workLogs ให้ $.model.complete วิเคราะห์ว่า "อะไรดี/ไม่ดี" เป็นภาษาไทย
 * 3. แชร์ REFLECT-*.md ให้ทีมดูใน retrospective
 */
