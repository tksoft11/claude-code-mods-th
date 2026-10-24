/**
 * ============================================================================
 * MOD 81: Prompt Queue TH - คิวงานต่อท้าย และคำถามข้างทาง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: after (midudev) และ aside ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. /after <งาน> ต่อคิวงานไว้ พอ Claude ตอบงานปัจจุบันเสร็จจะส่งงานถัดไปให้เอง
 *    ไม่ต้องนั่งรอ และไม่ไปขัดงานที่กำลังทำ (ต่างจากการพิมพ์แทรกกลางงาน)
 * 2. แถบเหนือช่องพิมพ์บอกว่าคิวเหลือกี่งาน งานต่อไปคืออะไร
 * 3. ถ้างานล่าสุดถูกหยุดหรือ error คิวจะหยุดรอ ไม่ยิงงานต่อไปใส่ของที่พัง
 * 4. /aside <คำถาม> ถาม fork ของ session ในแผงข้าง: รู้บริบทเดิมทั้งหมด
 *    แต่คำถามและคำตอบไม่เข้าไปในบทสนทนาหลัก (ไม่เปลือง context)
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'prompt-queue-aside'

let queue: string[] = []
let paused = false
let working = false
let asides: { q: string; a: string; pending: boolean }[] = []

function short(text: string, max = 60): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

// ==========================================================================
// บทที่ 1: ส่งงานถัดไปในคิว
// ==========================================================================
function sendNext($: EngineInterface): void {
  const task = queue.shift()
  if (task === undefined) return
  $.ui.toast(`📋 ส่งงานจากคิว: ${short(task)}${queue.length ? ` (เหลืออีก ${queue.length})` : ''}`)
  $.ui.invalidate('ui.render')
  // ไม่ await: prompt.submit จะรันเป็น turn ใหม่เมื่อ session ว่าง
  void $.prompt.submit({ text: task, asUser: true })
}

function listText(): string {
  if (queue.length === 0) return '📋 คิวว่าง เพิ่มด้วย /after <งาน>'
  return [`📋 คิวงาน ${queue.length} งาน${paused ? ' (หยุดรออยู่ /after go เพื่อไปต่อ)' : ''}`, ...queue.map((t, i) => `${i + 1}. ${short(t, 100)}`)].join('\n')
}

// ==========================================================================
// บทที่ 2: ถามข้างทางด้วย fork
// ==========================================================================
async function ask($: EngineInterface, q: string): Promise<void> {
  const entry = { q, a: '', pending: true }
  asides = [...asides.slice(-9), entry]
  $.ui.invalidate('ui.render')
  const r = await $.model.fork({ prompt: `(คำถามข้างทาง ตอบสั้นๆ ไม่ต้องทำงานต่อ ไม่ต้องใช้ tool)\n${q}` })
  entry.a = r.isAnswered ? r.text.trim() : r.reason === 'nothing-to-fork' ? '⏳ ยังไม่มีบทสนทนาให้ fork ถามหลังคำตอบแรกของ Claude นะ' : `❌ ถามไม่สำเร็จ (${r.reason})`
  entry.pending = false
  $.ui.invalidate('ui.render')
}

const HELP = `📋 Prompt Queue TH (Mod 81)
========================================
/after <งาน>       ต่อคิว ส่งให้ Claude เมื่องานปัจจุบันเสร็จ
/after             ดูคิว
/after go          ส่งงานถัดไปเดี๋ยวนี้ (หรือไปต่อหลังคิวหยุด)
/after drop <ลำดับ>  เอางานออกจากคิว
/after clear       ล้างคิว
/aside <คำถาม>     ถามข้างทางในแผง ไม่เข้าบทสนทนาหลัก`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    queue = []
    paused = false
    working = false
    asides = []
    await $.command.register({ name: 'after', description: 'ต่อคิวงานให้ Claude ทำหลังงานปัจจุบันเสร็จ (/after help)', argumentHint: '<งาน> | go | drop <n> | clear' })
    await $.command.register({ name: 'aside', description: 'ถามข้างทางในแผง โดยไม่เข้าบทสนทนาหลัก', argumentHint: '<คำถาม>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: รู้ว่า Claude ทำงานอยู่ไหม และส่งงานต่อตอนจบ turn
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    working = false
    if (queue.length > 0) {
      if (e.reason === 'answer' && !paused) sendNext($)
      else if (!paused) {
        paused = true
        $.ui.toast(`⏸ คิวหยุดรอ เพราะงานล่าสุด${e.reason === 'aborted' ? 'ถูกหยุด' : 'ไม่สำเร็จ'} พิมพ์ /after go เพื่อไปต่อ`, { timeoutMs: 12_000 })
      }
    }
    $.ui.invalidate('ui.render')
    return r
  })

  // ==========================================================================
  // บทที่ 4: แถบคิวเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (queue.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text>
          <Text color={paused ? '#fb8c00' : '#4fc3f7'}>{paused ? '⏸ คิวหยุดรอ' : '📋 คิว'}</Text>
          <Text dimColor>{` ${queue.length} งาน · ต่อไป: `}</Text>
          <Text>{short(queue[0] ?? '', 50)}</Text>
        </Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: แผงคำถามข้างทาง
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (asides.length === 0) return <Text dimColor>ถามด้วย /aside &lt;คำถาม&gt;</Text>
    return (
      <Box flexDirection="column">
        {asides.map(x => (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="#ce93d8">{`❓ ${x.q}`}</Text>
            {x.pending ? <Text dimColor>💭 กำลังคิด…</Text> : <Text>{x.a}</Text>}
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'aside' }, async ($, e) => {
    const q = e.args.trim()
    if (!q) return { text: 'วิธีใช้: /aside <คำถาม>  เช่น /aside ฟังก์ชันที่เพิ่งแก้ไปเรียกจากที่ไหนบ้าง' }
    await $.ui.open({ id: PANE, title: '💭 Aside' })
    void ask($, q)
    return { text: `💭 ถามข้างทางในแผงแล้ว: ${short(q)}` }
  })

  on('command.run', { command: 'after' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/)
    switch (sub) {
      case '':
        return { text: listText() }
      case 'help':
        return { text: HELP }
      case 'go':
        if (queue.length === 0) return { text: '📋 คิวว่าง' }
        paused = false
        if (working) return { text: '▶️ ไปต่อแล้ว จะส่งงานถัดไปเมื่อ Claude ตอบเสร็จ' }
        sendNext($)
        return { text: '▶️ ส่งงานถัดไปแล้ว' }
      case 'clear':
        queue = []
        paused = false
        $.ui.invalidate('ui.render')
        return { text: '🧹 ล้างคิวแล้ว' }
      case 'drop': {
        const i = Number(rest[0]) - 1
        if (!(i >= 0 && i < queue.length)) return { text: `วิธีใช้: /after drop <ลำดับ>\n${listText()}` }
        const [gone] = queue.splice(i, 1)
        $.ui.invalidate('ui.render')
        return { text: `🗑 เอาออกแล้ว: ${short(gone ?? '')}` }
      }
      default: {
        queue = [...queue, args]
        $.ui.invalidate('ui.render')
        // Claude ว่างอยู่และคิวไม่ได้หยุด: ส่งเลย ไม่ต้องรอ
        if (!working && !paused && queue.length === 1) {
          sendNext($)
          return { text: `📋 Claude ว่างอยู่ ส่งเลย: ${short(args)}` }
        }
        return { text: `📋 ต่อคิวแล้ว (ลำดับที่ ${queue.length}): ${short(args)}` }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. /after edit <ลำดับ> แก้ข้อความงานในคิวด้วย $.prompt.fill
 * 2. ส่งแจ้งเตือนไปมือถือเมื่อคิวหมด (ต่อกับ Mod 22)
 * 3. ปุ่ม "ถามต่อ" ในแผง aside ที่ส่งคำถามเข้าบทสนทนาหลักจริง
 */
