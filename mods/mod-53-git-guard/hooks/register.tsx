/**
 * ============================================================================
 * MOD 53: Git Guard TH - ยามเฝ้า Git และไฟล์ของคุณ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ประโยคคลาสสิก "เดี๋ยวนะ... งานที่ยังไม่ commit หายไปไหน"
 *
 * หน้าที่ของ Mod นี้ (ดักคำสั่ง Bash ที่ Claude จะรัน):
 * 1. git reset --hard / checkout . / restore / clean -f ตอนมีงานค้าง
 *    → ถามคุณก่อน พร้อมทางเลือก "เก็บเข้า stash ก่อน" (กดทีเดียวไม่มีอะไรหาย)
 * 2. git push --force → เสนอเปลี่ยนเป็น --force-with-lease ที่ไม่ทับงานคนอื่น
 * 3. git branch -D / stash drop / stash clear → ถามยืนยัน
 * 4. rm -r / rm ไฟล์ในโปรเจกต์ → สำรองไว้ที่ .claude-backup/ ก่อนลบ (ข้ามพวก node_modules)
 * 5. (เปิดเองได้) ตรวจข้อความ commit ตาม Conventional Commits ไม่ผ่านให้ Claude เขียนใหม่
 * 6. /gswitch <branch> - สลับ branch โดยถามก่อนว่าจะทำอะไรกับงานที่ค้าง
 *
 * ถ้าไม่มีใครตอบได้ (เช่นรันแบบ claude -p) จะปฏิเสธคำสั่งไว้ก่อนเพื่อความปลอดภัย
 * Mod 15 Cyber Guard บล็อกคำสั่งทำลายระบบ ส่วน Mod นี้ดูแลงานในโปรเจกต์
 */

import type { EngineInterface, Register } from 'claude-code'

interface Settings {
  guard: boolean
  backup: boolean
  convention: boolean
}

const REGENERABLE = /(^|[\\/])(node_modules|dist|build|out|\.next|\.nuxt|target|coverage|\.cache|__pycache__|\.venv|venv|\.turbo|\.parcel-cache|tmp|temp)([\\/]|$)/i
const CONVENTIONAL = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?: \S/
const BACKUP_DIR = '.claude-backup'

let settings: Settings = { guard: true, backup: true, convention: false }
let pausedUntil = 0
let isWindows = false
let backups = 0

// ==========================================================================
// บทที่ 1: แยกแยะคำสั่ง - คำสั่งยาวที่ต่อด้วย && ; || ให้ดูทีละท่อน
// ==========================================================================
type Risk = { kind: 'discard'; what: string } | { kind: 'force'; what: string } | { kind: 'confirm'; what: string }

function segments(command: string): string[] {
  return command.split(/&&|\|\||;|\n/).map(s => s.trim()).filter(Boolean)
}

function riskOf(seg: string): Risk | undefined {
  if (!/^\s*git\b/.test(seg)) return undefined
  if (/\breset\b.*--hard\b/.test(seg)) return { kind: 'discard', what: 'git reset --hard ทิ้งการแก้ไขที่ยังไม่ commit ทั้งหมด' }
  if (/\bcheckout\s+(?:\S+\s+)?--\s+\S|\bcheckout\s+\.(?:\s|$)/.test(seg)) return { kind: 'discard', what: 'git checkout ทับไฟล์ด้วยเวอร์ชันล่าสุด การแก้ไขที่ยังไม่ commit จะหาย' }
  if (/\brestore\b/.test(seg) && !(/--staged\b/.test(seg) && !/--worktree\b/.test(seg))) return { kind: 'discard', what: 'git restore ทิ้งการแก้ไขในไฟล์' }
  if (/\bclean\s+-\w*f/.test(seg)) return { kind: 'discard', what: 'git clean ลบไฟล์ที่ยังไม่ได้ track (ไฟล์ใหม่ทั้งหมด)' }
  if (/\bpush\b.*(?:--force(?!-with-lease)\b|\s-f\b|\s\+\S)/.test(seg)) return { kind: 'force', what: 'git push --force ทับประวัติบน remote (งานของคนอื่นอาจหาย)' }
  if (/\bbranch\s+(?:.*\s)?-D\b/.test(seg)) return { kind: 'confirm', what: 'git branch -D ลบ branch แม้ยังไม่ได้ merge' }
  if (/\bstash\s+(?:drop|clear)\b/.test(seg)) return { kind: 'confirm', what: 'ลบงานที่เก็บไว้ใน stash ถาวร' }
  return undefined
}

// ข้อความ commit: รองรับ -m "..." / -am '...' / heredoc แบบที่ Claude Code ชอบใช้
// ดูทั้งคำสั่ง (ไม่แยกบรรทัด) เพราะ heredoc กินหลายบรรทัด
function commitMessage(command: string): string | undefined {
  if (!/(?:^|&&|;|\|\|)\s*git\b[^\n]*\bcommit\b/.test(command)) return undefined
  const heredoc = /<<\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1/.exec(command)
  if (heredoc?.[2]) return heredoc[2].split('\n').find(l => l.trim())?.trim()
  const m = /(?:\s-[a-zA-Z]*m|\s--message)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/.exec(command)
  return (m?.[1] ?? m?.[2] ?? m?.[3])?.split('\n')[0]?.trim()
}

// rm: เก็บ path ที่จะโดนลบ (เฉพาะแบบตรงๆ ไม่มี * หรือตัวแปร)
function rmTargets(seg: string): string[] {
  const m = /^\s*(?:sudo\s+)?rm\s+(.+)$/.exec(seg)
  if (!m?.[1]) return []
  const parts = m[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return parts
    .filter(p => !p.startsWith('-'))
    .map(p => p.replace(/^["']|["']$/g, ''))
    .filter(p => p && !/[*?$`]/.test(p))
}

// ==========================================================================
// บทที่ 2: เรียก git / สำเนาไฟล์ ผ่าน $.process.run (path ส่งทาง env กันคำสั่งแทรก)
// ==========================================================================
async function git($: EngineInterface, args: string[]): Promise<{ ok: boolean; out: string }> {
  const r = await $.process.run(['git', ...args], { timeoutMs: 30_000 }).catch(() => undefined)
  return { ok: r?.exitCode === 0, out: `${r?.stdout ?? ''}${r?.stderr ?? ''}`.trim() }
}

async function dirtyCount($: EngineInterface, untrackedOnly = false): Promise<number> {
  const r = await git($, ['status', '--porcelain'])
  if (!r.ok) return 0
  return r.out.split('\n').filter(l => l && (!untrackedOnly || l.startsWith('??'))).length
}

async function stash($: EngineInterface, now: number): Promise<boolean> {
  const label = `git-guard ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')}`
  return (await git($, ['stash', 'push', '--include-untracked', '-m', label])).ok
}

function join(root: string, rel: string): string {
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(rel)) return rel
  return `${root}${isWindows ? '\\' : '/'}${rel.replace(/^\.[\\/]/, '')}`
}

async function backup($: EngineInterface, targets: string[], now: number): Promise<string[]> {
  const root = (await $.session.cwd()).replace(/[\\/]$/, '')
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const dest = join(root, `${BACKUP_DIR}${isWindows ? '\\' : '/'}${stamp}`)
  const saved: string[] = []
  for (const t of targets) {
    const src = join(root, t)
    // นอกโปรเจกต์ หรือของที่สร้างใหม่ได้ (node_modules, dist ...) ไม่ต้องสำรอง
    if (REGENERABLE.test(t) || !src.toLowerCase().startsWith(root.toLowerCase()) || !(await $.fs.exists(src))) continue
    const argv = isWindows
      ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'New-Item -ItemType Directory -Force -Path $env:GG_DEST | Out-Null; Copy-Item -LiteralPath $env:GG_SRC -Destination $env:GG_DEST -Recurse -Force']
      : ['sh', '-c', 'mkdir -p "$GG_DEST" && cp -R "$GG_SRC" "$GG_DEST/"']
    const r = await $.process.run(argv, { env: { GG_SRC: src, GG_DEST: dest }, timeoutMs: 60_000 }).catch(() => undefined)
    if (r?.exitCode === 0) saved.push(t)
  }
  if (saved.length) {
    // ให้ git มองข้ามโฟลเดอร์สำรองเอง โดยไม่ต้องแก้ .gitignore ของโปรเจกต์
    await $.fs.write(join(root, `${BACKUP_DIR}${isWindows ? '\\' : '/'}.gitignore`), '*\n').catch(() => undefined)
    backups += saved.length
  }
  return saved
}

// ==========================================================================
// บทที่ 3: ถามคุณผ่านหน้าต่างของ Claude Code - ตอบไม่ได้ (ปิดหน้าต่าง/-p) = ไม่อนุญาต
// ==========================================================================
async function ask($: EngineInterface, question: string, options: string[]): Promise<string | undefined> {
  try {
    return await $.ui.ask(question, { header: 'Git Guard', options })
  } catch {
    return undefined
  }
}

const DENY_NO_ANSWER = 'Git Guard: คำสั่งนี้ทำให้งานหายได้ และไม่มีใครยืนยัน จึงยังไม่รัน ถ้าผู้ใช้ต้องการจริง ให้ผู้ใช้สั่ง /gitguard pause 5 แล้วลองใหม่'

const HELP = `🛡️ Git Guard TH (Mod 53)
========================================
/gitguard                   สถานะ + stash/สำรองที่ Git Guard สร้าง
/gitguard pause <นาที>      พักการเฝ้าชั่วคราว
/gitguard guard on|off      ถามก่อนคำสั่ง git อันตราย (ตอนนี้: GUARD)
/gitguard backup on|off     สำรองก่อน rm (ตอนนี้: BACKUP)
/gitguard convention on|off ตรวจ Conventional Commits (ตอนนี้: CONV)
/gswitch <branch> [new]     สลับ branch อย่างปลอดภัย`

function onOff(v: boolean): string {
  return v ? 'เปิด' : 'ปิด'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    settings = { ...settings, ...((await $.store.get('settings')) as Partial<Settings> | undefined) }
    await $.command.register({ name: 'gitguard', description: 'ยามเฝ้า Git: ถามก่อนทิ้งงาน กัน force push สำรองก่อน rm (/gitguard help)', argumentHint: 'pause <นาที>|guard|backup|convention on|off' })
    await $.command.register({ name: 'gswitch', description: 'สลับ branch อย่างปลอดภัย ถามก่อนว่าจะทำอะไรกับงานที่ค้าง', argumentHint: '<branch> [new]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ด่านตรวจหน้า Bash
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const now = await $.clock.now()
    if (now < pausedUntil) return next(e)
    let command = e.command
    const segs = segments(command)

    // 4.1 ข้อความ commit
    if (settings.convention) {
      const msg = commitMessage(command)
      if (msg !== undefined && !CONVENTIONAL.test(msg) && !/^(?:Merge|Revert) /.test(msg)) {
        return { deny: `Git Guard: ข้อความ commit "${msg}" ไม่ตามรูปแบบ Conventional Commits ของโปรเจกต์นี้ ให้เขียนใหม่เป็น <type>(<scope>): <สรุป> โดย type คือ feat fix docs style refactor perf test build ci chore revert เช่น "fix(auth): handle expired token" แล้ว commit ใหม่` }
      }
    }

    // 4.2 คำสั่ง git อันตราย
    if (settings.guard) {
      for (const seg of segs) {
        const risk = riskOf(seg)
        if (!risk) continue
        if (risk.kind === 'discard') {
          const n = await dirtyCount($, /\bclean\b/.test(seg))
          if (n === 0) continue // ไม่มีงานค้าง ไม่มีอะไรหาย
          const a = await ask($, `${risk.what} — ตอนนี้มีงานค้าง ${n} ไฟล์ จะทำยังไง?`, ['เก็บเข้า stash ก่อน แล้วค่อยรัน (แนะนำ)', 'รันเลย ทิ้งได้', 'ยกเลิก'])
          if (!a) return { deny: DENY_NO_ANSWER }
          if (a.startsWith('ยกเลิก')) return { deny: 'ผู้ใช้ยกเลิกคำสั่งนี้ (Git Guard) อย่าลองทิ้งงานด้วยวิธีอื่น ให้ถามผู้ใช้ก่อน' }
          if (a.startsWith('เก็บ')) {
            if (!(await stash($, now))) return { deny: 'Git Guard: stash ไม่สำเร็จ จึงยังไม่รันคำสั่งที่ทิ้งงาน' }
            $.ui.toast('📦 เก็บงานค้างเข้า stash แล้ว (git stash list)')
          }
        } else if (risk.kind === 'force') {
          const a = await ask($, `${risk.what} จะทำยังไง?`, ['ใช้ --force-with-lease แทน (แนะนำ)', 'force push เลย', 'ยกเลิก'])
          if (!a) return { deny: DENY_NO_ANSWER }
          if (a.startsWith('ยกเลิก')) return { deny: 'ผู้ใช้ยกเลิก force push (Git Guard)' }
          if (a.startsWith('ใช้')) command = command.replace(/--force(?!-with-lease)\b|(\s)-f\b/g, (_m, sp: string | undefined) => `${sp ?? ''}--force-with-lease`)
        } else {
          const a = await ask($, `${risk.what} ยืนยันไหม?`, ['ทำเลย', 'ยกเลิก'])
          if (!a) return { deny: DENY_NO_ANSWER }
          if (a !== 'ทำเลย') return { deny: 'ผู้ใช้ยกเลิกคำสั่งนี้ (Git Guard)' }
        }
      }
    }

    // 4.3 สำรองก่อน rm
    if (settings.backup) {
      const targets = segs.flatMap(rmTargets)
      if (targets.length) {
        const saved = await backup($, targets, now)
        if (saved.length) $.ui.toast(`🧚 สำรอง ${saved.join(', ')} ไว้ที่ ${BACKUP_DIR}/ ก่อนลบแล้ว`)
      }
    }

    return command === e.command ? next(e) : next({ ...e, command })
  })

  on('command.run', { command: 'gitguard' }, async ($, e) => {
    const [sub = '', value = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        const now = await $.clock.now()
        const stashes = (await git($, ['stash', 'list'])).out.split('\n').filter(l => l.includes('git-guard'))
        return {
          text: [
            `🛡️ Git Guard ${now < pausedUntil ? `⏸️ พักถึง ${new Date(pausedUntil).toLocaleTimeString('th-TH')}` : '✅ เฝ้าอยู่'}`,
            `  ถามก่อนคำสั่ง git อันตราย: ${onOff(settings.guard)}`,
            `  สำรองก่อน rm: ${onOff(settings.backup)} (session นี้สำรองไป ${backups} รายการ)`,
            `  Conventional Commits: ${onOff(settings.convention)}`,
            '',
            stashes.length ? `📦 stash ที่ Git Guard เก็บให้ (กู้: git stash pop stash@{n})\n${stashes.slice(0, 10).map(s => `  ${s}`).join('\n')}` : '📦 ยังไม่มี stash จาก Git Guard',
          ].join('\n'),
        }
      }
      case 'pause': {
        const min = Number(value || 5)
        if (!(min > 0 && min <= 120)) return { text: 'วิธีใช้: /gitguard pause 5  (1-120 นาที)' }
        pausedUntil = (await $.clock.now()) + min * 60_000
        return { text: `⏸️ พักการเฝ้า ${min} นาที` }
      }
      case 'guard':
      case 'backup':
      case 'convention': {
        if (value !== 'on' && value !== 'off') return { text: `วิธีใช้: /gitguard ${sub} on|off` }
        settings = { ...settings, [sub]: value === 'on' }
        await $.store.set('settings', settings)
        return { text: `✅ ${sub}: ${onOff(value === 'on')}` }
      }
      default:
        return { text: HELP.replace('GUARD', onOff(settings.guard)).replace('BACKUP', onOff(settings.backup)).replace('CONV', onOff(settings.convention)) }
    }
  })

  // ==========================================================================
  // บทที่ 5: /gswitch - สลับ branch โดยถามเรื่องงานค้างก่อน
  // ==========================================================================
  on('command.run', { command: 'gswitch' }, async ($, e) => {
    const [branch, flag] = e.args.trim().split(/\s+/).filter(Boolean)
    if (!branch) return { text: 'วิธีใช้: /gswitch main  หรือ  /gswitch feature/x new' }
    const n = await dirtyCount($)
    const notes: string[] = []
    if (n > 0) {
      const a = await ask($, `มีงานค้าง ${n} ไฟล์ ก่อนสลับไป ${branch} จะทำยังไง?`, ['stash แล้วสลับ (แนะนำ)', 'commit เป็น WIP แล้วสลับ', 'พาการแก้ไขไปด้วย', 'ยกเลิก'])
      if (!a || a === 'ยกเลิก') return { text: 'ยกเลิกการสลับ branch' }
      if (a.startsWith('stash')) {
        if (!(await stash($, await $.clock.now()))) return { text: '❌ stash ไม่สำเร็จ' }
        notes.push('📦 เก็บงานค้างเข้า stash แล้ว กลับมาเมื่อไหร่ใช้ git stash pop')
      } else if (a.startsWith('commit')) {
        const add = await git($, ['add', '-A'])
        const c = add.ok ? await git($, ['commit', '-m', 'wip: งานค้างก่อนสลับ branch']) : add
        if (!c.ok) return { text: `❌ commit ไม่สำเร็จ\n${c.out}` }
        notes.push('📝 commit งานค้างเป็น WIP แล้ว (แก้ทีหลังด้วย git reset --soft HEAD~1)')
      }
    }
    const r = await git($, flag === 'new' ? ['switch', '-c', branch] : ['switch', branch])
    if (!r.ok) return { text: `❌ สลับไม่สำเร็จ\n${r.out}\n${notes.join('\n')}` }
    return { text: [`🔀 อยู่ที่ ${branch} แล้ว`, ...notes].join('\n') }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. /gitguard undo - กู้ไฟล์ล่าสุดจาก .claude-backup/
 * 2. ลบโฟลเดอร์สำรองที่เก่ากว่า 7 วันอัตโนมัติ
 * 3. เปิด Conventional Commits เองเมื่อเจอไฟล์ commitlint.config.* ในโปรเจกต์
 */
