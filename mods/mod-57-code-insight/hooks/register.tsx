/**
 * ============================================================================
 * MOD 57: Code Insight TH - เจาะลึกโปรเจกต์จากประวัติ git (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: หนังสือ "Your Code as a Crime Scene" - ประวัติ git บอกอะไรได้มากกว่าที่คิด
 *
 * หน้าที่ของ Mod นี้:
 * 1. /insight map - แผนที่โฟลเดอร์ + จำนวนไฟล์ + คำอธิบายสั้นๆ ที่ Claude อ่านจากชื่อไฟล์จริง
 *    (จำผลไว้ ไม่เรียกซ้ำจนกว่าโครงสร้างเปลี่ยน) และบันทึกเป็น CODEMAP.md ได้
 * 2. /insight owners [path] - ใครเขียนส่วนไหนมากสุด (นับจาก commit)
 * 3. /insight hotspots - ไฟล์ที่ถูกแก้บ่อยที่สุด = จุดที่บั๊กชอบซ่อน
 * 4. /insight file <path> - ประวัติไฟล์: สร้างเมื่อไหร่ ใครแก้ แก้ล่าสุดเรื่องอะไร
 *
 * TODO/FIXME ดูได้ที่ Mod 18 (/pain todos)
 */

import type { EngineInterface, Register } from 'claude-code'

const IGNORE = /^(?:node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|target|vendor|__pycache__|\.venv|venv|\.cache|\.turbo|\.idea|\.vscode)$/

let cache: { key: string; text: string } | undefined

async function git($: EngineInterface, args: string[], timeoutMs = 30_000): Promise<string | undefined> {
  const r = await $.process.run(['git', ...args], { timeoutMs }).catch(() => undefined)
  return r?.exitCode === 0 ? r.stdout : undefined
}

function bar(n: number, max: number, width = 16): string {
  return '█'.repeat(Math.max(1, Math.round((n / Math.max(1, max)) * width)))
}

// ==========================================================================
// บทที่ 1: แผนที่โปรเจกต์ - นับไฟล์จาก git ls-files (เคารพ .gitignore อยู่แล้ว)
// ==========================================================================
interface Folder {
  path: string
  files: number
  samples: string[]
}

async function folders($: EngineInterface): Promise<Folder[] | undefined> {
  const out = await git($, ['ls-files'])
  if (out === undefined) return undefined
  const files = out.split('\n').filter(f => f && !f.split('/').some(p => IGNORE.test(p)))
  // โฟลเดอร์แม่ที่มีลูกเยอะ (เช่น mods/ 50 โฟลเดอร์) ยุบเป็นบรรทัดเดียว ไม่งั้นแผนที่ยาวเกิน
  const children = new Map<string, Set<string>>()
  for (const f of files) {
    const parts = f.split('/')
    if (parts.length > 2) children.set(parts[0] ?? '', (children.get(parts[0] ?? '') ?? new Set()).add(parts[1] ?? ''))
  }
  const map = new Map<string, Folder>()
  for (const file of files) {
    const parts = file.split('/')
    const top = parts[0] ?? ''
    const crowded = (children.get(top)?.size ?? 0) > 12
    const key = parts.length === 1 ? '(root)' : parts.length === 2 || crowded ? `${top}/` : `${top}/${parts[1]}`
    const f = map.get(key) ?? { path: key, files: 0, samples: [] }
    f.files++
    const sample = crowded ? `${parts[1]}/` : parts.at(-1) ?? ''
    if (f.samples.length < 8 && !f.samples.includes(sample)) f.samples.push(sample)
    map.set(key, f)
  }
  for (const [top, set] of children) {
    const f = map.get(`${top}/`)
    if (f && set.size > 12) f.path = `${top}/ (${set.size} โฟลเดอร์ย่อย)`
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 60)
}

async function describe($: EngineInterface, list: Folder[]): Promise<Record<string, string>> {
  const readme = (await $.fs.read('README.md').catch(() => '')).slice(0, 1500)
  const system = `คุณช่วยทำแผนที่โปรเจกต์ซอฟต์แวร์ ดูรายชื่อโฟลเดอร์และตัวอย่างชื่อไฟล์ แล้วอธิบายแต่ละโฟลเดอร์เป็นภาษาไทยสั้นๆ ไม่เกิน 60 ตัวอักษร ขึ้นต้นด้วย emoji ที่สื่อความหมาย
ตอบเป็น JSON object เท่านั้น: {"<path>": "<emoji คำอธิบาย>"} ห้ามเดาเกินจากชื่อไฟล์ ถ้าไม่แน่ใจให้เขียนว่า "ไม่แน่ใจ" ตามด้วยสิ่งที่เห็น`
  const prompt = `${readme ? `README (ตัด):\n${readme}\n\n` : ''}${list.map(f => `${f.path} (${f.files} ไฟล์): ${f.samples.join(', ')}`).join('\n')}`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt, maxTokens: 3000 }).catch(() => undefined)
    if (!r?.isAnswered) continue
    // อ่านทีละคู่ "path": "คำอธิบาย" แทน JSON.parse ทั้งก้อน: คำตอบที่ถูกตัดกลางทางก็ยังใช้ได้
    const out: Record<string, string> = {}
    for (const m of r.text.matchAll(/"((?:[^"\\]|\\.)+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) if (m[1] && m[2]) out[m[1]] = m[2]
    if (Object.keys(out).length) return out
  }
  return {}
}

async function codeMap($: EngineInterface, save: boolean): Promise<string> {
  const list = await folders($)
  if (!list) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  if (list.length === 0) return '📭 ยังไม่มีไฟล์ใน git'
  const key = `v2|${await $.session.root()}|${list.map(f => `${f.path}:${f.files}`).join(',')}`
  let text = cache?.key === key ? cache.text : ''
  if (!text) {
    const stored = (await $.store.get('map')) as { key: string; text: string } | undefined
    if (stored?.key === key) text = stored.text
  }
  if (!text) {
    const desc = await describe($, list)
    const width = Math.min(34, Math.max(...list.map(f => f.path.length)))
    // โมเดลอาจตอบ key ต่างกันเล็กน้อย ("mods" / "mods/" / "mods/ (48 ...)") จึงเทียบแบบตัดส่วนเกินออก
    const norm = (p: string) => p.replace(/\s*\(.*\)$/, '').replace(/\/$/, '').toLowerCase()
    const byNorm = new Map(Object.entries(desc).map(([k, v]) => [norm(k), v]))
    text = list.map(f => `${f.path.padEnd(width)} ${String(f.files).padStart(4)}  ${byNorm.get(norm(f.path)) ?? ''}`).join('\n')
    // เก็บไว้ใช้ซ้ำเฉพาะตอนได้คำอธิบายจริง
    if (Object.keys(desc).length) {
      cache = { key, text }
      await $.store.set('map', cache)
    }
  }
  const total = list.reduce((s, f) => s + f.files, 0)
  const out = `🗺️ แผนที่โปรเจกต์ (${total} ไฟล์ใน git)\n\n${text}`
  if (!save) return `${out}\n\nบันทึกเป็นไฟล์: /insight map save`
  const root = (await $.session.root()).replace(/[\\/]$/, '')
  const path = `${root}${root.includes('\\') ? '\\' : '/'}CODEMAP.md`
  await $.fs.write(path, `# แผนที่โปรเจกต์\n\nสร้างโดย Code Insight (Mod 57) จาก \`git ls-files\` — ตัวเลขคือจำนวนไฟล์\n\n\`\`\`\n${text}\n\`\`\`\n`)
  return `${out}\n\n💾 บันทึกแล้ว: ${path}`
}

// ==========================================================================
// บทที่ 2: เจ้าของโค้ด - นับ commit ต่อคน (git shortlog)
// ==========================================================================
async function owners($: EngineInterface, path: string): Promise<string> {
  const out = await git($, ['shortlog', '-sne', '--no-merges', 'HEAD', '--', path || '.'])
  if (out === undefined) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  const rows = out
    .split('\n')
    .map(l => /^\s*(\d+)\s+(.+?)\s*<[^>]*>\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map(m => ({ n: Number(m[1]), who: m[2] ?? '' }))
  if (rows.length === 0) return `📭 ไม่มี commit ที่แตะ ${path || 'โปรเจกต์นี้'}`
  const total = rows.reduce((s, r) => s + r.n, 0)
  const max = rows[0]?.n ?? 1
  return [`👥 เจ้าของ ${path || 'ทั้งโปรเจกต์'} (${total} commit)`, ...rows.slice(0, 12).map(r => `  ${r.who.slice(0, 24).padEnd(24)} ${String(r.n).padStart(5)} ${String(Math.round((r.n / total) * 100)).padStart(3)}%  ${bar(r.n, max)}`)].join('\n')
}

// ==========================================================================
// บทที่ 3: Hotspot - ไฟล์ที่ถูกแก้บ่อย (ไม่นับไฟล์ lock และไฟล์ที่ถูกลบไปแล้ว)
// ==========================================================================
async function hotspots($: EngineInterface, months: number): Promise<string> {
  const out = await git($, ['log', `--since=${months} months ago`, '--no-merges', '--name-only', '--pretty=format:'], 60_000)
  if (out === undefined) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  const alive = new Set((await git($, ['ls-files']))?.split('\n') ?? [])
  const counts = new Map<string, number>()
  for (const f of out.split('\n')) {
    if (!f || !alive.has(f) || /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$/.test(f)) continue
    counts.set(f, (counts.get(f) ?? 0) + 1)
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (rows.length === 0) return `📭 ไม่มีการแก้ไฟล์ใน ${months} เดือนล่าสุด`
  const max = rows[0]?.[1] ?? 1
  return [`🔥 ไฟล์ที่ถูกแก้บ่อยสุดใน ${months} เดือน (ยิ่งบ่อย ยิ่งควรมีเทสต์และรีวิวดีๆ)`, ...rows.map(([f, n]) => `  ${String(n).padStart(4)}×  ${bar(n, max, 12).padEnd(12)}  ${f}`), '', 'ดูประวัติไฟล์: /insight file <path>'].join('\n')
}

// ==========================================================================
// บทที่ 4: ประวัติไฟล์
// ==========================================================================
async function fileHistory($: EngineInterface, path: string): Promise<string> {
  const log = await git($, ['log', '--follow', '--no-merges', '--date=short', '--pretty=format:%ad|%an|%s', '--', path])
  if (log === undefined) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  const rows = log.split('\n').filter(Boolean).map(l => l.split('|'))
  if (rows.length === 0) return `📭 ไม่พบประวัติของ ${path} (ยังไม่เคย commit หรือพิมพ์ path ผิด)`
  const first = rows.at(-1) ?? []
  const authors = new Map<string, number>()
  for (const r of rows) authors.set(r[1] ?? '', (authors.get(r[1] ?? '') ?? 0) + 1)
  return [
    `📜 ${path}`,
    `  สร้าง ${first[0]} โดย ${first[1]} · แก้ทั้งหมด ${rows.length} ครั้ง · ${authors.size} คน`,
    `  ผู้แก้: ${[...authors.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} (${n})`).join(', ')}`,
    '',
    '  ล่าสุด:',
    ...rows.slice(0, 8).map(r => `  ${r[0]}  ${(r[1] ?? '').slice(0, 14).padEnd(14)}  ${(r.slice(2).join('|') ?? '').slice(0, 70)}`),
  ].join('\n')
}

const HELP = `🔍 Code Insight TH (Mod 57)
========================================
/insight map [save]        แผนที่โฟลเดอร์ + คำอธิบาย (save = เขียน CODEMAP.md)
/insight owners [path]     ใครเขียนส่วนไหนมากสุด
/insight hotspots [เดือน]   ไฟล์ที่ถูกแก้บ่อยสุด (ค่าเริ่มต้น 6 เดือน)
/insight file <path>       ประวัติไฟล์`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cache = undefined
    await $.command.register({ name: 'insight', description: 'เจาะลึกโปรเจกต์จาก git: แผนที่ เจ้าของโค้ด hotspot ประวัติไฟล์ (/insight help)', argumentHint: 'map|owners|hotspots|file <path>' })
    return next(e)
  })

  on('command.run', { command: 'insight' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ').replace(/^["']|["']$/g, '').replace(/\\/g, '/')
    switch (sub) {
      case 'map':
        return { text: await codeMap($, rest[0] === 'save') }
      case 'owners':
        return { text: await owners($, arg) }
      case 'hotspots': {
        const months = Number(rest[0] || 6)
        return { text: months > 0 && months <= 120 ? await hotspots($, months) : 'วิธีใช้: /insight hotspots 6' }
      }
      case 'file':
        return { text: arg ? await fileHistory($, arg) : 'วิธีใช้: /insight file src/app.ts' }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. "Bus factor": หาโฟลเดอร์ที่มีคนเขียนแค่คนเดียว (ถ้าคนนั้นลาออก ใครจะดูแล?)
 * 2. คูณ hotspot กับความยาวไฟล์ = จุดเสี่ยงจริง
 * 3. วาดแผนที่เป็นกราฟใน Pane แบบ treemap ตัวอักษร
 */
