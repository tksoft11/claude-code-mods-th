/**
 * ============================================================================
 * MOD 54: Git Writer TH - นักเขียนประจำ Git (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: การเขียน commit message และ PR description ที่ไม่มีใครอยากเขียน
 *
 * หน้าที่ของ Mod นี้:
 * 1. /gitmsg - อ่าน diff ที่ stage ไว้ แล้วเสนอข้อความ commit 3 แบบให้เลือก กดแล้ว commit ให้เลย
 *    สไตล์: conventional (ค่าเริ่มต้น) / ไทย / กวีน่ารัก 🎀
 * 2. /pr [base] - อ่าน commit ของ branch นี้ แล้วเขียน PR (title + สรุป + วิธีทดสอบ)
 *    มี GitHub CLI (gh) → ถามแล้วสร้าง PR ให้ / ไม่มี → คัดลอกลง clipboard พร้อมลิงก์หน้าเปิด PR
 * 3. /tweet - สรุปงานวันนี้จาก git log เป็นโพสต์สั้นไม่เกิน 280 ตัวอักษร คัดลอกให้พร้อมโพสต์
 *
 * ใช้ Haiku เขียน (ถูกและเร็ว) อ่านเฉพาะ diff/commit ของจริง ไม่แต่งเรื่องเกินข้อมูล
 */

import type { EngineInterface, Register } from 'claude-code'

type Style = 'conventional' | 'thai' | 'cute'
const MAX_DIFF = 16_000

let style: Style = 'conventional'

// ==========================================================================
// บทที่ 1: เรียก git / gh - argv ล้วน ไม่ผ่าน shell
// ==========================================================================
async function run($: EngineInterface, argv: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const r = await $.process.run(argv, { timeoutMs: 60_000 }).catch(() => undefined)
  return { ok: r?.exitCode === 0, out: (r?.stdout ?? '').trim(), err: (r?.stderr ?? '').trim() }
}

async function write($: EngineInterface, system: string, prompt: string, maxTokens: number): Promise<string | undefined> {
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens }).catch(() => undefined)
    if (r?.isAnswered) return r.text.trim()
  }
  return undefined
}

async function ask($: EngineInterface, question: string, options: string[], header: string): Promise<string | undefined> {
  try {
    return await $.ui.ask(question, { header, options })
  } catch {
    return undefined
  }
}

async function copy($: EngineInterface, text: string): Promise<boolean> {
  const r = await $.ui.copy({ text }).catch(() => undefined)
  return !!r?.isCopied
}

// ==========================================================================
// บทที่ 2: ข้อความ commit
// ==========================================================================
const STYLE_RULE: Record<Style, string> = {
  conventional: 'ภาษาอังกฤษ รูปแบบ Conventional Commits: <type>(<scope>): <summary> ตัวพิมพ์เล็ก ไม่เกิน 72 ตัวอักษร',
  thai: 'ภาษาไทย กระชับ บอกว่าเปลี่ยนอะไรและทำไม ไม่เกิน 72 ตัวอักษร',
  cute: 'รูปแบบ <type>: <summary> แต่ summary เป็นภาษาไทยแบบกวีน่ารัก คล้องจอง มี emoji 1 ตัว แต่ยังต้องบอกว่าเปลี่ยนอะไรจริง ไม่เกิน 72 ตัวอักษร ใช้คำไทยที่คนพูดกันจริง ถูกไวยากรณ์ ห้ามใช้คำแปลกหรือผิดความหมาย',
}

async function gitmsg($: EngineInterface): Promise<string> {
  let diff = await run($, ['git', 'diff', '--staged', '--no-color', '-U2'])
  if (!diff.ok) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  let staged = true
  if (!diff.out) {
    diff = await run($, ['git', 'diff', '--no-color', '-U2'])
    staged = false
    if (!diff.out) return '🤷 ไม่มีอะไรเปลี่ยน (ทั้งที่ stage และยังไม่ stage)'
  }
  const stat = await run($, ['git', 'diff', staged ? '--staged' : '', '--stat'].filter(Boolean))
  const system = `เขียนข้อความ commit 3 แบบจาก diff ที่ให้มา ${STYLE_RULE[style]}
ตอบเฉพาะ 3 บรรทัด บรรทัดละหนึ่งแบบ ไม่มีเลขนำหน้า ไม่มีเครื่องหมายคำพูด ไม่มีคำอธิบายอื่น`
  const text = await write($, system, `${stat.out}\n\n${diff.out.slice(0, MAX_DIFF)}`, 300)
  const options = (text ?? '').split('\n').map(l => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').replace(/^["'`]|["'`]$/g, '').trim()).filter(Boolean).slice(0, 3)
  if (options.length === 0) return '❌ เขียนข้อความไม่สำเร็จ'
  const list = options.map((o, i) => `  ${i + 1}. ${o}`).join('\n')
  if (!staged) return `✍️ ข้อเสนอ (ยังไม่ได้ stage ไฟล์ จึงยังไม่ commit ให้ ใช้ git add ก่อน):\n${list}`
  const picked = await ask($, 'ใช้ข้อความ commit ไหน?', [...options, 'ยังไม่ commit'], 'Commit')
  if (!picked || picked === 'ยังไม่ commit') return `✍️ ข้อเสนอ:\n${list}`
  const c = await run($, ['git', 'commit', '-m', picked])
  return c.ok ? `✅ commit แล้ว: ${picked}\n${c.out.split('\n')[0] ?? ''}` : `❌ commit ไม่สำเร็จ\n${c.err || c.out}`
}

// ==========================================================================
// บทที่ 3: PR - หา base, รวบรวม commit + diff, เขียน, แล้วสร้างหรือคัดลอก
// ==========================================================================
async function baseBranch($: EngineInterface): Promise<string> {
  const head = await run($, ['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head.ok) return head.out.replace(/^origin\//, '')
  for (const b of ['main', 'master', 'develop']) if ((await run($, ['git', 'rev-parse', '--verify', '--quiet', b])).ok) return b
  return 'main'
}

function compareUrl(remote: string, base: string, branch: string): string | undefined {
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remote)
  return m ? `https://github.com/${m[1]}/${m[2]}/compare/${base.split('/').map(encodeURIComponent).join('/')}...${branch.split('/').map(encodeURIComponent).join('/')}?expand=1` : undefined
}

async function pr($: EngineInterface, baseArg: string | undefined): Promise<string> {
  const branch = await run($, ['git', 'branch', '--show-current'])
  if (!branch.ok || !branch.out) return '❌ ไม่ได้อยู่บน branch (หรือไม่ใช่ git repo)'
  const base = baseArg || (await baseBranch($))
  if (branch.out === base) return `ℹ️ ตอนนี้อยู่บน ${base} เอง สร้าง branch ใหม่ก่อน: /gswitch feature/xxx new (Mod 53)`
  const log = await run($, ['git', 'log', '--no-color', '--pretty=format:- %s%n%b', `${base}..HEAD`])
  if (!log.ok) return `❌ หา branch ${base} ไม่เจอ ลอง /pr <base>`
  if (!log.out) return `ℹ️ ${branch.out} ยังไม่มี commit ใหม่เทียบกับ ${base}`
  const diff = await run($, ['git', 'diff', '--no-color', '-U1', `${base}...HEAD`])
  const stat = await run($, ['git', 'diff', '--stat', `${base}...HEAD`])
  const system = `เขียน Pull Request จาก commit และ diff ที่ให้มา เป็นภาษา${style === 'conventional' ? 'อังกฤษ' : 'ไทย'}
บรรทัดแรก: TITLE: <หัวข้อสั้น ไม่เกิน 70 ตัวอักษร>
จากนั้นเป็น markdown มีหัวข้อ: Summary (2-4 bullet ว่าเปลี่ยนอะไรและทำไม), Changes (ไฟล์/ส่วนที่สำคัญ), Testing (วิธีทดสอบที่สมเหตุสมผลจากโค้ด)
ห้ามแต่งเรื่องที่ไม่มีใน diff`
  const text = await write($, system, `Commits:\n${log.out}\n\nStat:\n${stat.out}\n\nDiff:\n${diff.out.slice(0, MAX_DIFF)}`, 900)
  if (!text) return '❌ เขียน PR ไม่สำเร็จ'
  const title = /^TITLE:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? branch.out
  const body = text.replace(/^TITLE:.*\n?/m, '').trim()
  const preview = `📝 PR: ${branch.out} → ${base}\n\n# ${title}\n\n${body}`

  const gh = await run($, ['gh', '--version'])
  if (gh.ok) {
    const a = await ask($, `สร้าง PR "${title}" ไปที่ ${base} เลยไหม? (จะ push branch ขึ้น origin ด้วย)`, ['สร้าง PR', 'สร้างแบบ draft', 'ยังไม่สร้าง'], 'Pull Request')
    if (a === 'สร้าง PR' || a === 'สร้างแบบ draft') {
      const push = await run($, ['git', 'push', '-u', 'origin', 'HEAD'])
      if (!push.ok) return `${preview}\n\n❌ push ไม่สำเร็จ\n${push.err}`
      const created = await run($, ['gh', 'pr', 'create', '--base', base, '--title', title, '--body', body, ...(a === 'สร้างแบบ draft' ? ['--draft'] : [])])
      return created.ok ? `✅ สร้าง PR แล้ว: ${created.out.split('\n').pop()}` : `${preview}\n\n❌ gh pr create ไม่สำเร็จ\n${created.err}`
    }
  }
  // ไม่มี gh หรือยังไม่สร้าง: คัดลอกให้ไปวางเอง
  const copied = await copy($, `${title}\n\n${body}`)
  const remote = await run($, ['git', 'remote', 'get-url', 'origin'])
  const url = remote.ok ? compareUrl(remote.out, base, branch.out) : undefined
  return `${preview}\n\n${copied ? '📋 คัดลอก title + body แล้ว' : ''}${url ? `\n🔗 push branch แล้วเปิด: ${url}` : ''}${gh.ok ? '' : '\n💡 ติดตั้ง GitHub CLI (gh) แล้ว /pr จะสร้าง PR ให้เลย'}`
}

// ==========================================================================
// บทที่ 4: โพสต์สรุปงานวันนี้
// ==========================================================================
async function tweet($: EngineInterface, lang: string): Promise<string> {
  const log = await run($, ['git', 'log', '--since=midnight', '--no-color', '--pretty=format:- %s'])
  if (!log.ok) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  if (!log.out) return '📭 วันนี้ยังไม่มี commit ให้สรุป'
  const repo = (await $.session.root()).split(/[\\/]/).pop() ?? ''
  const system = `เขียนโพสต์โซเชียลสั้นๆ อัปเดตความคืบหน้าโปรเจกต์ "${repo}" จากรายการ commit วันนี้ เป็นภาษา${lang === 'en' ? 'อังกฤษ' : 'ไทย'} สนุก เป็นกันเอง ใส่ emoji 2-3 ตัว และ hashtag 1-2 อัน ใช้ภาษาที่เป็นธรรมชาติแบบคนโพสต์จริง ถูกไวยากรณ์ อ่านแล้วเข้าใจทันที
ยาวรวมไม่เกิน 270 ตัวอักษร ตอบเฉพาะตัวโพสต์ ห้ามแต่งความสำเร็จที่ไม่มีใน commit`
  const text = await write($, system, log.out, 300)
  if (!text) return '❌ เขียนโพสต์ไม่สำเร็จ'
  const post = text.replace(/^["']|["']$/g, '')
  const copied = await copy($, post)
  return `🐦 (${[...post].length}/280 ตัวอักษร)${copied ? ' คัดลอกแล้ว พร้อมโพสต์' : ''}\n\n${post}`
}

const HELP = `✍️ Git Writer TH (Mod 54)
========================================
/gitmsg               เสนอข้อความ commit 3 แบบจาก diff ที่ stage ไว้ แล้ว commit ให้
/gitmsg style <แบบ>    conventional | thai | cute (ตอนนี้: STYLE)
/pr [base]            เขียน PR จาก commit ของ branch นี้ (มี gh = สร้างให้เลย)
/tweet [en]           สรุปงานวันนี้เป็นโพสต์ 280 ตัวอักษร`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    style = ((await $.store.get('style')) as Style | undefined) ?? 'conventional'
    await $.command.register({ name: 'gitmsg', description: 'ให้ Claude แต่งข้อความ commit จาก diff แล้ว commit ให้ (/gitmsg help)', argumentHint: '[style conventional|thai|cute]' })
    await $.command.register({ name: 'pr', description: 'เขียน Pull Request จาก commit ของ branch นี้ แล้วสร้างด้วย gh', argumentHint: '[base]' })
    await $.command.register({ name: 'tweet', description: 'สรุปงานวันนี้จาก git log เป็นโพสต์สั้น', argumentHint: '[en]' })
    return next(e)
  })

  on('command.run', { command: 'gitmsg' }, async ($, e) => {
    const [sub = '', value = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'help') return { text: HELP.replace('STYLE', style) }
    if (sub === 'style') {
      if (!['conventional', 'thai', 'cute'].includes(value)) return { text: `วิธีใช้: /gitmsg style conventional|thai|cute (ตอนนี้: ${style})` }
      style = value as Style
      await $.store.set('style', style)
      return { text: `🎨 สไตล์: ${style}${style === 'cute' ? ' 🎀' : ''}` }
    }
    return { text: await gitmsg($) }
  })

  on('command.run', { command: 'pr' }, async ($, e) => ({ text: await pr($, e.args.trim().split(/\s+/)[0] || undefined) }))
  on('command.run', { command: 'tweet' }, async ($, e) => ({ text: await tweet($, e.args.trim()) }))
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เขียน CHANGELOG.md จาก commit ระหว่างสอง tag
 * 2. ใส่ "Closes #123" เองถ้าชื่อ branch มีเลข issue
 * 3. /tweet แบบ thread หลายโพสต์สำหรับสรุปรายสัปดาห์
 */
