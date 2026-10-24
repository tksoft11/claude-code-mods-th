/**
 * ============================================================================
 * MOD 83: Output Diet TH - ตัด output ยาวของ Bash ก่อนส่งให้ Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: fast-jev-output และ winnow ใน awesome-claude-code-mods
 *
 * ต่างจาก Mod 61 Log Fold: Log Fold พับให้ "คนดู" แต่ Claude ยังอ่านเต็ม
 * Mod นี้ตัดสิ่งที่ "Claude อ่าน" จึงประหยัด context และ token จริง
 *
 * หน้าที่ของ Mod นี้:
 * 1. output ของ Bash ที่ยาวเกินเกณฑ์ (ค่าเริ่มต้น 150 บรรทัด) เหลือ:
 *    หัว 40 บรรทัด + บรรทัดสำคัญตรงกลาง (error, fail, warning) + ท้าย 60 บรรทัด
 * 2. เก็บ output เต็มไว้ที่ .claude/output-diet/ (หมุนเวียน 5 ไฟล์) และบอก Claude
 *    ว่าถ้าต้องการดูเต็มให้อ่านไฟล์นั้น ไม่มีอะไรหายจริง
 * 3. นับว่าประหยัดไปกี่ token (ประมาณจากจำนวนตัวอักษร ÷ 4)
 * 4. ใส่ "# full" ท้ายคำสั่งเมื่ออยากให้ Claude เห็นเต็ม
 *
 * ตัดเฉพาะคำสั่งที่สำเร็จ: ผลที่ error ปล่อยผ่านเต็ม เพราะเป็นตอนที่ต้องเห็นรายละเอียด
 */

import type { EngineInterface, Register } from 'claude-code'

const DIR = '.claude/output-diet'
const KEEP_FILES = 5
const IMPORTANT = /\b(error|fail(ed|ure)?|exception|traceback|panic|fatal|warn(ing)?|denied|not found|cannot|unable)\b|✗|✘|❌/i

let settings = { on: true, maxLines: 150, head: 40, tail: 60 }
let saved = { tokens: 0, trims: 0 }
let slot = 0

// ==========================================================================
// บทที่ 1: เลือกบรรทัดที่จะเก็บ
// ==========================================================================
function diet(text: string, fullPath: string): { text: string; cut: number } | undefined {
  const lines = text.split('\n')
  if (lines.length <= settings.maxLines) return undefined
  const head = lines.slice(0, settings.head)
  const tail = lines.slice(-settings.tail)
  const middle = lines.slice(settings.head, lines.length - settings.tail)
  // บรรทัดสำคัญตรงกลาง เก็บไม่เกิน 30 บรรทัด พร้อมเลขบรรทัดเดิม
  const keep = middle
    .map((l, i) => ({ l, n: i + settings.head + 1 }))
    .filter(x => IMPORTANT.test(x.l))
    .slice(0, 30)
  const cut = middle.length - keep.length
  const note = `… [Output Diet: ตัด ${cut} บรรทัดตรงกลางออก (ทั้งหมด ${lines.length} บรรทัด) output เต็มอยู่ที่ ${fullPath}${keep.length ? ` · ด้านล่างคือบรรทัดที่มีคำว่า error/fail/warning ${keep.length} บรรทัด` : ''}] …`
  const important = keep.length ? [...keep.map(x => `${x.n}: ${x.l}`), '…'] : []
  return { text: [...head, note, ...important, ...tail].join('\n'), cut }
}

async function saveFull($: EngineInterface, command: string, stdout: string, stderr: string): Promise<string> {
  const root = (await $.session.cwd()).replace(/[\\/]$/, '')
  slot = (slot % KEEP_FILES) + 1
  const path = `${root}/${DIR}/output-${slot}.log`
  await $.fs.write(path, `$ ${command}\n\n${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ''}`)
  return `${DIR}/output-${slot}.log`
}

function status($: EngineInterface): void {
  $.ui.status(settings.on && saved.trims ? `🥗 ประหยัด ~${saved.tokens.toLocaleString('en-US')} tokens` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = { ...settings, ...((await $.store.get('settings')) as Partial<typeof settings> | undefined) }
    saved = { tokens: 0, trims: 0 }
    slot = ((await $.store.get('slot')) as number | undefined) ?? 0
    await $.command.register({ name: 'diet', description: 'ตัด output ยาวของ Bash ก่อนส่งให้ Claude ประหยัด context (/diet help)', argumentHint: 'on|off | lines <n>' })
    status($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: ดักผลของ Bash แล้วส่งฉบับย่อให้ Claude
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (!settings.on || r.deny !== undefined || r.isError || /#\s*full\s*$/.test(e.command)) return r
    const out = r.result
    // ข้ามผลแบบพิเศษ: รูปภาพ, งาน background, ถูกหยุดกลางทาง, engine เก็บลงไฟล์ไว้แล้ว
    if (out.isImage || out.backgroundTaskId || out.interrupted || out.persistedOutputPath) return r
    if (out.stdout.split('\n').length <= settings.maxLines && out.stderr.split('\n').length <= settings.maxLines) return r

    const fullPath = await saveFull($, e.command, out.stdout, out.stderr)
    await $.store.set('slot', slot)
    const stdout = diet(out.stdout, fullPath)
    const stderr = diet(out.stderr, fullPath)
    if (!stdout && !stderr) return r

    const before = out.stdout.length + out.stderr.length
    const after = (stdout?.text ?? out.stdout).length + (stderr?.text ?? out.stderr).length
    saved = { tokens: saved.tokens + Math.round((before - after) / 4), trims: saved.trims + 1 }
    status($)
    // คืน result ใหม่ (ไม่มี ref/text) ให้ core แปลงเป็นข้อความสำหรับ Claude ใหม่
    return { result: { ...out, stdout: stdout?.text ?? out.stdout, stderr: stderr?.text ?? out.stderr } }
  })

  on('command.run', { command: 'diet' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    switch (sub) {
      case '':
        return { text: `🥗 Output Diet TH (Mod 83): ${settings.on ? 'เปิด' : 'ปิด'}\nตัดเมื่อเกิน ${settings.maxLines} บรรทัด (เก็บหัว ${settings.head} + ท้าย ${settings.tail} + บรรทัด error)\nsession นี้ตัดไป ${saved.trims} ครั้ง ประหยัด ~${saved.tokens.toLocaleString('en-US')} tokens\noutput เต็มอยู่ใน ${DIR}/` }
      case 'on':
      case 'off':
        settings = { ...settings, on: sub === 'on' }
        await $.store.set('settings', settings)
        status($)
        return { text: `🥗 Output Diet: ${settings.on ? 'เปิด' : 'ปิด'}` }
      case 'lines': {
        const n = Number(arg)
        if (!(n >= 50 && n <= 2000)) return { text: `วิธีใช้: /diet lines 150  (50-2000, ตอนนี้ ${settings.maxLines})` }
        settings = { ...settings, maxLines: n, head: Math.round(n * 0.27), tail: Math.round(n * 0.4) }
        await $.store.set('settings', settings)
        return { text: `🥗 ตัดเมื่อเกิน ${n} บรรทัด (หัว ${settings.head} + ท้าย ${settings.tail})` }
      }
      default:
        return { text: '🥗 Output Diet TH (Mod 83)\n/diet            ดูสถานะและที่ประหยัดได้\n/diet on|off     เปิด/ปิด\n/diet lines 150  เกณฑ์จำนวนบรรทัด\nใส่ "# full" ท้ายคำสั่งเมื่ออยากให้ Claude เห็นเต็ม' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ตัดผล Read ของไฟล์ log ขนาดใหญ่ด้วยวิธีเดียวกัน
 * 2. ใช้ $.model.complete (haiku) สรุป output ยาวแทนการตัดตรงๆ
 * 3. รวมยอดประหยัดข้าม session ใน $.store แล้วโชว์ใน Mod 46 AI Limit
 */
