/**
 * ============================================================================
 * MOD 93: Collision Guard TH - กันชนกันระหว่าง Claude หลายหน้าต่าง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: collision-guard ใน awesome-claude-code-mods
 *
 * ปัญหา: เปิด Claude 2 หน้าต่างในโปรเจกต์เดียวกัน แล้วทั้งคู่แก้ไฟล์เดียวกัน
 * งานของอีกหน้าต่างหายโดยไม่รู้ตัว
 *
 * หน้าที่ของ Mod นี้:
 * 1. ทุกการแก้ไฟล์ (Edit/Write) จดลงสมุดกลางของโปรเจกต์ .claude/collision-guard.json
 *    ว่า session ไหนแก้ไฟล์อะไรเมื่อไหร่
 * 2. ก่อน Claude แก้ไฟล์ที่ Claude "อีกหน้าต่าง" เพิ่งแก้ภายใน 30 นาที ถามเราก่อน
 *    แก้ต่อ / ยกเลิก (ยกเลิก = บอก Claude ให้อ่านไฟล์ใหม่และประสานงานก่อน)
 * 3. /collision ดูว่าไฟล์ไหนกำลังถูกหน้าต่างอื่นแก้อยู่
 *
 * ทำงานได้เพราะทุกหน้าต่างอ่าน/เขียนสมุดเล่มเดียวกันในโฟลเดอร์โปรเจกต์
 */

import type { EngineInterface, Register } from 'claude-code'

const BOOK = '.claude/collision-guard.json'
const KEEP_MS = 24 * 3_600_000

interface Entry {
  session: string
  at: number
}

let windowMin = 30
let me = ''
let root = ''

function key(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

function rel(path: string): string {
  const r = `${key(root)}/`
  const p = path.replace(/\\/g, '/')
  return p.toLowerCase().startsWith(r) ? p.slice(r.length) : p
}

// ==========================================================================
// บทที่ 1: สมุดกลางของโปรเจกต์
// ==========================================================================
async function readBook($: EngineInterface): Promise<Record<string, Entry>> {
  const path = `${root}/${BOOK}`
  if (!(await $.fs.exists(path))) return {}
  try {
    return JSON.parse((await $.fs.read(path)) as string) as Record<string, Entry>
  } catch {
    return {}
  }
}

async function stamp($: EngineInterface, file: string): Promise<void> {
  const now = await $.clock.now()
  const book = await readBook($)
  // ทิ้งรายการเก่ากว่า 1 วัน ไม่ให้สมุดโตไม่หยุด
  const fresh = Object.fromEntries(Object.entries(book).filter(([, v]) => now - v.at < KEEP_MS))
  fresh[key(file)] = { session: me, at: now }
  await $.fs.write(`${root}/${BOOK}`, JSON.stringify(fresh, null, 1))
}

function ago(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 1 ? 'เมื่อสักครู่' : `${m} นาทีก่อน`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    me = await $.session.id()
    root = (await $.session.cwd()).replace(/[\\/]$/, '')
    windowMin = ((await $.store.get('windowMin')) as number | undefined) ?? 30
    await $.command.register({ name: 'collision', description: 'กันชน: ถามก่อนแก้ไฟล์ที่ Claude อีกหน้าต่างเพิ่งแก้ (/collision help)', argumentHint: 'window <นาที>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: ก่อนแก้ ตรวจว่าหน้าต่างอื่นเพิ่งแก้ไฟล์นี้ไหม
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Edit' && e.tool !== 'Write') return next(e)
    const file = e.file_path
    const other = (await readBook($))[key(file)]
    const now = await $.clock.now()
    if (other && other.session !== me && now - other.at < windowMin * 60_000) {
      const answer = await $.ui
        .ask(`⚠️ ${rel(file)} ถูก Claude อีกหน้าต่างแก้${ago(now - other.at)} จะให้หน้าต่างนี้แก้ต่อไหม?`, { header: 'Collision', options: ['แก้ต่อ', 'ยกเลิก'] })
        .catch(() => '')
      if (answer !== 'แก้ต่อ') {
        return { deny: `Collision Guard: ${rel(file)} เพิ่งถูกแก้โดย Claude อีกหน้าต่างหนึ่ง${ago(now - other.at)} ${answer === 'ยกเลิก' ? 'ผู้ใช้เลือกไม่ให้แก้' : 'ถามผู้ใช้ไม่ได้'} ให้อ่านไฟล์ใหม่ทั้งไฟล์ แล้วถามผู้ใช้ก่อนว่าจะประสานงานกันอย่างไร` }
      }
    }
    const r = await next(e)
    if (r.deny === undefined && !r.isError) await stamp($, file).catch(() => undefined)
    return r
  })

  // ==========================================================================
  // บทที่ 3: ดูว่าใครแก้อะไรอยู่
  // ==========================================================================
  on('command.run', { command: 'collision' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    if (sub === 'window') {
      const n = Number(arg)
      if (!(n >= 1 && n <= 24 * 60)) return { text: `วิธีใช้: /collision window 30  (ตอนนี้ ${windowMin} นาที)` }
      windowMin = n
      await $.store.set('windowMin', n)
      return { text: `🚧 ถามก่อนแก้ไฟล์ที่หน้าต่างอื่นแก้ภายใน ${n} นาที` }
    }
    if (sub !== '') return { text: `🚧 Collision Guard TH (Mod 93)\n/collision               ดูไฟล์ที่หน้าต่างอื่นเพิ่งแก้\n/collision window <นาที>  ช่วงเวลาที่ถือว่า "เพิ่งแก้" (ตอนนี้ ${windowMin})\nสมุดกลาง: ${BOOK}` }
    const now = await $.clock.now()
    const recent = Object.entries(await readBook($))
      .filter(([, v]) => now - v.at < windowMin * 60_000)
      .sort((a, b) => b[1].at - a[1].at)
    if (recent.length === 0) return { text: `🚧 ไม่มีไฟล์ที่ถูกแก้ใน ${windowMin} นาทีล่าสุด` }
    const lines = [`🚧 ไฟล์ที่ถูกแก้ใน ${windowMin} นาทีล่าสุด`]
    for (const [path, v] of recent) lines.push(`${v.session === me ? '🟢 หน้าต่างนี้ ' : '🟠 หน้าต่างอื่น'}  ${rel(path)}  ${ago(now - v.at)}`)
    return { text: lines.join('\n') }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ตัวเลือกที่สาม: "ย้ายไปทำใน git worktree" ด้วย git worktree add
 * 2. เตือนตั้งแต่ Claude "อ่าน" ไฟล์ที่อีกหน้าต่างกำลังแก้
 * 3. ส่งข้อความหาอีกหน้าต่างผ่าน $.session.send ให้คุยกันเอง
 */
