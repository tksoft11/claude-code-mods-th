/**
 * ============================================================================
 * MOD 90: Boss Fight TH - เทสต์พัง = บอสโผล่ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: boss-fight ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. Claude รันเทสต์ (npm test, pytest, go test, cargo test ...) แล้วพัง
 *    บอสผีไทยโผล่เหนือช่องพิมพ์ HP = จำนวนเทสต์ที่พัง
 * 2. รันเทสต์ครั้งถัดไปพังน้อยลง = ฟาดโดน HP ลด / พังมากขึ้น = บอสโกรธ HP เพิ่ม
 * 3. ผ่านหมด = KO! ได้ของรางวัล และนับสถิติบอสที่ปราบได้ข้าม session
 * 4. /boss ดูสถานะและสถิติ, /boss flee หนีบอส
 *
 * อ่านจำนวนที่พังจาก output ของ test runner ยอดนิยม ถ้าอ่านไม่ออกแต่คำสั่งพัง นับเป็น 1
 */

import type { EngineInterface, Register } from 'claude-code'

const TEST_CMD = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:jest|vitest|mocha)|pytest|jest|vitest|mocha|go\s+test|cargo\s+test|dotnet\s+test|phpunit|rspec|mvn\s+test|gradle\w*\s+test|flutter\s+test|deno\s+test)\b/

interface Boss {
  name: string
  art: string[]
  maxHp: number
  hp: number
  hits: number
  bornAt: number
}

interface Trophy {
  defeated: number
  fastestMs?: number
  biggest: number
}

const ROSTER: { name: string; art: string[] }[] = [
  { name: 'ทศกัณฐ์ บั๊กสิบหน้า', art: ['  ╔╦╦╦╗  ', ' (ಠ益ಠ)ψ ', '  /██\\   '] },
  { name: 'พญานาค NullPointer', art: ['  ~∿∿∿~  ', ' <(◉_◉)> ', '  ∿∿∿∿∿  '] },
  { name: 'กระสือ Segfault', art: ['  (⊙⊙)   ', ' ~~╲╱~~  ', '  ✧ ✧ ✧  '] },
  { name: 'ปอบ Race Condition', art: ['  ▄▄▄▄   ', ' (◣_◢)⚡ ', '  ▀██▀   '] },
  { name: 'เปรต Memory Leak', art: ['   (ºдº) ', '    ║║   ', '    ║║   '] },
  { name: 'ยักษ์ Off-by-One', art: [' ▐▀▀▀▀▌  ', ' ▐(ò_ó)▌ ', '  ╯██╰   '] },
]

const LOOT = ['🗡 ดาบ Refactor', '🛡 โล่ Type Safety', '💊 ยา Unit Test', '📜 คัมภีร์ Clean Code', '🔮 ลูกแก้ว Debugger', '🧿 เครื่องราง Lint', '⚗️ น้ำยา Coverage 100%', '👟 รองเท้า CI เร็วจี๋']

let boss: Boss | null = null
let hitAt = 0
let lastMsg = ''
let rec: Trophy = { defeated: 0, biggest: 0 }

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}

// ==========================================================================
// บทที่ 1: อ่านจำนวนเทสต์ที่พังจาก output
// ==========================================================================
// บรรทัดสรุปที่บอกว่าพังกี่ตัว: jest/vitest/pytest/mocha "3 failed", rspec "2 failures", cargo "1 failed", dotnet "Failed: 2"
const FAIL_LINE = [/(\d+)\s+(?:failed|failing|failures?)\b/i, /\bFailed:\s+(\d+)/]
// บรรทัดสรุปที่บอกว่าผ่าน: "10 passed", mocha "10 passing", cargo "test result: ok", phpunit "OK (10 tests)"
const PASS_LINE = /\b\d+\s+(?:passed|passing)\b|test result: ok\b|\bOK \(\d+ tests?|\bPassed!/i

function failures(output: string, isError: boolean): number {
  // go test: นับบรรทัด --- FAIL: ทั้งหมด
  const goFails = (output.match(/^--- FAIL:/gm) ?? []).length
  if (goFails) return goFails
  // อ่านบรรทัดสรุป "บรรทัดสุดท้าย" เป็นคำตัดสิน (คำสั่งเดียวอาจรันเทสต์หลายรอบ)
  let verdict: number | undefined
  for (const line of output.split('\n')) {
    const fail = FAIL_LINE.map(p => p.exec(line)).find(m => m)
    if (fail) verdict = Number(fail[1])
    else if (PASS_LINE.test(line)) verdict = 0
  }
  if (verdict !== undefined && Number.isFinite(verdict)) return verdict
  return isError ? 1 : 0
}

function hpBar(b: Boss, width = 20): string {
  const filled = Math.ceil((b.hp / b.maxHp) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function dur(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 1 ? `${Math.round(ms / 1000)} วินาที` : `${m} นาที`
}

// ==========================================================================
// บทที่ 2: การต่อสู้
// ==========================================================================
async function fight($: EngineInterface, failed: number): Promise<void> {
  const now = await $.clock.now()
  if (!boss) {
    if (failed === 0) return
    const kind = pick(ROSTER)
    boss = { ...kind, maxHp: failed, hp: failed, hits: 0, bornAt: now }
    lastMsg = `⚔️ ${kind.name} ปรากฏตัว! HP ${failed}`
    $.ui.toast(`👹 บอสโผล่! ${kind.name} (HP ${failed}) เทสต์พัง ${failed} ตัว`, { timeoutMs: 8_000 })
  } else if (failed === 0) {
    const took = now - boss.bornAt
    const loot = pick(LOOT)
    rec = { defeated: rec.defeated + 1, fastestMs: Math.min(rec.fastestMs ?? Infinity, took), biggest: Math.max(rec.biggest, boss.maxHp) }
    await $.store.set('record', rec)
    $.ui.toast(`🏆 K.O.! ปราบ ${boss.name} ใน ${boss.hits + 1} ดาบ (${dur(took)}) ได้ ${loot}`, { timeoutMs: 10_000 })
    lastMsg = `🏆 K.O.! ได้ ${loot}`
    boss = null
  } else if (failed < boss.hp) {
    const dmg = boss.hp - failed
    boss = { ...boss, hp: failed, hits: boss.hits + 1 }
    hitAt = now
    lastMsg = `💥 ฟาดโดน! -${dmg} HP`
  } else if (failed > boss.hp) {
    const heal = failed - boss.hp
    boss = { ...boss, hp: failed, maxHp: Math.max(boss.maxHp, failed) }
    lastMsg = `😡 บอสโกรธ! HP +${heal}`
  } else {
    lastMsg = '🛡 บอสปัดป้อง ยังพังเท่าเดิม'
  }
  // สั่นสักครู่หลังโดนฟาด แล้ววาดใหม่ให้หยุดสั่น
  $.ui.invalidate('ui.render')
  $.clock.after(1_200, () => $.ui.invalidate('ui.render'))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    boss = null
    lastMsg = ''
    rec = { ...rec, ...((await $.store.get('record')) as Partial<Trophy> | undefined) }
    await $.command.register({ name: 'boss', description: 'เทสต์พัง = บอสผีไทยโผล่ แก้ให้ผ่านเพื่อ KO (/boss help)', argumentHint: 'flee' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดักคำสั่งเทสต์
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || !TEST_CMD.test(e.command)) return r
    const output = r.isError ? (r.text ?? '') : `${r.result.stdout}\n${r.result.stderr}`
    await fight($, failures(output, r.isError === true))
    return r
  })

  // ==========================================================================
  // บทที่ 4: วาดบอสเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!boss || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const shaking = (await $.clock.now()) - hitAt < 1_200
    const pad = shaking ? ' ' : ''
    const ratio = boss.hp / boss.maxHp
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="row" gap={2}>
          <Box flexDirection="column">
            {boss.art.map(l => (
              <Text color={shaking ? '#ffffff' : '#e53935'}>{pad + l}</Text>
            ))}
          </Box>
          <Box flexDirection="column">
            <Text bold>{`👹 ${boss.name}`}</Text>
            <Text>
              <Text color={ratio > 0.5 ? '#e53935' : ratio > 0.25 ? '#fb8c00' : '#fdd835'}>{hpBar(boss)}</Text>
              {` HP ${boss.hp}/${boss.maxHp}`}
            </Text>
            <Text dimColor>{lastMsg}</Text>
          </Box>
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'boss' }, async ($, e) => {
    const sub = e.args.trim()
    if (sub === 'flee') {
      if (!boss) return { text: 'ไม่มีบอสให้หนี 😌' }
      const name = boss.name
      boss = null
      $.ui.invalidate('ui.render')
      return { text: `🏃💨 หนี ${name} มาได้... ครั้งหน้าไม่รอดแน่` }
    }
    if (sub !== '') return { text: '👹 Boss Fight TH (Mod 90)\n/boss        สถานะบอสและสถิติ\n/boss flee   หนีบอส (ซ่อนบอสตัวปัจจุบัน)\nบอสโผล่เองเมื่อ Claude รันเทสต์แล้วพัง' }
    const lines = [boss ? `👹 ${boss.name}  ${hpBar(boss)} HP ${boss.hp}/${boss.maxHp} · ฟาดไป ${boss.hits} ครั้ง` : '😌 ยังไม่มีบอส (บอสโผล่เมื่อเทสต์พัง)', '']
    lines.push(`🏆 ปราบไปแล้ว ${rec.defeated} ตัว · บอสใหญ่สุด HP ${rec.biggest}${rec.fastestMs !== undefined ? ` · KO เร็วสุด ${dur(rec.fastestMs)}` : ''}`)
    return { text: lines.join('\n') }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เสียงฟาดและเสียง KO ด้วย $.audio.play
 * 2. บอสใหญ่ประจำสัปดาห์: นับเทสต์ที่พังสะสมทั้งสัปดาห์
 * 3. ให้ Mod 89 Achievements ได้เหรียญ "ผู้ปราบมาร" เมื่อปราบบอสครบ 10 ตัว
 */
