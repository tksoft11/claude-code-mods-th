/**
 * ============================================================================
 * MOD 73: Typing Racer TH - แข่งพิมพ์เร็วสาย Dev (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: TypeRacer และ Monkeytype
 *
 * หน้าที่ของ Mod นี้:
 * 1. /typing [code|th|en] - สุ่มประโยคให้พิมพ์: โค้ดจริง (มีวงเล็บ ลูกศร), คำสั่ง git/npm, ประโยคไทย
 * 2. พิมพ์ลงช่องในแผง: ตัวที่ถูกเป็นสีเขียว ผิดเป็นสีแดง รถ 🏎 วิ่งตามความคืบหน้า
 * 3. แข่งกับ "ผี" 👻 = สถิติดีที่สุดของคุณในหมวดนั้น วิ่งด้วยความเร็วเดิมของคุณ
 * 4. จบแล้วได้ WPM (คำต่อนาที, 1 คำ = 5 ตัวอักษร) + ความแม่นยำ เก็บสถิติไว้
 *
 * ใช้ element Input (มีบน terminal, VS Code, Desktop) - บนมือถือยังพิมพ์ในแผงไม่ได้
 */

import type { Register } from 'claude-code'

type Mode = 'code' | 'th' | 'en'
const PANE = 'typing-racer-th'

const TEXTS: Record<Mode, string[]> = {
  code: [
    'const users = await db.query("SELECT * FROM users WHERE active = true");',
    'export function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) }',
    'if (!response.ok) throw new Error(`HTTP ${response.status}`);',
    'git commit -m "fix(auth): handle expired token" && git push origin main',
    'docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16',
    'const [count, setCount] = useState(0); useEffect(() => setCount(c => c + 1), []);',
    'for i, line in enumerate(open("log.txt")): print(f"{i:04d} {line.strip()}")',
    'SELECT name, COUNT(*) AS orders FROM customers JOIN orders USING (id) GROUP BY name;',
  ],
  th: [
    'โค้ดที่ดีไม่ใช่โค้ดที่ไม่มีบั๊ก แต่เป็นโค้ดที่อ่านแล้วหาบั๊กเจอง่าย',
    'ก่อนแก้บั๊ก ให้เขียนเทสต์ที่ทำให้บั๊กนั้นเกิดขึ้นซ้ำได้เสียก่อน',
    'ตั้งชื่อตัวแปรให้คนอ่านเข้าใจ ไม่ใช่ให้คอมพิวเตอร์เข้าใจ',
    'อย่าลืม commit บ่อยๆ และเขียนข้อความให้อนาคตตัวเองอ่านรู้เรื่อง',
    'ปัญหาใหญ่แก้ได้ด้วยการแบ่งเป็นปัญหาเล็กที่ทดสอบได้ทีละชิ้น',
  ],
  en: [
    'Make it work, make it right, make it fast, in that order.',
    'Programs must be written for people to read, and only incidentally for machines to execute.',
    'The best error message is the one that never shows up.',
    'Simplicity is prerequisite for reliability.',
    'First, solve the problem. Then, write the code.',
  ],
}

interface Race {
  mode: Mode
  target: string
  typed: string
  startedAt: number
  endedAt: number
  errors: number
  ghostMs?: number // เวลาของสถิติดีที่สุด (ผีวิ่งตามนี้)
}

let race: Race | undefined
let best: Partial<Record<Mode, { wpm: number; ms: number; accuracy: number }>> = {}
let history: { mode: Mode; wpm: number; accuracy: number }[] = []

// ==========================================================================
// บทที่ 1: วัดผล - WPM มาตรฐาน: (ตัวอักษร / 5) ต่อนาที
// ==========================================================================
function chars(s: string): string[] {
  return [...s]
}

function wpm(r: Race, now: number): number {
  const minutes = Math.max(1, (r.endedAt || now) - r.startedAt) / 60_000
  return Math.round(chars(r.typed).length / 5 / minutes)
}

function accuracy(r: Race): number {
  const total = chars(r.typed).length + r.errors
  return total ? Math.round(((total - r.errors) / total) * 100) : 100
}

function track(progress: number, icon: string, width = 40): string {
  const pos = Math.min(width, Math.round(progress * width))
  return `${'·'.repeat(pos)}${icon}${'·'.repeat(width - pos)}🏁`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    best = ((await $.store.get('best')) as typeof best | undefined) ?? {}
    history = ((await $.store.get('history')) as typeof history | undefined) ?? []
    await $.command.register({ name: 'typing', description: 'แข่งพิมพ์เร็วสาย Dev: โค้ด / ไทย / อังกฤษ วัด WPM (/typing [code|th|en|stats])', argumentHint: 'code|th|en|stats' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: แผงแข่ง - ประโยคระบายสีตามที่พิมพ์ + ลู่วิ่งของเรากับผี
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    // มือถือยังไม่มีช่องกรอก: เช็คก่อนว่าหน้าจอนี้มี Input ไหม
    const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : undefined
    const r = race
    if (!r) return <Text dimColor>/typing code | th | en</Text>
    const now = await $.clock.now()
    const target = chars(r.target)
    const typed = chars(r.typed)
    const done = r.endedAt > 0
    const elapsed = r.startedAt ? (r.endedAt || now) - r.startedAt : 0
    const ghost = r.ghostMs && r.startedAt ? Math.min(1, elapsed / r.ghostMs) : 0
    // จุดแรกที่พิมพ์ผิด: หลังจากนั้นเป็นสีแดงทั้งหมดจนกว่าจะลบแก้
    let firstWrong = typed.findIndex((c, i) => c !== target[i])
    if (firstWrong < 0) firstWrong = typed.length
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="#66bb6a">{target.slice(0, firstWrong).join('')}</Text>
          <Text color="#ffffff" backgroundColor="#e53935">
            {target.slice(firstWrong, typed.length).join('')}
          </Text>
          <Text dimColor>{target.slice(Math.max(firstWrong, typed.length)).join('')}</Text>
        </Text>
        <Text>{`คุณ ${track(firstWrong / target.length, '🏎')}`}</Text>
        {r.ghostMs !== undefined && <Text dimColor>{`ผี  ${track(ghost, '👻')}`}</Text>}
        <Text dimColor>{`⏱ ${(elapsed / 1000).toFixed(1)}s · ${wpm(r, now)} WPM · แม่น ${accuracy(r)}%`}</Text>
        {done ? (
          <Text bold color="#ffca28">{`🏁 จบ! ${wpm(r, now)} WPM · แม่นยำ ${accuracy(r)}% ${r.ghostMs !== undefined && elapsed < r.ghostMs ? '· ชนะผี! 🏆' : ''} (/typing เล่นอีกรอบ)`}</Text>
        ) : Input ? (
          <Input
            key="type"
            autoFocus
            placeholder="เริ่มพิมพ์ได้เลย (เวลาเริ่มนับเมื่อพิมพ์ตัวแรก)"
            onInput={(value: string) => {
              const cur = race
              if (!cur || cur.endedAt) return
              void $.clock.now().then(async t => {
                if (!cur.startedAt) cur.startedAt = t
                // นับผิดเมื่อเพิ่มตัวอักษรที่ไม่ตรง (ลบแก้ไม่ลดจำนวนที่ผิด เหมือนเกมจริง)
                const next = chars(value)
                if (next.length > chars(cur.typed).length && next[next.length - 1] !== chars(cur.target)[next.length - 1]) cur.errors++
                cur.typed = value
                if (value === cur.target) {
                  cur.endedAt = t
                  const score = { wpm: wpm(cur, t), ms: t - cur.startedAt, accuracy: accuracy(cur) }
                  history = [...history, { mode: cur.mode, wpm: score.wpm, accuracy: score.accuracy }].slice(-100)
                  if (!best[cur.mode] || score.ms < (best[cur.mode]?.ms ?? Infinity)) {
                    best = { ...best, [cur.mode]: score }
                    $.ui.toast(`🏆 สถิติใหม่ ${cur.mode}: ${score.wpm} WPM`)
                  }
                  await $.store.set('best', best)
                  await $.store.set('history', history)
                }
                $.ui.invalidate('ui.render')
              })
            }}
            onSubmit={() => undefined}
          />
        ) : (
          <Text dimColor>หน้าจอนี้ยังพิมพ์ในแผงไม่ได้ ลองบน terminal หรือ VS Code</Text>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'typing' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'stats') {
      const rows = (['code', 'th', 'en'] as Mode[]).map(m => `  ${m.padEnd(5)} ${best[m] ? `${best[m]?.wpm} WPM · แม่น ${best[m]?.accuracy}% · ${((best[m]?.ms ?? 0) / 1000).toFixed(1)}s` : '-'}`)
      const recent = history.slice(-10)
      const avg = recent.length ? Math.round(recent.reduce((s, h) => s + h.wpm, 0) / recent.length) : 0
      return { text: [`⌨️ สถิติดีที่สุด`, ...rows, '', `10 รอบล่าสุด เฉลี่ย ${avg} WPM`].join('\n') }
    }
    const mode: Mode = sub === 'th' || sub === 'en' ? sub : 'code'
    const list = TEXTS[mode]
    const target = list[Math.floor(((await $.clock.now()) / 997) % list.length)] ?? list[0] ?? ''
    race = { mode, target, typed: '', startedAt: 0, endedAt: 0, errors: 0, ghostMs: best[mode]?.ms }
    await $.ui.open({ id: PANE, title: `⌨️ Typing Racer (${mode})`, focus: true, closeOnEscape: true })
    $.ui.invalidate('ui.render')
    return { text: `⌨️ พิมพ์ประโยคนี้ให้เร็วและแม่นที่สุด:\n${target}${best[mode] ? `\n👻 ผีของคุณ: ${best[mode]?.wpm} WPM` : ''}` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ดึงบรรทัดโค้ดจริงจากโปรเจกต์ที่เปิดอยู่มาให้พิมพ์
 * 2. โหมดมาราธอน: พิมพ์ต่อกัน 5 ประโยค
 * 3. แสดงตัวอักษรที่พิมพ์ผิดบ่อยที่สุด
 */
