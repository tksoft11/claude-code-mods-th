/**
 * ============================================================================
 * MOD 88: Session Wrapped TH - สรุป session แบบ Spotify Wrapped (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: session-wrapped ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. เก็บสถิติตลอด session: prompt, tool แต่ละชนิด, ไฟล์ที่แก้, บรรทัดที่เพิ่ม/ลบ,
 *    คำสั่งที่พัง, turn ที่นานที่สุด, subagent, ค่าใช้จ่าย
 * 2. /wrapped เปิดแผงเผยสถิติทีละหน้าแบบมีจังหวะ (เหมือน Spotify Wrapped)
 * 3. บอก "บุคลิก Claude ของคุณ" จาก tool ที่ใช้มากที่สุด
 * 4. /wrapped html สร้างการ์ด HTML สวยๆ ไว้แคปจอแชร์
 * 5. สถิติสะสมทุก session (/wrapped all)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const PANE = 'session-wrapped-th'

interface Stats {
  startedAt: number
  prompts: number
  turns: number
  turnMs: number
  longestMs: number
  tools: Record<string, number>
  files: Record<string, number>
  added: number
  removed: number
  fails: number
  agents: number
  costUsd: number
  hours: number[]
}

interface Lifetime {
  sessions: number
  prompts: number
  toolCalls: number
  added: number
  costUsd: number
}

let s: Stats = fresh(0)
let turnStart = 0
let slide = 0
let ticker: Timer | undefined

function fresh(now: number): Stats {
  return { startedAt: now, prompts: 0, turns: 0, turnMs: 0, longestMs: 0, tools: {}, files: {}, added: 0, removed: 0, fails: 0, agents: 0, costUsd: 0, hours: new Array<number>(24).fill(0) }
}

function lines(text: string): number {
  return text ? text.split('\n').length : 0
}

function dur(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} วินาที`
  return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`
}

function top(record: Record<string, number>, n: number): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function base(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// ==========================================================================
// บทที่ 1: บุคลิกจาก tool ที่ใช้มากที่สุด
// ==========================================================================
const PERSONA: Record<string, { name: string; say: string }> = {
  Read: { name: '🕵️ นักสืบ', say: 'อ่านก่อนลงมือเสมอ ไม่มีอะไรหลุดสายตา' },
  Grep: { name: '🔦 นักค้นหา', say: 'หาอะไรก็เจอ ในกองโค้ดมหึมา' },
  Glob: { name: '🗺️ นักสำรวจ', say: 'รู้จักทุกซอกทุกมุมของโปรเจกต์' },
  Edit: { name: '🛠️ ช่างฝีมือ', say: 'แก้ทีละจุด ประณีตทุกบรรทัด' },
  Write: { name: '✍️ นักเขียน', say: 'สร้างไฟล์ใหม่ได้ไม่หยุด' },
  Bash: { name: '⚡ นักซิ่ง CLI', say: 'terminal คือบ้าน คำสั่งคือภาษาแม่' },
  Agent: { name: '👑 หัวหน้าทีม', say: 'แบ่งงานให้ลูกทีมเก่งที่สุด' },
  WebFetch: { name: '🌐 นักท่องเว็บ', say: 'ข้อมูลล่าสุดต้องมาก่อน' },
  WebSearch: { name: '🌐 นักท่องเว็บ', say: 'ข้อมูลล่าสุดต้องมาก่อน' },
  TodoWrite: { name: '📋 นักวางแผน', say: 'มีแผนก่อน งานถึงจะเดิน' },
}

function persona(): { name: string; say: string } {
  const [first] = top(s.tools, 1)
  return (first && PERSONA[first[0]]) ?? { name: '🌱 มือใหม่ไฟแรง', say: 'เพิ่งเริ่ม แต่เริ่มได้ดี' }
}

function goldenHour(): string {
  const max = Math.max(...s.hours)
  if (max === 0) return '-'
  const h = s.hours.indexOf(max)
  return `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`
}

// ==========================================================================
// บทที่ 2: หน้าต่างๆ ของ Wrapped
// ==========================================================================
interface Slide {
  title: string
  big: string
  rows: string[]
  color: string
}

function slides(now: number): Slide[] {
  const toolTotal = Object.values(s.tools).reduce((a, b) => a + b, 0)
  const [file] = top(s.files, 1)
  const p = persona()
  return [
    { title: '🎬 Session นี้ของคุณ', big: dur(now - s.startedAt), rows: [`${s.prompts} prompt · ${s.turns} รอบคำตอบ`, `ช่วงเวลาทอง ${goldenHour()}`], color: '#ec407a' },
    { title: '🛠 tool ที่ใช้มากที่สุด', big: `${toolTotal} ครั้ง`, rows: top(s.tools, 3).map(([t, n], i) => `${i + 1}. ${t} ${'█'.repeat(Math.max(1, Math.round((n / Math.max(1, toolTotal)) * 20)))} ${n}`), color: '#ab47bc' },
    { title: '📁 ไฟล์ที่รักที่สุด', big: file ? base(file[0]) : '-', rows: [file ? `แก้ไป ${file[1]} ครั้ง` : 'ยังไม่ได้แก้ไฟล์', `แตะ ${Object.keys(s.files).length} ไฟล์ · +${s.added} -${s.removed} บรรทัด`], color: '#42a5f5' },
    { title: '⏱ รอบที่นานที่สุด', big: dur(s.longestMs), rows: [`เฉลี่ยรอบละ ${dur(s.turns ? s.turnMs / s.turns : 0)}`, s.agents ? `ส่งลูกทีม subagent ${s.agents} ตัว` : 'ทำเองหมดทุกอย่าง'], color: '#26a69a' },
    { title: '💥 ล้มแล้วลุก', big: `${s.fails} ครั้ง`, rows: [s.fails ? 'คำสั่งที่พังระหว่างทาง แต่ก็ไปต่อได้' : 'ไม่พังเลยสักครั้ง 🏆', s.costUsd ? `ค่าใช้จ่าย $${s.costUsd.toFixed(2)} (~${Math.round(s.costUsd * 36)} บาท)` : ''].filter(Boolean), color: '#ffa726' },
    { title: '🧬 บุคลิก Claude ของคุณ', big: p.name, rows: [p.say], color: '#7e57c2' },
  ]
}

function textSummary(now: number): string {
  return slides(now).map(x => `${x.title}\n  ${x.big}\n${x.rows.map(r => `  ${r}`).join('\n')}`).join('\n\n')
}

// ==========================================================================
// บทที่ 3: การ์ด HTML สำหรับแชร์
// ==========================================================================
function esc(text: string): string {
  return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

function html(now: number): string {
  const cards = slides(now)
    .map(x => `<section style="background:linear-gradient(135deg,${x.color},#1a1a2e)"><h2>${esc(x.title)}</h2><div class="big">${esc(x.big)}</div>${x.rows.map(r => `<p>${esc(r)}</p>`).join('')}</section>`)
    .join('\n')
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Code Wrapped</title>
<style>
body{margin:0;background:#0f0f1a;color:#fff;font-family:'Sarabun','Noto Sans Thai',system-ui,sans-serif;padding:24px}
h1{text-align:center;font-size:28px;margin:8px 0 24px}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:960px;margin:auto}
section{border-radius:20px;padding:24px;min-height:180px;box-shadow:0 8px 24px #0006}
h2{margin:0 0 12px;font-size:18px;opacity:.9}.big{font-size:34px;font-weight:800;margin-bottom:10px;word-break:break-word}
p{margin:4px 0;font-family:ui-monospace,monospace;font-size:13px;opacity:.85;white-space:pre}
footer{text-align:center;opacity:.5;margin-top:24px;font-size:12px}
</style></head><body>
<h1>✨ Claude Code Wrapped ✨</h1>
<main>
${cards}
</main>
<footer>${esc(new Date(now).toLocaleString('th-TH'))} · Session Wrapped TH (Mod 88)</footer>
</body></html>
`
}

async function saveLifetime($: EngineInterface): Promise<Lifetime> {
  const old = ((await $.store.get('lifetime')) as Lifetime | undefined) ?? { sessions: 0, prompts: 0, toolCalls: 0, added: 0, costUsd: 0 }
  const life = { sessions: old.sessions + 1, prompts: old.prompts + s.prompts, toolCalls: old.toolCalls + Object.values(s.tools).reduce((a, b) => a + b, 0), added: old.added + s.added, costUsd: old.costUsd + s.costUsd }
  await $.store.set('lifetime', life)
  return life
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    s = fresh(await $.clock.now())
    await $.command.register({ name: 'wrapped', description: 'สรุป session แบบ Spotify Wrapped + การ์ด HTML ไว้แชร์ (/wrapped help)', argumentHint: 'html | all' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: เก็บสถิติจาก event ต่างๆ
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      s.prompts++
      s.hours[new Date(await $.clock.now()).getHours()]!++
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turnStart = await $.clock.now()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && turnStart) {
      const ms = (await $.clock.now()) - turnStart
      s.turns++
      s.turnMs += ms
      s.longestMs = Math.max(s.longestMs, ms)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    s.tools[e.tool] = (s.tools[e.tool] ?? 0) + 1
    if (r.isError) s.fails++
    if (r.deny !== undefined || r.isError) return r
    if (e.tool === 'Edit') {
      s.files[e.file_path] = (s.files[e.file_path] ?? 0) + 1
      s.added += lines(e.new_string)
      s.removed += lines(e.old_string)
    } else if (e.tool === 'Write') {
      s.files[e.file_path] = (s.files[e.file_path] ?? 0) + 1
      s.added += lines(e.content)
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    s.agents++
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost) s.costUsd = e.cost.usd
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (s.prompts > 0) await saveLifetime($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: แผงเผยทีละหน้า
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = slides(await $.clock.now())
    return (
      <Box flexDirection="column">
        {all.slice(0, slide + 1).map(x => (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={x.color}>{x.title}</Text>
            <Text bold>{`  ${x.big}`}</Text>
            {x.rows.map(r => (
              <Text dimColor>{`  ${r}`}</Text>
            ))}
          </Box>
        ))}
        {slide < all.length - 1 && <Text dimColor>✨ …</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'wrapped' }, async ($, e) => {
    const sub = e.args.trim()
    const now = await $.clock.now()
    if (sub === 'html') {
      const d = new Date(now)
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
      const path = `.claude/wrapped/wrapped-${stamp}.html`
      await $.fs.write(`${(await $.session.cwd()).replace(/[\\/]$/, '')}/${path}`, html(now))
      return { text: `🎁 สร้างการ์ดแล้ว: ${path}\nเปิดในเบราว์เซอร์แล้วแคปจอแชร์ได้เลย` }
    }
    if (sub === 'all') {
      const life = ((await $.store.get('lifetime')) as Lifetime | undefined) ?? { sessions: 0, prompts: 0, toolCalls: 0, added: 0, costUsd: 0 }
      return { text: `🏛 สถิติสะสม (ไม่รวม session นี้)\n${life.sessions} sessions · ${life.prompts} prompts · ${life.toolCalls} tool calls\n+${life.added} บรรทัด · $${life.costUsd.toFixed(2)}` }
    }
    if (sub !== '') return { text: '🎁 Session Wrapped TH (Mod 88)\n/wrapped        เผยสถิติทีละหน้าในแผง\n/wrapped html   สร้างการ์ด HTML ไว้แชร์\n/wrapped all    สถิติสะสมทุก session' }
    // เผยทีละหน้า ทุก 1.5 วินาที
    slide = 0
    ticker?.cancel()
    await $.ui.open({ id: PANE, title: '🎁 Wrapped' })
    ticker = $.clock.every(1_500, () => {
      slide++
      $.ui.invalidate('ui.render')
      if (slide >= slides(now).length - 1) ticker?.cancel()
    })
    return { text: textSummary(now) }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. Wrapped รายเดือน: เก็บสถิติทุก session ลง $.store แล้วสรุปตอนสิ้นเดือน
 * 2. แปลงการ์ด HTML เป็นรูป PNG ด้วยเบราว์เซอร์ headless
 * 3. เทียบกับ session ก่อนหน้า: "เร็วขึ้น 20% จากครั้งที่แล้ว"
 */
