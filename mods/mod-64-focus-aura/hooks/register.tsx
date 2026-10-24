/**
 * ============================================================================
 * MOD 64: Focus Aura TH - ออร่าโฟกัสระหว่าง Claude ทำงาน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ไฟสถานะ "On Air" หน้าห้องอัด และแอปฝึกหายใจ
 *
 * หน้าที่ของ Mod นี้:
 * 1. ระหว่างที่ Claude ทำงาน จะมีแถบสีพาสเทลเหนือช่องพิมพ์ บอกว่ากำลังทำเรื่องอะไร
 *    (จากข้อความที่คุณสั่ง) และผ่านไปกี่นาที
 * 2. แถบ "หายใจ" สีไล่ไปมาช้าๆ เข้า 4 วิ ออก 4 วิ ชวนให้ใจเย็นตอนรอ
 * 3. เสร็จแล้วแสดงเวลาที่ใช้ 10 วินาทีแล้วหายไป
 * 4. ห่อของเดิมไว้ ({await next(e)}) จึงใช้ร่วมกับ Mod ที่วาดเหนือช่องพิมพ์ตัวอื่นได้ (Mod 01, 44)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

const THEMES: Record<string, string[]> = {
  sakura: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f8bbd0'],
  ocean: ['#e0f7fa', '#b2ebf2', '#80deea', '#b2ebf2'],
  matcha: ['#f1f8e9', '#dcedc8', '#c5e1a5', '#dcedc8'],
  lavender: ['#f3e5f5', '#e1bee7', '#ce93d8', '#e1bee7'],
}

let theme = 'sakura'
let enabled = true
let task = ''
let pendingTask = ''
let startedAt = 0
let doneAt = 0
let tookMs = 0
let working = false
let ticker: Timer | undefined

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function stop(): void {
  ticker?.cancel()
  ticker = undefined
}

// ==========================================================================
// บทที่ 1: จังหวะหายใจ - 8 วินาทีต่อรอบ (เข้า 4 ออก 4)
// ==========================================================================
function breath(ms: number): { color: string; word: string } {
  const colors = THEMES[theme] ?? THEMES.sakura ?? ['#f8bbd0']
  const phase = (ms % 8000) / 8000
  const idx = Math.min(colors.length - 1, Math.floor(phase * colors.length))
  return { color: colors[idx] ?? '#f8bbd0', word: phase < 0.5 ? 'หายใจเข้า' : 'หายใจออก' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('aura')) as { theme?: string; enabled?: boolean } | undefined
    theme = saved?.theme && THEMES[saved.theme] ? saved.theme : 'sakura'
    enabled = saved?.enabled ?? true
    await $.command.register({ name: 'aura', description: 'ออร่าโฟกัสสีพาสเทลเหนือช่องพิมพ์ระหว่าง Claude ทำงาน (/aura)', argumentHint: `on|off|${Object.keys(THEMES).join('|')}` })
    return next(e)
  })

  // จำเรื่องที่สั่ง (บรรทัดแรก ตัดให้สั้น) ไว้แสดงบนแถบ
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'sdk') pendingTask = e.text.trim().split('\n')[0]?.slice(0, 50) ?? ''
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: เริ่ม/จบ - timer ทำงานเฉพาะตอน Claude ทำงาน
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      working = true
      task = pendingTask
      startedAt = await $.clock.now()
      doneAt = 0
      stop()
      if (enabled) ticker = $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && working) {
      working = false
      stop()
      doneAt = await $.clock.now()
      tookMs = doneAt - startedAt
      $.ui.invalidate('ui.render')
      // ข้อความ "เสร็จแล้ว" อยู่ 10 วิ แล้วหายไป
      $.clock.after(10_000, () => $.ui.invalidate('ui.render'))
    }
    return r
  })

  // ==========================================================================
  // บทที่ 3: วาดออร่า - ต่อท้ายสิ่งที่ Mod อื่น/engine วาดไว้เหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!enabled || e.props.hasSurvey) return next(e)
    const now = await $.clock.now()
    const showDone = !working && doneAt > 0 && now - doneAt < 10_000
    if (!working && !showDone) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const b = breath(now - startedAt)
    const colors = THEMES[theme] ?? []
    return (
      <Box flexDirection="column">
        {await next(e)}
        {working ? (
          <Text color={b.color}>
            {`✦ ── 🎯 Claude กำลังโฟกัส${task ? `: ${task}` : ''} · ${clock(now - startedAt)} · ${b.word} ── ✦`}
          </Text>
        ) : (
          <Text color={colors[2] ?? '#f48fb1'}>{`🌸 เสร็จแล้ว ใช้เวลา ${clock(tookMs)}${task ? ` · ${task}` : ''}`}</Text>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'aura' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'on' || sub === 'off') enabled = sub === 'on'
    else if (THEMES[sub]) theme = sub
    else return { text: `✨ Focus Aura (Mod 64) ${enabled ? 'เปิด' : 'ปิด'} · ธีม ${theme}\n/aura on|off\n/aura ${Object.keys(THEMES).join(' | ')}` }
    if (!enabled) stop()
    await $.store.set('aura', { theme, enabled })
    $.ui.invalidate('ui.render')
    return { text: enabled ? `✨ ออร่าธีม ${theme}` : 'ปิดออร่าแล้ว' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เปลี่ยนสีออร่าตามความยากของงาน (จำนวน tool ที่ใช้)
 * 2. ทำโหมด "ห้ามรบกวน": ระหว่างออร่าเปิด ปิดการแจ้งเตือนอื่น
 * 3. นับเวลาที่ Claude ทำงานให้รวมทั้งวัน
 */
