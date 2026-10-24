/**
 * ============================================================================
 * MOD 74: Code Diagram TH - แปลงโค้ดเป็นภาพ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: กระดานไวต์บอร์ดที่ทีมวาดอธิบายโค้ดกัน และ Mermaid
 *
 * หน้าที่ของ Mod นี้:
 * 1. /diagram flow <ไฟล์> - Claude (Haiku) อ่านไฟล์แล้ววาด flowchart เป็นกล่อง ASCII ┌─┐ → ◇
 * 2. /diagram class <ไฟล์> - วาด class / type และความสัมพันธ์
 * 3. /diagram deps [โฟลเดอร์] - ผังการ import ระหว่างไฟล์ (อ่าน import เอง ไม่ใช้ AI)
 *    บอกด้วยว่าไฟล์ไหนถูก import มากสุด และมี import วนกันไหม
 * 4. แสดงในแผง + /diagram save บันทึกภาพล่าสุดเป็นไฟล์ .md
 */

import type { EngineInterface, Register } from 'claude-code'

const PANE = 'code-diagram-th'
const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|php|rb|vue|svelte)$/i
const SKIP_DIR = /^(?:node_modules|\.git|dist|build|out|coverage|\.next|target|vendor|__pycache__|\.venv|venv)$/

let last: { title: string; text: string } | undefined

// ==========================================================================
// บทที่ 1: ให้ Haiku วาด - สั่งให้ใช้เฉพาะสิ่งที่อยู่ในโค้ดจริง
// ==========================================================================
const STYLE = `วาดด้วยตัวอักษร box drawing เท่านั้น: ┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼ ▶ ▼ ◇ และข้อความภาษาอังกฤษในกล่อง (ชื่อฟังก์ชัน/ตัวแปรตามโค้ด)
กว้างไม่เกิน 76 ตัวอักษร สูงไม่เกิน 45 บรรทัด ตอบเฉพาะภาพ ไม่มี code fence ไม่มีคำอธิบาย ห้ามแต่งสิ่งที่ไม่มีในโค้ด`

async function draw($: EngineInterface, kind: 'flow' | 'class', file: string, code: string): Promise<string | undefined> {
  const system = kind === 'flow' ? `วาด flowchart ของการทำงานหลักในไฟล์นี้ (ฟังก์ชันที่ export หรือ main) แสดงลำดับขั้น เงื่อนไขเป็น ◇ พร้อมทาง yes/no และจุดที่ return หรือ throw\n${STYLE}` : `วาด class diagram: class / interface / type หลัก ฟิลด์และเมธอดสำคัญ (ไม่เกิน 5 ต่อกล่อง) และเส้นความสัมพันธ์ (extends ▷, implements, มีสมาชิกเป็น ◆)\n${STYLE}`
  for (const model of ['haiku', await $.session.model()]) {
    const r = await $.model.complete({ model, system, prompt: `ไฟล์ ${file}\n\n${code.slice(0, 24_000)}`, maxTokens: 2000 }).catch(() => undefined)
    if (r?.isAnswered) return r.text.replace(/^```\w*\n?|```\s*$/g, '').trimEnd()
  }
  return undefined
}

// ==========================================================================
// บทที่ 2: ผัง import - เดินโฟลเดอร์ อ่าน import/require/from แล้วต่อเป็นกราฟ
// ==========================================================================
async function walk($: EngineInterface, dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 6 || out.length > 400) return
  const entries = await $.fs.list(dir).catch(() => [])
  for (const e of entries) {
    if (SKIP_DIR.test(e.name) || e.name.startsWith('.')) continue
    const path = `${dir}/${e.name}`
    if (e.kind === 'dir') await walk($, path, out, depth + 1)
    else if (CODE_EXT.test(e.name)) out.push(path)
  }
}

function importsOf(code: string): string[] {
  const found: string[] = []
  for (const m of code.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(|require\s*\(|export\s[^'"]*?from\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) if (m[1]) found.push(m[1])
  for (const m of code.matchAll(/^\s*from\s+(\.+[\w.]*)\s+import/gm)) if (m[1]) found.push(m[1])
  return found
}

function resolve(from: string, spec: string, files: Set<string>): string | undefined {
  const base = from.split('/').slice(0, -1)
  if (spec.startsWith('.') && !spec.startsWith('./') && !spec.startsWith('../')) {
    // Python: from .mod import x / from ..pkg.mod import y
    const dots = /^\.+/.exec(spec)?.[0].length ?? 1
    const rest = spec.slice(dots).split('.').filter(Boolean)
    const parts = [...base.slice(0, base.length - (dots - 1)), ...rest]
    return [`${parts.join('/')}.py`, `${parts.join('/')}/__init__.py`].find(p => files.has(p))
  }
  const parts = [...base]
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  const p = parts.join('/')
  const tries = [p, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte'].map(x => p + x), ...['/index.ts', '/index.tsx', '/index.js'].map(x => p + x), p.replace(/\.js$/, '.ts')]
  return tries.find(t => files.has(t))
}

async function deps($: EngineInterface, folder: string): Promise<string> {
  const root = (await $.session.root()).replace(/\\/g, '/').replace(/\/$/, '')
  const start = folder ? `${root}/${folder.replace(/\\/g, '/').replace(/^\.\//, '')}` : root
  const list: string[] = []
  await walk($, start, list)
  if (list.length === 0) return `ไม่พบไฟล์โค้ดใน ${folder || 'โปรเจกต์นี้'}`
  const files = new Set(list)
  const graph = new Map<string, string[]>()
  for (const f of list) {
    const code = await $.fs.read(f).catch(() => '')
    graph.set(f, [...new Set(importsOf(code).map(s => resolve(f, s, files)).filter((x): x is string => !!x))])
  }
  const rel = (p: string) => p.slice(start.length + 1)
  const fanIn = new Map<string, number>()
  for (const targets of graph.values()) for (const t of targets) fanIn.set(t, (fanIn.get(t) ?? 0) + 1)
  // หาวงจร import (A → B → A) ด้วย DFS
  const cycles: string[] = []
  const state = new Map<string, number>()
  const stack: string[] = []
  const dfs = (n: string) => {
    state.set(n, 1)
    stack.push(n)
    for (const t of graph.get(n) ?? []) {
      if (state.get(t) === 1 && cycles.length < 5) cycles.push([...stack.slice(stack.indexOf(t)), t].map(rel).join(' → '))
      else if (!state.get(t)) dfs(t)
    }
    stack.pop()
    state.set(n, 2)
  }
  for (const n of graph.keys()) if (!state.get(n)) dfs(n)
  // วาดเป็นต้นไม้จากไฟล์ที่ไม่มีใคร import (จุดเริ่มต้น)
  const roots = list.filter(f => !fanIn.get(f)).slice(0, 12)
  const lines: string[] = []
  const seen = new Set<string>()
  const tree = (n: string, prefix: string, isLast: boolean, depth: number) => {
    if (lines.length > 70) return
    lines.push(`${prefix}${depth ? (isLast ? '└─▶ ' : '├─▶ ') : ''}${rel(n)}${seen.has(n) ? ' ↺' : ''}`)
    if (seen.has(n) || depth > 5) return
    seen.add(n)
    const kids = graph.get(n) ?? []
    kids.forEach((k, i) => tree(k, prefix + (depth ? (isLast ? '    ' : '│   ') : ''), i === kids.length - 1, depth + 1))
  }
  for (const r of roots) tree(r, '', true, 0)
  const hubs = [...fanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  return [
    ...lines,
    lines.length > 70 ? '… (ตัดเหลือ 70 บรรทัด)' : '',
    '',
    `📦 ${list.length} ไฟล์ · ${[...graph.values()].reduce((s, t) => s + t.length, 0)} การ import`,
    hubs.length ? `🎯 ถูก import มากสุด: ${hubs.map(([f, n]) => `${rel(f)} (${n})`).join(', ')}` : '',
    cycles.length ? `🔁 import วนกัน:\n${cycles.map(c => `   ${c}`).join('\n')}` : '✅ ไม่มี import วนกัน',
  ]
    .filter(Boolean)
    .join('\n')
}

async function show($: EngineInterface, title: string, text: string): Promise<string> {
  last = { title, text }
  await $.ui.open({ id: PANE, title: `🗺️ ${title}` })
  $.ui.invalidate('ui.render')
  return `🗺️ ${title}\n\n${text}\n\nบันทึกเป็นไฟล์: /diagram save`
}

const HELP = `🗺️ Code Diagram TH (Mod 74)
========================================
/diagram flow <ไฟล์>     flowchart ของการทำงานหลัก (Claude วาด)
/diagram class <ไฟล์>    class / type และความสัมพันธ์ (Claude วาด)
/diagram deps [โฟลเดอร์]  ผังการ import ระหว่างไฟล์ (คำนวณเอง)
/diagram save            บันทึกภาพล่าสุดเป็น <ชื่อ>.diagram.md`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'diagram', description: 'แปลงโค้ดเป็นภาพ: flowchart, class diagram, ผัง import (/diagram help)', argumentHint: 'flow|class <ไฟล์>|deps [โฟลเดอร์]|save' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (!last) return <Text dimColor>/diagram flow src/app.ts</Text>
    return (
      <Box flexDirection="column">
        {last.text.split('\n').map(line => (
          <Text color={/[◇▶▼]/.test(line) ? '#80cbc4' : /[┌└├│─]/.test(line) ? '#b0bec5' : undefined} wrap="truncate-end">
            {line || ' '}
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'diagram' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ').replace(/^["']|["']$/g, '')
    switch (sub) {
      case 'flow':
      case 'class': {
        if (!arg) return { text: `วิธีใช้: /diagram ${sub} src/app.ts` }
        const root = (await $.session.root()).replace(/[\\/]$/, '')
        const path = /^(?:[A-Za-z]:[\\/]|\/)/.test(arg) ? arg : `${root}/${arg}`
        const code = await $.fs.read(path).catch(() => undefined)
        if (code === undefined) return { text: `❌ อ่านไฟล์ไม่ได้: ${arg}` }
        const pic = await draw($, sub, arg, code)
        return { text: pic ? await show($, `${sub} ${arg}`, pic) : '❌ วาดไม่สำเร็จ ลองใหม่' }
      }
      case 'deps':
        return { text: await show($, `deps ${arg || '.'}`, await deps($, arg)) }
      case 'save': {
        if (!last) return { text: 'ยังไม่มีภาพ ลอง /diagram deps ก่อน' }
        const root = (await $.session.root()).replace(/[\\/]$/, '')
        const name = last.title.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
        const path = `${root}${root.includes('\\') ? '\\' : '/'}${name}.diagram.md`
        await $.fs.write(path, `# ${last.title}\n\n\`\`\`\n${last.text}\n\`\`\`\n`)
        return { text: `💾 บันทึกแล้ว: ${path}` }
      }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งออกเป็น Mermaid (.mmd) เปิดบน GitHub แล้วเป็นภาพจริง
 * 2. ไล่ผัง import แบบย้อนกลับ: "ใครบ้างที่ใช้ไฟล์นี้"
 * 3. วาด sequence diagram ของ API จากไฟล์ route
 */
