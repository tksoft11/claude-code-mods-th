/**
 * ============================================================================
 * MOD 89: Achievements TH - ปลดล็อกความสำเร็จจากการทำงานกับ Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: laurels (KOZMOS) ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ความสำเร็จ 31 อย่าง เช่น นกฮูกราตรี (ทำงานตีหนึ่ง), นักฆ่าบั๊ก (เทสต์ที่พังกลับมาผ่าน),
 *    พหุภาษา (แก้ไฟล์ 5 ภาษา), ไร้ที่ติ (tool 50 ครั้งไม่พังเลย)
 * 2. ปลดล็อกแล้วเด้ง toast ฉลอง เก็บไว้ข้าม session
 * 3. /badges เปิดแผงตู้โชว์: ได้แล้วกี่อัน อันที่ยังล็อกบอกวิธีปลด
 *
 * ทุกอย่างนับจาก event ของ engine ในเครื่อง ไม่ส่งข้อมูลไปไหน
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'achievements-th'
const TEST_CMD = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|pytest|jest|vitest|go\s+test|cargo\s+test|dotnet\s+test|phpunit|rspec|mvn\s+test|gradle\w*\s+test)\b/

// นับสะสมข้าม session
interface Life {
  sessions: number
  prompts: number
  commits: number
  edits: number
  webs: number
  thai: number
  exts: string[]
}

// นับเฉพาะ session นี้
interface Sess {
  startedAt: number
  tools: number
  fails: number
  agents: number
  reads: string[]
  testFailed: boolean
  costUsd: number
  prompts: number
}

interface Ctx {
  life: Life
  s: Sess
  // เหตุการณ์ครั้งเดียวที่เพิ่งเกิด
  flag: Set<string>
}

interface Badge {
  id: string
  icon: string
  name: string
  how: string
  check: (c: Ctx) => boolean
}

// ==========================================================================
// บทที่ 1: รายการความสำเร็จ
// ==========================================================================
const BADGES: Badge[] = [
  { id: 'first', icon: '🩸', name: 'ก้าวแรก', how: 'ส่ง prompt แรก', check: c => c.life.prompts >= 1 },
  { id: 'hello', icon: '👋', name: 'Hello World', how: 'ให้ Claude สร้างไฟล์ใหม่', check: c => c.flag.has('created') },
  { id: 'centurion', icon: '💯', name: 'ร้อยหมัด', how: 'ใช้ tool 100 ครั้งใน session เดียว', check: c => c.s.tools >= 100 },
  { id: 'flawless', icon: '💎', name: 'ไร้ที่ติ', how: 'ใช้ tool 50 ครั้งโดยไม่พังเลย', check: c => c.s.tools >= 50 && c.s.fails === 0 },
  { id: 'phoenix', icon: '🔥', name: 'ฟีนิกซ์', how: 'คำสั่งพัง 10 ครั้งใน session แต่ยังสู้ต่อ', check: c => c.s.fails >= 10 },
  { id: 'marathon', icon: '🏃', name: 'มาราธอน', how: 'ทำงาน session เดียวนานเกิน 3 ชั่วโมง', check: c => c.flag.has('marathon') },
  { id: 'night-owl', icon: '🦉', name: 'นกฮูกราตรี', how: 'ส่ง prompt ช่วงเที่ยงคืนถึงตีห้า', check: c => c.flag.has('night') },
  { id: 'early-bird', icon: '🐦', name: 'นกตื่นเช้า', how: 'ส่ง prompt ช่วงตีห้าถึงเจ็ดโมง', check: c => c.flag.has('early') },
  { id: 'weekend', icon: '🏖️', name: 'นักรบวันหยุด', how: 'ทำงานวันเสาร์หรืออาทิตย์', check: c => c.flag.has('weekend') },
  { id: 'committer', icon: '📦', name: 'Commit แรก', how: 'git commit สำเร็จ', check: c => c.life.commits >= 1 },
  { id: 'commit-50', icon: '📚', name: 'นักบันทึกประวัติศาสตร์', how: 'git commit ครบ 50 ครั้ง', check: c => c.life.commits >= 50 },
  { id: 'shipper', icon: '🚀', name: 'ปล่อยของ', how: 'git push สำเร็จ', check: c => c.flag.has('push') },
  { id: 'bug-squasher', icon: '🐛', name: 'นักฆ่าบั๊ก', how: 'เทสต์ที่พังกลับมาผ่านใน session เดียวกัน', check: c => c.flag.has('fixed-test') },
  { id: 'tester', icon: '🧪', name: 'สายเทสต์', how: 'เขียนหรือแก้ไฟล์เทสต์', check: c => c.flag.has('test-file') },
  { id: 'docs', icon: '📝', name: 'คนรักเอกสาร', how: 'เขียนหรือแก้ไฟล์ .md', check: c => c.flag.has('md') },
  { id: 'polyglot', icon: '🌏', name: 'พหุภาษา', how: 'แก้ไฟล์ 5 นามสกุลที่ต่างกัน (สะสม)', check: c => c.life.exts.length >= 5 },
  { id: 'polyglot-10', icon: '🗺️', name: 'ล่ามจักรวาล', how: 'แก้ไฟล์ 10 นามสกุลที่ต่างกัน (สะสม)', check: c => c.life.exts.length >= 10 },
  { id: 'team-lead', icon: '👑', name: 'หัวหน้าทีม', how: 'ส่ง subagent 3 ตัวใน session เดียว', check: c => c.s.agents >= 3 },
  { id: 'web', icon: '🌐', name: 'นักท่องเว็บ', how: 'ให้ Claude ค้นเว็บ/อ่านเว็บ 10 ครั้ง (สะสม)', check: c => c.life.webs >= 10 },
  { id: 'planner', icon: '📋', name: 'นักวางแผน', how: 'Claude ทำแผนงาน 5 ข้อขึ้นไป', check: c => c.flag.has('big-plan') },
  { id: 'compactor', icon: '🗜️', name: 'บีบอัดแล้วไปต่อ', how: 'ผ่านการ compact บทสนทนา', check: c => c.flag.has('compact') },
  { id: 'speedrun', icon: '⚡', name: 'Speedrun', how: 'รอบคำตอบที่แก้ไฟล์เสร็จในไม่ถึง 15 วินาที', check: c => c.flag.has('speedrun') },
  { id: 'deep', icon: '🧘', name: 'คิดลึก', how: 'รอบคำตอบเดียวนานเกิน 10 นาที', check: c => c.flag.has('deep') },
  { id: 'explorer', icon: '🔭', name: 'นักสำรวจ', how: 'อ่าน 50 ไฟล์ที่ต่างกันใน session เดียว', check: c => c.s.reads.length >= 50 },
  { id: 'cleaner', icon: '🧹', name: 'นักเก็บกวาด', how: 'Edit ครั้งเดียวที่ลบมากกว่าเพิ่ม 30 บรรทัด', check: c => c.flag.has('cleanup') },
  { id: 'edits-500', icon: '✂️', name: 'ช่างฝีมือ', how: 'แก้ไฟล์ครบ 500 ครั้ง (สะสม)', check: c => c.life.edits >= 500 },
  { id: 'regular', icon: '📅', name: 'ขาประจำ', how: 'เปิด 10 sessions', check: c => c.life.sessions >= 10 },
  { id: 'veteran', icon: '🎖️', name: 'ทหารผ่านศึก', how: 'เปิด 100 sessions', check: c => c.life.sessions >= 100 },
  { id: 'thrifty', icon: '🪙', name: 'นักประหยัด', how: '10 prompt ใน session เดียว ใช้เงินไม่ถึง $0.50', check: c => c.s.prompts >= 10 && c.s.costUsd > 0 && c.s.costUsd < 0.5 },
  { id: 'thai', icon: '🇹🇭', name: 'หัวใจไทย', how: 'สั่งงานเป็นภาษาไทย 50 ครั้ง (สะสม)', check: c => c.life.thai >= 50 },
  { id: 'polite', icon: '🙏', name: 'มีมารยาท', how: 'ขอบคุณ Claude', check: c => c.flag.has('thanks') },
]

let life: Life = { sessions: 0, prompts: 0, commits: 0, edits: 0, webs: 0, thai: 0, exts: [] }
let s: Sess = freshSession(0)
let unlocked: Record<string, number> = {}
let turnStart = 0
let editedThisTurn = false

function freshSession(now: number): Sess {
  return { startedAt: now, tools: 0, fails: 0, agents: 0, reads: [], testFailed: false, costUsd: 0, prompts: 0 }
}

// ==========================================================================
// บทที่ 2: ตรวจทุกครั้งที่มีอะไรเกิดขึ้น แล้วฉลองอันที่เพิ่งได้
// ==========================================================================
async function award($: EngineInterface, flags: string[] = []): Promise<void> {
  const c: Ctx = { life, s, flag: new Set(flags) }
  const now = await $.clock.now()
  const fresh = BADGES.filter(b => !unlocked[b.id] && b.check(c))
  if (fresh.length === 0) return
  for (const b of fresh) {
    unlocked[b.id] = now
    $.ui.toast(`🏆 ปลดล็อก! ${b.icon} ${b.name} — ${b.how}`, { timeoutMs: 8_000 })
  }
  await $.store.set('unlocked', unlocked)
  $.ui.invalidate('ui.render')
}

async function saveLife($: EngineInterface): Promise<void> {
  await $.store.set('life', life)
}

function ext(path: string): string | undefined {
  const m = /\.([A-Za-z0-9]+)$/.exec(path)
  return m?.[1]?.toLowerCase()
}

function showcase(): string {
  const got = BADGES.filter(b => unlocked[b.id])
  const lines = [`🏆 ความสำเร็จ ${got.length}/${BADGES.length}`, '']
  for (const b of BADGES) lines.push(unlocked[b.id] ? `${b.icon} ${b.name}` : `🔒 ${b.name}: ${b.how}`)
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    life = { ...life, ...((await $.store.get('life')) as Partial<Life> | undefined) }
    unlocked = ((await $.store.get('unlocked')) as Record<string, number> | undefined) ?? {}
    s = freshSession(now)
    life.sessions++
    await saveLife($)
    await $.command.register({ name: 'badges', description: 'ตู้โชว์ความสำเร็จ: ได้แล้วกี่อัน อันที่ยังล็อกปลดยังไง', argumentHint: 'list' })
    const d = new Date(now)
    await award($, d.getDay() === 0 || d.getDay() === 6 ? ['weekend'] : [])
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: prompt ของเรา - เวลา ภาษา มารยาท
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'plugin') return next(e)
    const now = await $.clock.now()
    const hour = new Date(now).getHours()
    life.prompts++
    s.prompts++
    if (/[฀-๿]/.test(e.text)) life.thai++
    const flags = [
      ...(hour < 5 ? ['night'] : []),
      ...(hour >= 5 && hour < 7 ? ['early'] : []),
      ...(now - s.startedAt > 3 * 3_600_000 ? ['marathon'] : []),
      ...(/ขอบคุณ|ขอบใจ|\bthank/i.test(e.text) ? ['thanks'] : []),
    ]
    await award($, flags)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: tool - แก้ไฟล์ git เทสต์ เว็บ
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const existed = e.tool === 'Write' ? await $.fs.exists(e.file_path) : true
    const r = await next(e)
    if (r.deny !== undefined) return r
    s.tools++
    const flags: string[] = []
    if (r.isError) s.fails++
    if (e.tool === 'Bash') {
      if (TEST_CMD.test(e.command)) {
        if (r.isError) s.testFailed = true
        else if (s.testFailed) flags.push('fixed-test')
      }
      if (!r.isError && /\bgit\s+commit\b/.test(e.command)) life.commits++
      if (!r.isError && /\bgit\s+push\b/.test(e.command)) flags.push('push')
    }
    if (!r.isError && (e.tool === 'Edit' || e.tool === 'Write')) {
      life.edits++
      editedThisTurn = true
      const x = ext(e.file_path)
      if (x && !life.exts.includes(x)) life.exts = [...life.exts, x]
      if (x === 'md') flags.push('md')
      if (/(\.test\.|\.spec\.|[\\/]tests?[\\/]|[\\/]test_[^\\/]*$|_test\.\w+$)/.test(e.file_path)) flags.push('test-file')
      if (e.tool === 'Write' && !existed) flags.push('created')
      if (e.tool === 'Edit' && e.old_string.split('\n').length - e.new_string.split('\n').length >= 30) flags.push('cleanup')
    }
    if (!r.isError && e.tool === 'Read' && !s.reads.includes(e.file_path)) s.reads = [...s.reads, e.file_path]
    if (!r.isError && (e.tool === 'WebFetch' || e.tool === 'WebSearch')) life.webs++
    if (!r.isError && e.tool === 'TodoWrite' && e.todos.length >= 5) flags.push('big-plan')
    await award($, flags)
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    s.agents++
    await award($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: จังหวะของรอบคำตอบ
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnStart = await $.clock.now()
      editedThisTurn = false
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || !turnStart) return r
    const ms = (await $.clock.now()) - turnStart
    const flags = [...(ms < 15_000 && editedThisTurn && e.reason === 'answer' ? ['speedrun'] : []), ...(ms > 600_000 ? ['deep'] : [])]
    await award($, flags)
    await saveLife($)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await award($, ['compact'])
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost) s.costUsd = e.cost.usd
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await saveLife($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 6: ตู้โชว์
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const got = BADGES.filter(b => unlocked[b.id]).length
    return (
      <Box flexDirection="column">
        <Text color="#ffd54f">{`🏆 ${got}/${BADGES.length}  ${'★'.repeat(Math.round((got / BADGES.length) * 10))}${'☆'.repeat(10 - Math.round((got / BADGES.length) * 10))}`}</Text>
        {BADGES.map(b =>
          unlocked[b.id] ? (
            <Text>{`${b.icon} ${b.name}`}</Text>
          ) : (
            <Text dimColor>{`🔒 ${b.name} · ${b.how}`}</Text>
          ),
        )}
      </Box>
    )
  })

  on('command.run', { command: 'badges' }, async ($, e) => {
    if (e.args.trim() === 'list') return { text: showcase() }
    await $.ui.open({ id: PANE, title: '🏆 ความสำเร็จ' })
    const got = BADGES.filter(b => unlocked[b.id]).length
    return { text: `🏆 ได้แล้ว ${got}/${BADGES.length} อัน (เปิดตู้โชว์ในแผงแล้ว · /badges list ดูเป็นข้อความ)` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เล่นเสียงตอนปลดล็อกด้วย $.audio.play (ใส่ไฟล์เสียงในโฟลเดอร์ mod)
 * 2. ความสำเร็จลับ: ซ่อนวิธีปลดไว้จนกว่าจะได้
 * 3. ใส่เหรียญที่ได้ลงการ์ดของ Mod 88 Session Wrapped
 */
