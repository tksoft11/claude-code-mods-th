/**
 * ============================================================================
 * MOD 82: Plan Progress TH - ติดตามแผนงาน (todo) ของ Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: plan-progress และ epic-progress ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดัก tool TodoWrite ที่ Claude ใช้จดแผนงาน แล้วแสดงแถบความคืบหน้าเหนือช่องพิมพ์
 *    เช่น "📝 แผน ▓▓▓▓░░░░ 3/7 · ▶ กำลังเขียนเทสต์"
 * 2. จับเวลาแต่ละข้อ: เริ่มเมื่อเป็น in_progress จบเมื่อเป็น completed
 * 3. ครบทุกข้อแล้วฉลองด้วย toast และแถบเขียวสักครู่ก่อนหายไป
 * 4. /plan ดูแผนทั้งหมดพร้อมเวลาที่ใช้ และ /plan pane เปิดเป็นแผงข้าง
 *
 * ดูเฉพาะแผนของ Claude ตัวหลัก (subagent มีแผนของตัวเอง ไม่นับรวม)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const PANE = 'plan-progress-th'

type Status = 'pending' | 'in_progress' | 'completed'
interface Item {
  content: string
  activeForm: string
  status: Status
  startedAt?: number
  doneAt?: number
}

let items: Item[] = []
let band = true
// เวลาที่แผนเสร็จครบ ใช้โชว์แถบเขียวสักครู่
let finishedAt = 0
let hideTimer: Timer | undefined

const MARK: Record<Status, string> = { pending: '☐', in_progress: '▶', completed: '☑' }
const COLOR: Record<Status, string> = { pending: '#90a4ae', in_progress: '#4fc3f7', completed: '#7cb342' }

function bar(done: number, total: number, width = 10): string {
  const filled = total ? Math.round((done / total) * width) : 0
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

function took(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} วิ` : `${Math.floor(s / 60)} นาที ${s % 60} วิ`
}

// ==========================================================================
// บทที่ 1: รวมรายการใหม่เข้ากับของเดิม (เก็บเวลาเริ่ม/จบของข้อที่มีอยู่แล้ว)
// ==========================================================================
function merge(todos: readonly { content: string; activeForm: string; status: Status }[], now: number): Item[] {
  return todos.map(t => {
    const old = items.find(i => i.content === t.content)
    const startedAt = old?.startedAt ?? (t.status !== 'pending' ? now : undefined)
    const doneAt = t.status === 'completed' ? (old?.doneAt ?? now) : undefined
    return { ...t, startedAt, doneAt }
  })
}

function counts(): { done: number; total: number; current?: Item } {
  return { done: items.filter(i => i.status === 'completed').length, total: items.length, current: items.find(i => i.status === 'in_progress') }
}

function listText(): string {
  if (items.length === 0) return '📝 ยังไม่มีแผน (Claude จะสร้างแผนเองเมื่อทำงานหลายขั้นตอน)'
  const { done, total } = counts()
  const lines = [`📝 แผนงาน ${done}/${total} ${bar(done, total, 20)}`, '']
  for (const i of items) {
    const time = i.startedAt && i.doneAt ? ` (${took(i.doneAt - i.startedAt)})` : ''
    lines.push(`${MARK[i.status]} ${i.status === 'in_progress' ? i.activeForm : i.content}${time}`)
  }
  return lines.join('\n')
}

// ==========================================================================
// บทที่ 2: ฉลองเมื่อครบ แล้วซ่อนแถบหลัง 15 วินาที
// ==========================================================================
function celebrate($: EngineInterface, now: number): void {
  const first = Math.min(...items.map(i => i.startedAt ?? now))
  finishedAt = now
  $.ui.toast(`🎉 แผนเสร็จครบ ${items.length} ข้อ ใช้เวลา ${took(now - first)}`, { timeoutMs: 8_000 })
  hideTimer?.cancel()
  hideTimer = $.clock.after(15_000, () => $.ui.invalidate('ui.render'))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    items = []
    finishedAt = 0
    band = ((await $.store.get('band')) as boolean | undefined) ?? true
    await $.command.register({ name: 'plan', description: 'ดูแผนงาน (todo) ของ Claude พร้อมเวลาแต่ละข้อ (/plan help)', argumentHint: 'pane | band on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดัก TodoWrite ของ Claude ตัวหลัก
  // ==========================================================================
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || r.deny !== undefined || r.isError) return r
    const now = await $.clock.now()
    const wasDone = items.length > 0 && counts().done === items.length
    items = merge(e.todos, now)
    const { done, total } = counts()
    if (total > 0 && done === total && !wasDone) celebrate($, now)
    else if (done < total) finishedAt = 0
    $.ui.invalidate('ui.render')
    return r
  })

  // ==========================================================================
  // บทที่ 4: แถบเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!band || items.length === 0 || e.props.hasSurvey) return next(e)
    const { done, total, current } = counts()
    const allDone = done === total
    if (allDone && (await $.clock.now()) - finishedAt > 15_000) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          <Text dimColor>📝 แผน </Text>
          <Text color={allDone ? '#7cb342' : '#4fc3f7'}>{bar(done, total)}</Text>
          <Text>{` ${done}/${total}`}</Text>
          {allDone ? <Text color="#7cb342">{' · 🎉 เสร็จครบ'}</Text> : current && <Text dimColor>{` · ▶ ${current.activeForm}`}</Text>}
        </Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: แผงแผนงาน
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (items.length === 0) return <Text dimColor>ยังไม่มีแผน</Text>
    const { done, total } = counts()
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="#4fc3f7">{bar(done, total, 20)}</Text>
          {` ${done}/${total}`}
        </Text>
        {items.map(i => (
          <Text color={COLOR[i.status]}>
            {`${MARK[i.status]} ${i.status === 'in_progress' ? i.activeForm : i.content}`}
            {i.startedAt && i.doneAt ? <Text dimColor>{` (${took(i.doneAt - i.startedAt)})`}</Text> : ''}
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'plan' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    switch (sub) {
      case '':
        return { text: listText() }
      case 'pane':
        await $.ui.open({ id: PANE, title: '📝 แผนงาน' })
        return { text: 'เปิดแผงแผนงานแล้ว' }
      case 'band':
        if (arg !== 'on' && arg !== 'off') return { text: 'วิธีใช้: /plan band on|off' }
        band = arg === 'on'
        await $.store.set('band', band)
        $.ui.invalidate('ui.render')
        return { text: `แถบแผนงาน: ${band ? 'แสดง' : 'ซ่อน'}` }
      default:
        return { text: '📝 Plan Progress TH (Mod 82)\n/plan            ดูแผนทั้งหมดพร้อมเวลา\n/plan pane       เปิดเป็นแผงข้าง\n/plan band on|off  แถบเหนือช่องพิมพ์' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. บันทึกแผนที่เสร็จแล้วลงไฟล์ เป็นสรุปงานประจำวัน
 * 2. เตือนเมื่อข้อไหนค้าง in_progress นานเกิน 10 นาที
 * 3. ฉลองด้วยพลุของ Mod 45 Celebrate แทน toast
 */
