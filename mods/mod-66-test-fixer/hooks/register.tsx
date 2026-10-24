/**
 * ============================================================================
 * MOD 66: Test Fixer TH - วนแก้เทสต์จนผ่าน (มีเบรก) (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: วงจร red → green ของ TDD แต่ให้ Claude วิ่งรอบให้
 *
 * หน้าที่ของ Mod นี้:
 * 1. /fixtests [คำสั่งเทสต์] - Mod รันเทสต์เอง (ไม่ผ่านโมเดล) ถ้าผ่านก็จบ
 * 2. ไม่ผ่าน → ส่งท้าย output ให้ Claude แก้ "โค้ด" (ห้ามแก้/ลบเทสต์ให้ผ่านแบบโกง)
 * 3. Claude ทำเสร็จ → Mod รันเทสต์ซ้ำเอง → วนไปจนผ่าน
 * 4. เบรกกันวนไม่จบ: เพดานรอบ (ค่าเริ่มต้น 3), error ซ้ำเดิม 2 รอบติด = หยุด,
 *    คุณกด Esc ขัด Claude = หยุด, /fixtests stop = หยุด
 *
 * ไม่ระบุคำสั่ง จะเดาจากโปรเจกต์: package.json (npm test), pytest, go test, cargo test
 */

import type { EngineInterface, Register } from 'claude-code'

interface Run {
  command: string
  round: number
  max: number
  lastSignature: string
  repeats: number
  waiting: boolean // รอ Claude แก้เสร็จอยู่
  startedAt: number
}

let job: Run | undefined
let isWindows = false
let defaultMax = 3

// ==========================================================================
// บทที่ 1: เดาคำสั่งเทสต์จากไฟล์ในโปรเจกต์
// ==========================================================================
async function guessCommand($: EngineInterface, root: string): Promise<string | undefined> {
  const has = (f: string) => $.fs.exists(`${root}${isWindows ? '\\' : '/'}${f}`)
  if (await has('package.json')) {
    const pkg = JSON.parse(await $.fs.read(`${root}${isWindows ? '\\' : '/'}package.json`).catch(() => '{}')) as { scripts?: Record<string, string> }
    const t = pkg.scripts?.test
    if (t && !/no test specified/.test(t)) return (await has('pnpm-lock.yaml')) ? 'pnpm test' : (await has('yarn.lock')) ? 'yarn test' : (await has('bun.lockb')) ? 'bun test' : 'npm test'
  }
  if ((await has('pytest.ini')) || (await has('pyproject.toml')) || (await has('tests'))) return 'python -m pytest -q'
  if (await has('go.mod')) return 'go test ./...'
  if (await has('Cargo.toml')) return 'cargo test'
  return undefined
}

// ==========================================================================
// บทที่ 2: รันเทสต์เอง - คำสั่งของคุณเอง จึงรันผ่าน shell ได้
// ==========================================================================
async function runTests($: EngineInterface, command: string): Promise<{ ok: boolean; output: string }> {
  const argv = isWindows ? ['cmd', '/d', '/s', '/c', command] : ['sh', '-c', command]
  const r = await $.process.run(argv, { timeoutMs: 10 * 60_000, env: { CI: '1', FORCE_COLOR: '0' } }).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  return { ok: r.exitCode === 0, output: `${r.stdout}\n${r.stderr}`.trim() }
}

// "ลายเซ็น" ของความล้มเหลว: บรรทัดที่มีคำว่า fail/error (ตัดตัวเลขเวลาออก) ไว้ดูว่าติดที่เดิมไหม
function signature(output: string): string {
  return output
    .split('\n')
    .filter(l => /fail|error|✗|✘|×/i.test(l))
    .map(l => l.replace(/\d+(\.\d+)?\s*m?s\b/g, '').trim())
    .slice(0, 20)
    .join('\n')
}

function tail(output: string, max = 3500): string {
  return output.length > max ? `…(ตัดหัว)\n${output.slice(-max)}` : output
}

async function step($: EngineInterface): Promise<void> {
  const j = job
  if (!j) return
  $.ui.status(`🧪 Test Fixer รอบ ${j.round}/${j.max}: กำลังรันเทสต์…`)
  const r = await runTests($, j.command)
  if (job !== j) return // ถูกหยุดระหว่างรัน
  if (r.ok) {
    const mins = Math.round(((await $.clock.now()) - j.startedAt) / 60_000)
    job = undefined
    $.ui.status(undefined)
    $.ui.toast(`✅ เทสต์ผ่านแล้ว! ใช้ ${j.round - 1} รอบแก้ (${mins} นาที)`, { timeoutMs: 15_000 })
    try {
      $.ui.log(`🎉 Test Fixer: ${j.command} ผ่านแล้ว หลังแก้ ${j.round - 1} รอบ`)
    } catch {}
    return
  }
  const sig = signature(r.output)
  j.repeats = sig && sig === j.lastSignature ? j.repeats + 1 : 0
  j.lastSignature = sig
  if (j.round > j.max || j.repeats >= 1) {
    job = undefined
    $.ui.status(undefined)
    const why = j.repeats >= 1 ? 'error เหมือนเดิม 2 รอบติด (Claude อาจติดทาง)' : `ครบ ${j.max} รอบแล้ว`
    $.ui.toast(`🛑 Test Fixer หยุด: ${why}`, { timeoutMs: 15_000 })
    try {
      $.ui.log(`🛑 Test Fixer หยุด: ${why} — ลองอ่าน error เอง หรือ /fixtests max 5 แล้วสั่งใหม่`)
    } catch {}
    return
  }
  j.waiting = true
  $.ui.status(`🧪 Test Fixer รอบ ${j.round}/${j.max}: Claude กำลังแก้`)
  void $.prompt.submit({
    text: `[Test Fixer รอบ ${j.round}/${j.max}] เทสต์ยังไม่ผ่าน (\`${j.command}\`) ช่วยหาสาเหตุแล้วแก้ "โค้ด" ให้เทสต์ผ่าน
กติกา: ห้ามลบ ข้าม หรือแก้ assertion ของเทสต์ให้ผ่านแบบโกง ถ้าคิดว่าเทสต์เองผิดจริง ให้อธิบายเหตุผลแล้วหยุด ไม่ต้องรันเทสต์เอง Mod จะรันให้หลังคุณแก้เสร็จ

ผลเทสต์ล่าสุด:
\`\`\`
${tail(r.output)}
\`\`\``,
  })
}

const HELP = `🧪 Test Fixer TH (Mod 66)
========================================
/fixtests [คำสั่ง]   เริ่มวนแก้ เช่น /fixtests  หรือ  /fixtests npm test -- auth
/fixtests stop       หยุด
/fixtests max <n>    เพดานรอบ 1-10 (ตอนนี้: MAX)
/fixtests status     สถานะ`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    defaultMax = ((await $.store.get('max')) as number | undefined) ?? 3
    job = undefined
    await $.command.register({ name: 'fixtests', description: 'รันเทสต์ ถ้าไม่ผ่านให้ Claude แก้แล้วรันซ้ำจนผ่าน (มีเพดานรอบ) (/fixtests help)', argumentHint: '[คำสั่งเทสต์]|stop|max <n>|status' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: Claude แก้เสร็จ → รันเทสต์รอบถัดไป / ถูกขัด → หยุด
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || !job?.waiting) return r
    job.waiting = false
    if (e.reason === 'aborted' || e.reason === 'error') {
      job = undefined
      $.ui.status(undefined)
      $.ui.toast('⏹️ Test Fixer หยุด เพราะรอบนี้ถูกขัดหรือ error')
      return r
    }
    job.round++
    void step($)
    return r
  })

  on('command.run', { command: 'fixtests' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', value = ''] = args.split(/\s+/)
    if (sub === 'help') return { text: HELP.replace('MAX', String(defaultMax)) }
    if (sub === 'stop') {
      if (!job) return { text: 'ไม่ได้วนอยู่' }
      job = undefined
      $.ui.status(undefined)
      return { text: '⏹️ หยุด Test Fixer แล้ว (Claude อาจยังทำรอบปัจจุบันต่อจนจบ)' }
    }
    if (sub === 'max') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 10) return { text: 'วิธีใช้: /fixtests max 5  (1-10)' }
      defaultMax = n
      await $.store.set('max', n)
      return { text: `🔁 เพดาน ${n} รอบ` }
    }
    if (sub === 'status') return { text: job ? `🧪 ${job.command} · รอบ ${job.round}/${job.max} · ${job.waiting ? 'Claude กำลังแก้' : 'กำลังรันเทสต์'}` : 'ไม่ได้วนอยู่' }
    if (job) return { text: `กำลังวนอยู่แล้ว (${job.command}) /fixtests stop เพื่อหยุด` }
    const command = args || (await guessCommand($, await $.session.root()))
    if (!command) return { text: 'หาคำสั่งเทสต์ไม่เจอ ระบุเองได้ เช่น /fixtests npm test' }
    job = { command, round: 1, max: defaultMax, lastSignature: '', repeats: 0, waiting: false, startedAt: await $.clock.now() }
    void step($)
    return { text: `🧪 เริ่มรัน ${command} (แก้ได้สูงสุด ${defaultMax} รอบ)` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ฉลองด้วย Mod 45 เมื่อเทสต์ผ่าน
 * 2. รันเฉพาะไฟล์เทสต์ที่พังแทนการรันทั้งชุดในรอบถัดไป
 * 3. เก็บประวัติว่าแต่ละรอบ Claude แก้ไฟล์อะไร แล้วสรุปตอนจบ
 */
