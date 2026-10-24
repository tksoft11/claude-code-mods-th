/**
 * ============================================================================
 * MOD 45: Celebrate TH - ฉลองความสำเร็จ พลุกระดาษ + แตรฉลอง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เอฟเฟกต์พลุตอนปิดงานใน Asana และ Linear
 *
 * หน้าที่ของ Mod นี้:
 * 1. /celebrate - พลุกระดาษ (confetti) ตกลงมาในแผง พร้อมเสียงแตรที่สังเคราะห์เอง
 * 2. ฉลองอัตโนมัติเมื่อ Claude รันคำสั่งแล้วสำเร็จจริง:
 *    เทสต์ผ่าน / git commit สำเร็จ / deploy สำเร็จ (ดูจากผลลัพธ์ Bash)
 * 3. สถิติความสำเร็จ: วันนี้ / ทั้งหมด
 *
 * เรื่องเสียง: $.audio.play เล่นได้บน macOS แต่ terminal ของ Windows/Linux ไม่มีเครื่องเล่น
 * จึงเล่นผ่านโปรแกรมของระบบแทน (PowerShell SoundPlayer / paplay / aplay) แบบเดียวกับ Mod 36
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

type Kind = 'test' | 'commit' | 'deploy' | 'manual'

const PANE = 'celebrate-th'
const COLORS = ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc', '#ff7043', '#26c6da']
const PIECES = ['▪', '●', '▲', '✦', '❖', '♦', '★', '✿']
const FRAMES = 28
const WIDTH = 44
const HEIGHT = 9

const KIND_TEXT: Record<Kind, string> = {
  test: '🧪 เทสต์ผ่านหมด!',
  commit: '📦 commit สำเร็จ!',
  deploy: '🚀 deploy สำเร็จ!',
  manual: '🎉 เย้!',
}

interface Stats {
  total: number
  byKind: Record<Kind, number>
  day: string
  today: number
}

let stats: Stats = { total: 0, byKind: { test: 0, commit: 0, deploy: 0, manual: 0 }, day: '', today: 0 }
let settings = { auto: true, sound: true }
let frame = FRAMES
let headline = ''
let animator: Timer | undefined
let isWindows = false
let isMac = false

// ==========================================================================
// บทที่ 1: แยกแยะว่าคำสั่ง Bash ที่เพิ่งรัน "สำเร็จ" แบบไหน
// ==========================================================================
function detect(command: string, output: string): Kind | undefined {
  const failed = /\b[1-9]\d*\s+(?:failed|failing|failures?|errors?)\b|\bFAILED\b|✘|\(fail\)/i.test(output)
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bpytest\b|\bjest\b|\bvitest\b|\bgo\s+test\b|\bcargo\s+test\b|\bphpunit\b|\bplugin\s+test\b/.test(command)) {
    return failed ? undefined : 'test'
  }
  // git commit สำเร็จจะพิมพ์ "[branch abc1234] ข้อความ"
  if (/\bgit\s+commit\b/.test(command) && /^\[[^\]\n]+ [0-9a-f]{7,}\]/m.test(output)) return 'commit'
  if (/\bdeploy\b|\bvercel\b.*--prod|\bfly\s+deploy\b|\bwrangler\s+(?:deploy|publish)\b/.test(command) && !failed && !/\berror\b/i.test(output)) return 'deploy'
  return undefined
}

// ==========================================================================
// บทที่ 2: พลุกระดาษ - ตำแหน่งแต่ละชิ้นคำนวณจาก "เลขเฟรม" (สุ่มแบบคงที่ เทสต์ได้)
// ==========================================================================
function rand(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function confetti(f: number): { text: string; color: string }[][] {
  const rows: { text: string; color: string }[][] = []
  for (let y = 0; y < HEIGHT; y++) {
    const row: { text: string; color: string }[] = []
    for (let x = 0; x < WIDTH; x++) {
      // แต่ละคอลัมน์มีชิ้นหนึ่งตกลงด้วยความเร็วและจังหวะเริ่มต่างกัน
      const speed = 0.4 + rand(x) * 0.6
      const fall = Math.floor((f - rand(x + 99) * 10) * speed)
      const hit = fall === y || (rand(x * 7 + y) > 0.97 && f < FRAMES - 6)
      row.push(hit ? { text: PIECES[Math.floor(rand(x + y + f) * PIECES.length)] ?? '●', color: COLORS[(x + y) % COLORS.length] ?? '#fff' } : { text: ' ', color: '' })
    }
    rows.push(row)
  }
  return rows
}

function play($: EngineInterface, name: string): void {
  if (!settings.sound) return
  if (isMac) {
    void $.audio.play({ asset: `sounds/${name}.wav` }).catch(() => undefined)
    return
  }
  const file = `${$.plugin.root}${isWindows ? '\\sounds\\' : '/sounds/'}${name}.wav`
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', '(New-Object Media.SoundPlayer $env:CB_FILE).PlaySync()']
    : ['sh', '-c', 'paplay "$CB_FILE" 2>/dev/null || aplay -q "$CB_FILE"']
  void $.process.run(argv, { env: { CB_FILE: file }, timeoutMs: 10_000 }).catch(() => undefined)
}

async function celebrate($: EngineInterface, kind: Kind, message: string, big: boolean): Promise<void> {
  const now = new Date(await $.clock.now())
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  if (stats.day !== day) stats = { ...stats, day, today: 0 }
  stats = { ...stats, total: stats.total + 1, today: stats.today + 1, byKind: { ...stats.byKind, [kind]: stats.byKind[kind] + 1 } }
  await $.store.set('stats', stats)

  headline = message
  play($, big ? 'fanfare' : 'ding')
  $.ui.toast(`${message}  (วันนี้ฉลองไป ${stats.today} ครั้ง)`)
  if (!big) return
  frame = 0
  await $.ui.open({ id: PANE, title: '🎉 Celebrate' })
  animator?.cancel()
  animator = $.clock.every(150, () => {
    frame++
    if (frame >= FRAMES) {
      animator?.cancel()
      animator = undefined
    }
    $.ui.invalidate('ui.render')
  })
}

const HELP = `🎉 Celebrate TH (Mod 45)
========================================
/celebrate [ข้อความ]      พลุกระดาษ + แตรฉลอง
/celebrate auto on|off    ฉลองอัตโนมัติเมื่อเทสต์ผ่าน / commit / deploy สำเร็จ (ตอนนี้: AUTO)
/celebrate sound on|off   เปิด/ปิดเสียง (ตอนนี้: SOUND)
/celebrate stats          สถิติความสำเร็จ`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    stats = ((await $.store.get('stats')) as Stats | undefined) ?? stats
    settings = { ...settings, ...((await $.store.get('settings')) as typeof settings | undefined) }
    await $.command.register({ name: 'celebrate', description: 'ฉลองความสำเร็จ พลุกระดาษ + แตร และฉลองอัตโนมัติเมื่อเทสต์ผ่าน (/celebrate help)', argumentHint: '[ข้อความ]|auto|sound|stats' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดูผลลัพธ์ Bash - สำเร็จจริงเท่านั้นถึงฉลอง
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (!settings.auto || r.deny !== undefined || r.isError) return r
    const kind = detect(e.command, `${r.result.stdout}\n${r.result.stderr}`)
    if (kind) void celebrate($, kind, KIND_TEXT[kind], kind !== 'commit')
    return r
  })

  // ==========================================================================
  // บทที่ 4: วาดพลุกระดาษในแผง
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const done = frame >= FRAMES
    return (
      <Box flexDirection="column" alignItems="center">
        {!done &&
          confetti(frame).map(row => (
            <Text>
              {row.map(c => (c.color ? <Text color={c.color}>{c.text}</Text> : c.text))}
            </Text>
          ))}
        <Text bold color="#ffca28">
          {headline || '🎉'}
        </Text>
        <Text dimColor>
          วันนี้ {stats.today} · ทั้งหมด {stats.total} ครั้ง
        </Text>
      </Box>
    )
  })

  on('command.run', { command: 'celebrate' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'help':
        return { text: HELP.replace('AUTO', settings.auto ? 'เปิด' : 'ปิด').replace('SOUND', settings.sound ? 'เปิด' : 'ปิด') }
      case 'auto':
      case 'sound': {
        if (rest[0] !== 'on' && rest[0] !== 'off') return { text: `วิธีใช้: /celebrate ${sub} on|off` }
        settings = { ...settings, [sub]: rest[0] === 'on' }
        await $.store.set('settings', settings)
        return { text: `${sub === 'auto' ? '🤖 ฉลองอัตโนมัติ' : '🔊 เสียง'}: ${rest[0] === 'on' ? 'เปิด' : 'ปิด'}` }
      }
      case 'stats': {
        const k = stats.byKind
        return { text: `🏆 ฉลองไปแล้ว ${stats.total} ครั้ง (วันนี้ ${stats.today})\n  🧪 เทสต์ผ่าน ${k.test}\n  📦 commit ${k.commit}\n  🚀 deploy ${k.deploy}\n  🎉 ฉลองเอง ${k.manual}` }
      }
      default:
        await celebrate($, 'manual', e.args.trim().slice(0, 60) || '🎉 เย้! เก่งมาก!', true)
        return { text: '🎉🎊✨' }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ฉลองแบบพิเศษเมื่อครบ 10, 50, 100 ครั้ง
 * 2. ฉลองเมื่อ PR ถูก merge (เช็คผล gh pr merge)
 * 3. ส่งพลุไปมือถือด้วย Mod 22 ตอน deploy สำเร็จ
 */
