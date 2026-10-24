/**
 * ============================================================================
 * MOD 51: Code Critic TH - AI ตัวที่สองคอยรีวิวโค้ดที่ Claude เพิ่งเขียน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: การรีวิวโค้ดแบบ pair programming - คนเขียนกับคนตรวจไม่ใช่คนเดียวกัน
 *
 * หน้าที่ของ Mod นี้:
 * 1. จำว่าในรอบนี้ Claude แก้ไฟล์ไหนบ้าง (Edit / Write / MultiEdit / NotebookEdit)
 * 2. /critic - ส่ง diff ของไฟล์เหล่านั้นให้ Haiku รีวิว หาบั๊ก ช่องโหว่ ท่าที่ไม่ควรทำ
 *    ผลรีวิวขึ้นในแชตให้คุณอ่าน (โมเดลหลักไม่เห็น จนกว่าคุณสั่ง /critic fix)
 * 3. /critic auto on - รีวิวเองทุกครั้งที่ Claude ทำงานเสร็จและมีการแก้ไฟล์
 * 4. เตือนเมื่อไฟล์เดียวถูกแก้วนเกิน 4 รอบใน 1 ชั่วโมง (สัญญาณว่ากำลังแก้ปลายเหตุ)
 * 5. เลือกโทนได้: ตรงไปตรงมา หรือแบบน่ารัก 🌸
 */

import type { EngineInterface, Register } from 'claude-code'

const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const CHURN_LIMIT = 4
const CHURN_WINDOW = 60 * 60_000
const MAX_PROMPT = 24_000

let touched = new Set<string>() // ไฟล์ที่แก้ในรอบนี้
let lastTouched: string[] = [] // ไฟล์ของรอบล่าสุดที่จบแล้ว
let edits = new Map<string, number[]>() // เวลาที่แก้แต่ละไฟล์
let warnedAt = new Map<string, number>()
let lastReview = ''
let settings = { auto: false, tone: 'plain' as 'plain' | 'cute' }
let reviewing = false

// ==========================================================================
// บทที่ 1: เก็บรายชื่อไฟล์ที่ถูกแก้ + นับการแก้วน
// ==========================================================================
function fileOf(e: Record<string, unknown>): string | undefined {
  const p = e.file_path ?? e.notebook_path
  return typeof p === 'string' ? p : undefined
}

function churnCount(file: string, now: number): number {
  return (edits.get(file) ?? []).filter(t => now - t < CHURN_WINDOW).length
}

function shortName(file: string): string {
  return file.split(/[\\/]/).slice(-2).join('/')
}

// ==========================================================================
// บทที่ 2: รวบรวมสิ่งที่จะให้รีวิว - git diff ถ้ามี ไม่งั้นอ่านไฟล์ตรงๆ
// ==========================================================================
async function collect($: EngineInterface, files: string[]): Promise<string> {
  const parts: string[] = []
  let size = 0
  for (const file of files) {
    if (size > MAX_PROMPT) break
    const diff = await $.process.run(['git', 'diff', '--no-color', '-U4', '--', file], { timeoutMs: 15_000 }).catch(() => undefined)
    let body = diff && diff.exitCode === 0 ? diff.stdout.trim() : ''
    if (!body) {
      // ไฟล์ใหม่ / ไม่ได้อยู่ใน git: ส่งเนื้อไฟล์ (ตัดหัว 300 บรรทัด)
      const text = await $.fs.read(file).catch(() => '')
      body = text ? `(ไฟล์ทั้งไฟล์)\n${text.split('\n').slice(0, 300).join('\n')}` : ''
    }
    if (!body) continue
    const chunk = `### ${file}\n${body.slice(0, MAX_PROMPT - size)}`
    parts.push(chunk)
    size += chunk.length
  }
  return parts.join('\n\n')
}

// ==========================================================================
// บทที่ 3: ให้ Haiku รีวิว - สั่งให้ชี้เฉพาะปัญหาจริง ไม่บ่นเรื่องรสนิยม
// ==========================================================================
async function review($: EngineInterface, files: string[]): Promise<string> {
  const material = await collect($, files)
  if (!material) return '🤷 ไม่พบการเปลี่ยนแปลงให้รีวิว (ไฟล์อาจถูก commit ไปแล้ว)'
  const tone =
    settings.tone === 'cute'
      ? 'ใช้น้ำเสียงอ่อนโยน น่ารัก ให้กำลังใจ ลงท้ายด้วย "นะคะ" ได้ ใส่ emoji ดอกไม้หรือหัวใจได้เล็กน้อย แต่เนื้อหาต้องตรงประเด็น'
      : 'ใช้น้ำเสียงตรงไปตรงมาแบบเพื่อนร่วมทีมอาวุโส'
  const system = `คุณเป็นผู้รีวิวโค้ด ตอบเป็นภาษาไทย ${tone}
หาเฉพาะปัญหาที่มีผลจริง: บั๊ก, กรณีขอบที่พัง, ช่องโหว่ความปลอดภัย, ข้อมูลลับในโค้ด, การจัดการ error ที่หายไป, ท่าที่อันตราย (เช่น any ใน TypeScript ที่ซ่อนบั๊ก, var, SQL ต่อ string)
ห้ามติเรื่องรสนิยม การตั้งชื่อ หรือ format
รูปแบบ: ไม่เกิน 5 ข้อ แต่ละข้อขึ้นต้นด้วย "ไฟล์:บรรทัดโดยประมาณ" ตามด้วยปัญหาและวิธีแก้สั้นๆ
ถ้าไม่พบปัญหาสำคัญ ตอบบรรทัดเดียวว่า LGTM พร้อมเหตุผลสั้นๆ`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt: material, maxTokens: 900 }).catch(() => undefined)
    if (r?.isAnswered) return r.text.trim()
  }
  return '❌ รีวิวไม่สำเร็จ (เรียกโมเดลไม่ได้)'
}

async function runReview($: EngineInterface, files: string[]): Promise<string> {
  if (reviewing) return '⏳ กำลังรีวิวอยู่'
  reviewing = true
  try {
    lastReview = await review($, files)
    return lastReview
  } finally {
    reviewing = false
  }
}

function header(files: string[]): string {
  return `${settings.tone === 'cute' ? '🌸 รีวิวน้อยๆ' : '🧐 Code Critic'}: ${files.map(shortName).join(', ')}`
}

function log($: EngineInterface, text: string): void {
  try {
    $.ui.log(text)
  } catch {}
}

const HELP = `🧐 Code Critic TH (Mod 51)
========================================
/critic                 รีวิวไฟล์ที่ Claude แก้ในรอบล่าสุด
/critic file <path>     รีวิวไฟล์ที่ระบุ
/critic fix             ส่งผลรีวิวล่าสุดให้ Claude แก้ต่อ
/critic auto on|off     รีวิวเองทุกครั้งที่ Claude แก้ไฟล์เสร็จ (ตอนนี้: AUTO) *ใช้ token เพิ่ม
/critic tone plain|cute โทนการรีวิว (ตอนนี้: TONE)
/critic churn           ไฟล์ที่ถูกแก้วนบ่อยใน 1 ชั่วโมง`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = { ...settings, ...((await $.store.get('settings')) as typeof settings | undefined) }
    touched = new Set()
    edits = new Map()
    await $.command.register({ name: 'critic', description: 'ให้ AI ตัวที่สองรีวิวโค้ดที่ Claude เพิ่งแก้ (/critic help)', argumentHint: 'file <path>|fix|auto on|off|tone plain|cute|churn' })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) touched = new Set()
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ดักการแก้ไฟล์ - สำเร็จแล้วค่อยนับ
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!EDIT_TOOLS.includes(e.tool) || r.deny !== undefined || r.isError) return r
    const file = fileOf(e as unknown as Record<string, unknown>)
    if (!file) return r
    touched.add(file)
    const now = await $.clock.now()
    edits.set(file, [...(edits.get(file) ?? []).filter(t => now - t < CHURN_WINDOW), now])
    const n = churnCount(file, now)
    if (n >= CHURN_LIMIT && now - (warnedAt.get(file) ?? 0) > CHURN_WINDOW) {
      warnedAt.set(file, now)
      log($, `${settings.tone === 'cute' ? '🥺' : '🔁'} ${shortName(file)} ถูกแก้ ${n} รอบใน 1 ชั่วโมงแล้ว อาจกำลังแก้ปลายเหตุ ลองให้รีวิวทั้งไฟล์: /critic file ${file}`)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || touched.size === 0) return r
    lastTouched = [...touched]
    if (settings.auto && e.reason !== 'aborted' && e.reason !== 'error') {
      const files = lastTouched
      // ไม่ await: ไม่ให้รอบถัดไปต้องรอรีวิว
      void runReview($, files).then(text => log($, `${header(files)}\n${text}\n(ให้ Claude แก้ตาม: /critic fix)`))
    }
    return r
  })

  on('command.run', { command: 'critic' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        const files = touched.size ? [...touched] : lastTouched
        if (files.length === 0) return { text: 'ยังไม่มีไฟล์ที่ Claude แก้ใน session นี้ (หรือใช้ /critic file <path>)' }
        return { text: `${header(files)}\n\n${await runReview($, files)}\n\nให้ Claude แก้ตาม: /critic fix` }
      }
      case 'file': {
        const path = rest.join(' ').replace(/^["']|["']$/g, '')
        if (!path) return { text: 'วิธีใช้: /critic file src/app.ts' }
        if (!(await $.fs.exists(path))) return { text: `❌ ไม่พบไฟล์ ${path}` }
        return { text: `${header([path])}\n\n${await runReview($, [path])}\n\nให้ Claude แก้ตาม: /critic fix` }
      }
      case 'fix':
        if (!lastReview || lastReview.startsWith('LGTM')) return { text: lastReview ? '✅ รีวิวล่าสุดผ่านแล้ว ไม่มีอะไรต้องแก้' : 'ยังไม่มีผลรีวิว: /critic ก่อน' }
        void $.prompt.submit({ text: `ผู้รีวิวโค้ดอีกคนให้ความเห็นมาแบบนี้ ช่วยตรวจว่าแต่ละข้อจริงไหม แล้วแก้เฉพาะข้อที่ถูกต้อง (ข้อไหนไม่เห็นด้วยให้บอกเหตุผล):\n\n${lastReview}` })
        return { text: '📨 ส่งผลรีวิวให้ Claude แล้ว' }
      case 'auto':
      case 'tone': {
        const value = rest[0] ?? ''
        const ok = sub === 'auto' ? ['on', 'off'].includes(value) : ['plain', 'cute'].includes(value)
        if (!ok) return { text: sub === 'auto' ? 'วิธีใช้: /critic auto on|off' : 'วิธีใช้: /critic tone plain|cute' }
        settings = sub === 'auto' ? { ...settings, auto: value === 'on' } : { ...settings, tone: value as 'plain' | 'cute' }
        await $.store.set('settings', settings)
        return { text: sub === 'auto' ? `🤖 รีวิวอัตโนมัติ: ${settings.auto ? 'เปิด (ใช้ token เพิ่มทุกครั้งที่แก้ไฟล์)' : 'ปิด'}` : `🎨 โทน: ${settings.tone === 'cute' ? 'น่ารัก 🌸' : 'ตรงไปตรงมา'}` }
      }
      case 'churn': {
        const now = await $.clock.now()
        const rows = [...edits.keys()].map(f => [f, churnCount(f, now)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
        return { text: rows.length ? ['🔁 การแก้ไฟล์ใน 1 ชั่วโมงล่าสุด', ...rows.slice(0, 15).map(([f, n]) => `  ${String(n).padStart(3)}×  ${shortName(f)}${n >= CHURN_LIMIT ? '  ⚠️' : ''}`)].join('\n') : 'ยังไม่มีการแก้ไฟล์ใน 1 ชั่วโมงล่าสุด' }
      }
      default:
        return { text: HELP.replace('AUTO', settings.auto ? 'เปิด' : 'ปิด').replace('TONE', settings.tone) }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. รีวิวเฉพาะไฟล์ภาษาที่สนใจ (เช่น .ts .py) ข้ามไฟล์ markdown
 * 2. เก็บประวัติรีวิวแล้วดูว่าปัญหาแบบไหนเจอบ่อยที่สุด
 * 3. ให้ผู้รีวิวใช้กฎของทีมจากไฟล์ .critic.md ในโปรเจกต์
 */
