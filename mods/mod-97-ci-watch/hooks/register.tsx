/**
 * ============================================================================
 * MOD 97: CI Watch TH - เฝ้า CI ของ GitHub ในแถบสถานะ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ci-watch และ pr-relay ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. /ci เฝ้า check ของ PR ใน branch ปัจจุบัน (หรือ /ci <เลข PR>) ทุก 1 นาที ด้วย gh
 *    แถบสถานะบอก ⏳ 3/5 · ✅ 5/5 · ❌ 1 พัง ไม่เสีย token เลย
 * 2. จบแล้วเด้ง toast บอกผล และหยุดเฝ้าเอง
 * 3. Claude สั่ง git push หรือ gh pr create สำเร็จ = เริ่มเฝ้าให้อัตโนมัติ
 * 4. /ci autofix on: CI พังแล้วส่งงานให้ Claude อ่าน log ที่พังแล้วแก้ทันที
 * 5. ไม่มี PR: เฝ้า GitHub Actions run ล่าสุดของ branch แทน
 *
 * ต้องติดตั้ง GitHub CLI (gh) และ gh auth login แล้ว
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Check {
  name: string
  bucket: string // pass | fail | pending | skipping | cancel
  link?: string
}

let target: string | undefined // เลข PR, 'branch' หรือ undefined (ยังไม่เฝ้า)
let checks: Check[] = []
let poller: Timer | undefined
let auto = true
let autofix = false

const ICON: Record<string, string> = { pass: '✅', fail: '❌', pending: '⏳', skipping: '⏭', cancel: '🚫' }

// ==========================================================================
// บทที่ 1: ถาม gh ว่า check เป็นยังไงบ้าง
// ==========================================================================
async function gh($: EngineInterface, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const r = await $.process.run(['gh', ...args], { timeoutMs: 30_000 })
    return { ok: r.exitCode === 0, out: r.stdout, err: r.stderr }
  } catch (err) {
    return { ok: false, out: '', err: String(err) }
  }
}

async function fetchChecks($: EngineInterface): Promise<Check[] | string> {
  if (target !== 'branch') {
    const r = await gh($, ['pr', 'checks', ...(target ? [target] : []), '--json', 'name,bucket,link'])
    // gh pr checks คืน exit 8 ตอนยัง pending แต่ JSON ยังใช้ได้
    if (r.out.trim().startsWith('[')) return JSON.parse(r.out) as Check[]
    if (!/no pull requests? found/i.test(r.err)) return r.err.trim() || 'gh ไม่ตอบ'
    target = 'branch'
  }
  // ไม่มี PR: ดู Actions run ล่าสุดของ branch นี้
  const branch = (await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 10_000 }).catch(() => undefined))?.stdout.trim()
  if (!branch) return 'หา branch ปัจจุบันไม่ได้'
  const r = await gh($, ['run', 'list', '--branch', branch, '--limit', '10', '--json', 'workflowName,status,conclusion,url,headSha'])
  if (!r.ok) return r.err.trim() || 'gh run list ไม่สำเร็จ'
  const runs = JSON.parse(r.out) as { workflowName: string; status: string; conclusion: string; url: string; headSha: string }[]
  const head = runs[0]?.headSha
  return runs
    .filter(x => x.headSha === head)
    .map(x => ({ name: x.workflowName, link: x.url, bucket: x.status !== 'completed' ? 'pending' : x.conclusion === 'success' ? 'pass' : x.conclusion === 'skipped' ? 'skipping' : x.conclusion === 'cancelled' ? 'cancel' : 'fail' }))
}

function summary(): string {
  const done = checks.filter(c => c.bucket !== 'pending').length
  const failed = checks.filter(c => c.bucket === 'fail').length
  if (failed) return `❌ CI พัง ${failed}/${checks.length}`
  if (done < checks.length) return `⏳ CI ${done}/${checks.length}`
  return `✅ CI ผ่าน ${checks.length}/${checks.length}`
}

// ==========================================================================
// บทที่ 2: วนถามทุก 1 นาทีจนจบ
// ==========================================================================
async function poll($: EngineInterface): Promise<void> {
  const res = await fetchChecks($)
  if (typeof res === 'string') {
    stop($)
    $.ui.toast(`🚦 CI Watch: ${res.slice(0, 160)}`, { timeoutMs: 10_000 })
    return
  }
  checks = res
  if (checks.length === 0) {
    $.ui.status('⏳ CI ยังไม่เริ่ม')
    return
  }
  $.ui.status(`${summary()}${target && target !== 'branch' ? ` · PR #${target}` : ''}`)
  if (checks.some(c => c.bucket === 'pending')) return
  // จบแล้ว
  const failed = checks.filter(c => c.bucket === 'fail')
  $.ui.toast(failed.length ? `❌ CI พัง: ${failed.map(c => c.name).join(', ')}` : `✅ CI ผ่านหมด ${checks.length} รายการ`, { timeoutMs: 15_000 })
  if (failed.length && autofix) {
    void $.prompt.submit({ text: `CI พังที่ ${failed.map(c => c.name).join(', ')} ช่วยดู log ที่พังด้วย gh run view --log-failed (หรือ gh pr checks) หาสาเหตุ แก้ แล้วบอกฉันก่อน push`, asUser: true })
  }
  stop($, false)
}

function start($: EngineInterface, pr?: string): void {
  target = pr
  checks = []
  poller?.cancel()
  poller = $.clock.every(60_000, () => void poll($))
  $.ui.status('⏳ CI กำลังดู…')
  void poll($)
}

function stop($: EngineInterface, clearStatus = true): void {
  poller?.cancel()
  poller = undefined
  if (clearStatus) $.ui.status(undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const s = (await $.store.get('settings')) as { auto?: boolean; autofix?: boolean } | undefined
    auto = s?.auto ?? true
    autofix = s?.autofix ?? false
    await $.command.register({ name: 'ci', description: 'เฝ้า CI ของ GitHub ในแถบสถานะ ไม่เสีย token (/ci help)', argumentHint: '[เลข PR] | stop | auto on|off | autofix on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: Claude push แล้วเริ่มเฝ้าให้เอง
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (auto && r.deny === undefined && !r.isError && /\bgit\s+push\b|\bgh\s+pr\s+create\b/.test(e.command)) {
      // รอให้ GitHub สร้าง check ก่อนสักครู่
      $.clock.after(20_000, () => start($, undefined))
      $.ui.toast('🚦 push แล้ว เดี๋ยวเริ่มเฝ้า CI ให้')
    }
    return r
  })

  on('command.run', { command: 'ci' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', { auto, autofix })
    if (sub === 'stop') {
      stop($)
      return { text: '🚦 หยุดเฝ้า CI แล้ว' }
    }
    if (sub === 'auto' || sub === 'autofix') {
      if (arg !== 'on' && arg !== 'off') return { text: `วิธีใช้: /ci ${sub} on|off` }
      if (sub === 'auto') auto = arg === 'on'
      else autofix = arg === 'on'
      await save()
      return { text: sub === 'auto' ? `🚦 เริ่มเฝ้าเองหลัง push: ${auto ? 'เปิด' : 'ปิด'}` : `🔧 CI พังแล้วให้ Claude แก้: ${autofix ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'list') {
      if (checks.length === 0) return { text: 'ยังไม่มีข้อมูล check พิมพ์ /ci เพื่อเริ่มเฝ้า' }
      return { text: [summary(), ...checks.map(c => `${ICON[c.bucket] ?? '•'} ${c.name}${c.link ? `  ${c.link}` : ''}`)].join('\n') }
    }
    if (sub === 'help') return { text: '🚦 CI Watch TH (Mod 97)\n/ci              เฝ้า PR ของ branch ปัจจุบัน\n/ci <เลข PR>      เฝ้า PR นั้น\n/ci list         ดูทุก check\n/ci stop         หยุดเฝ้า\n/ci auto on|off  เริ่มเฝ้าเองหลัง Claude push\n/ci autofix on|off  CI พังแล้วส่งงานให้ Claude แก้\nต้องมี GitHub CLI (gh) และ gh auth login' }
    if (sub && !/^\d+$/.test(sub)) return { text: 'วิธีใช้: /ci [เลข PR] (/ci help)' }
    const v = await gh($, ['--version'])
    if (!v.ok) return { text: '❌ ไม่พบ GitHub CLI (gh) ติดตั้งจาก https://cli.github.com แล้วรัน gh auth login' }
    start($, sub || undefined)
    return { text: `🚦 เริ่มเฝ้า CI ${sub ? `PR #${sub}` : 'ของ branch ปัจจุบัน'} ทุก 1 นาที ดูผลที่แถบสถานะ` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เฝ้า PR review ด้วย: แจ้งเมื่อมีคนอนุมัติหรือขอแก้
 * 2. แจ้งเตือนไปมือถือเมื่อ CI จบ (ต่อกับ Mod 22)
 * 3. แผงแสดงทุก check พร้อมปุ่มเปิดลิงก์
 */
