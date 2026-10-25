/**
 * ============================================================================
 * MOD 102: Mermaid Inline TH - วาด Mermaid ในคำตอบเป็นภาพตัวอักษรสี (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: mermaid-draw และ cs-mermaid ใน awesome-claude-code-mods
 *
 * Claude ชอบตอบเป็นบล็อก ```mermaid แต่ใน terminal เห็นเป็นโค้ดดิบ อ่านยาก
 *
 * หน้าที่ของ Mod นี้:
 * 1. เจอบล็อก ```mermaid ในคำตอบของ Claude วาดเป็นภาพกล่องและลูกศรสีแทน ตรงตำแหน่งเดิม
 * 2. รองรับ flowchart / graph (TD, LR), sequenceDiagram และ pie
 *    แบบที่ยังวาดไม่ได้ (class, er, gantt ...) แสดงโค้ดเดิมพร้อมบอกว่ายังไม่รองรับ
 * 3. คิดความกว้างตัวอักษรไทย (สระบน-ล่าง วรรณยุกต์ไม่กินช่อง) กล่องจึงตรง
 * 4. /mermaid raw on ดูโค้ดเดิมใต้ภาพด้วย, /mermaid demo ดูตัวอย่าง
 *
 * Mod นี้เปลี่ยนแค่ "ภาพที่เราเห็น" ข้อความที่ Claude ได้รับและจำไว้ยังเป็นโค้ด mermaid เหมือนเดิม
 */

import type { Register } from 'claude-code'

type Span = { text: string; color?: string; dim?: boolean }
type Line = Span[]

let enabled = true
let showRaw = false

// ==========================================================================
// บทที่ 1: ความกว้างบนจอ (ไทยมีสระ/วรรณยุกต์ที่ซ้อนอยู่ในช่องเดิม, emoji/CJK กว้าง 2 ช่อง)
// ==========================================================================
function width(text: string): number {
  let w = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e) || (c >= 0x0300 && c <= 0x036f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) continue
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) || (c >= 0x1f300 && c <= 0x1faff) ? 2 : 1
  }
  return w
}

function pad(text: string, w: number): string {
  return text + ' '.repeat(Math.max(0, w - width(text)))
}

function clip(text: string, max: number): string {
  if (width(text) <= max) return text
  let out = ''
  for (const ch of text) {
    if (width(`${out}${ch}…`) > max) break
    out += ch
  }
  return `${out}…`
}

function lineWidth(line: Line): number {
  return line.reduce((n, s) => n + width(s.text), 0)
}

// ==========================================================================
// บทที่ 2: อ่าน flowchart
// ==========================================================================
type Shape = 'box' | 'round' | 'decision' | 'circle' | 'db'
interface Node {
  id: string
  label: string
  shape: Shape
}
interface Edge {
  from: string
  to: string
  label: string
  dotted: boolean
}

const SHAPE_RE: [RegExp, Shape][] = [
  [/^\(\((.*)\)\)$/, 'circle'],
  [/^\(\[(.*)\]\)$/, 'round'],
  [/^\[\((.*)\)\]$/, 'db'],
  [/^\[\[(.*)\]\]$/, 'box'],
  [/^\{\{(.*)\}\}$/, 'decision'],
  [/^\[\/(.*)\/\]$/, 'box'],
  [/^\[(.*)\]$/, 'box'],
  [/^\((.*)\)$/, 'round'],
  [/^\{(.*)\}$/, 'decision'],
  [/^>(.*)\]$/, 'box'],
]
// โหนดที่มีรูปทรง เช่น A[ข้อความ] B{ถาม?} C((วงกลม))
const SHAPED = /([A-Za-z0-9_฀-๿]+)\s*(\(\(.*?\)\)|\(\[.*?\]\)|\[\(.*?\)\]|\[\[.*?\]\]|\{\{.*?\}\}|\[\/.*?\/\]|\[.*?\]|\(.*?\)|\{.*?\}|>.*?\])/g
// ลูกศร: -->, ---, -.->, ==>, -- ข้อความ -->, -->|ข้อความ|
const LINK = /\s*(?:(?:--|==|-\.)\s*([^-=.|>][^|>]*?)\s*)?(<?-->|<?==>|-\.->|\.->|---|===|-\.-|--[ox])\s*(?:\|([^|]*)\|)?\s*/g

function cleanLabel(text: string): string {
  return text
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&quot;/g, '"')
    .trim()
}

function parseFlow(src: string): { dir: 'TD' | 'LR'; nodes: Map<string, Node>; edges: Edge[] } {
  // บรรทัดใหม่และ ; คั่นคำสั่งได้ทั้งคู่
  const statements = src.split(/\n|;/).map(s => s.trim()).filter(Boolean)
  const head = /^(?:flowchart|graph)\s*(TD|TB|BT|LR|RL)?/i.exec(statements[0] ?? '')
  const dir = /LR|RL/i.test(head?.[1] ?? '') ? 'LR' : 'TD'
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const ensure = (id: string): void => {
    if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'box' })
  }
  for (const statement of statements.slice(1)) {
    if (/^(%%|classDef|class\s|style\s|linkStyle|click\s|subgraph|end$|direction)/.test(statement)) continue
    // 1) จดรูปทรง+ข้อความของโหนด แล้วเหลือแค่ id (ข้อความในวงเล็บจะไม่ไปปนกับลูกศร)
    const masked = statement.replace(SHAPED, (_, id: string, shapeText: string) => {
      for (const [re, shape] of SHAPE_RE) {
        const s = re.exec(shapeText)
        if (s) {
          nodes.set(id, { id, label: cleanLabel(s[1] ?? id) || id, shape })
          break
        }
      }
      return id
    })
    // 2) ตัดตามลูกศร: กลุ่มโหนด, ลูกศร, กลุ่มโหนด, ลูกศร, ...
    const groups: string[][] = []
    const links: { label: string; dotted: boolean }[] = []
    let at = 0
    for (const m of masked.matchAll(LINK)) {
      groups.push(masked.slice(at, m.index).split('&').map(s => s.trim()).filter(Boolean))
      links.push({ label: cleanLabel(m[3] ?? m[1] ?? ''), dotted: (m[2] ?? '').includes('.') })
      at = (m.index ?? 0) + m[0].length
    }
    groups.push(masked.slice(at).split('&').map(s => s.trim()).filter(Boolean))
    for (const g of groups) g.forEach(ensure)
    links.forEach((link, i) => {
      for (const from of groups[i] ?? []) for (const to of groups[i + 1] ?? []) edges.push({ from, to, ...link })
    })
  }
  return { dir, nodes, edges }
}

// ==========================================================================
// บทที่ 3: จัดชั้น (level) แล้ววาดกล่อง
// ==========================================================================
const COLOR: Record<Shape, string> = { box: '#90caf9', round: '#81c784', decision: '#ffd54f', circle: '#4dd0e1', db: '#ce93d8' }
const FRAME: Record<Shape, [string, string, string, string, string, string]> = {
  box: ['┌', '─', '┐', '│', '└', '┘'],
  round: ['╭', '─', '╮', '│', '╰', '╯'],
  decision: ['╔', '═', '╗', '║', '╚', '╝'],
  circle: ['╭', '─', '╮', '│', '╰', '╯'],
  db: ['╭', '─', '╮', '│', '╰', '╯'],
}

function levels(nodes: Map<string, Node>, edges: Edge[]): string[][] {
  const ids = [...nodes.keys()]
  const incoming = new Set(edges.map(e => e.to))
  const roots = ids.filter(id => !incoming.has(id))
  const level = new Map<string, number>()
  const queue = (roots.length ? roots : ids.slice(0, 1)).map(id => ({ id, d: 0 }))
  // BFS: ให้ทุกโหนดอยู่ชั้นแรกที่เดินไปถึง ลูกศรย้อนกลับ (วนลูป) จึงไม่ทำให้ค้าง
  while (queue.length) {
    const { id, d } = queue.shift()!
    if (level.has(id)) continue
    level.set(id, d)
    for (const e of edges) if (e.from === id && !level.has(e.to)) queue.push({ id: e.to, d: d + 1 })
  }
  for (const id of ids) if (!level.has(id)) level.set(id, 0)
  const rows: string[][] = []
  for (const id of ids) (rows[level.get(id)!] ??= []).push(id)
  return rows.filter(Boolean)
}

function box(n: Node, maxLabel: number): Line[] {
  const label = clip(n.label, maxLabel)
  const [tl, h, tr, v, bl, br] = FRAME[n.shape]
  const w = width(label) + 2
  const c = COLOR[n.shape]
  const mark = n.shape === 'decision' ? '◆' : n.shape === 'db' ? '⛁' : ''
  const inner = mark ? `${mark}${label}` : label
  const iw = Math.max(w, width(inner) + 2)
  return [[{ text: tl + h.repeat(iw) + tr, color: c }], [{ text: v, color: c }, { text: ` ${pad(inner, iw - 2)} ` }, { text: v, color: c }], [{ text: bl + h.repeat(iw) + br, color: c }]]
}

function edgeText(e: Edge, nodes: Map<string, Node>): Line {
  const name = (id: string): string => clip(nodes.get(id)?.label ?? id, 18)
  const shaft = e.dotted ? '┄┄' : '──'
  return [{ text: name(e.from) }, { text: ` ${shaft}${e.label ? ` ${clip(e.label, 16)} ` : ''}${shaft}▶ `, color: e.label ? '#ffb74d' : '#78909c' }, { text: name(e.to) }]
}

function drawFlow(src: string): Line[] {
  const { dir, nodes, edges } = parseFlow(src)
  if (nodes.size === 0) return []
  const rows = levels(nodes, edges)
  const out: Line[] = []
  if (dir === 'TD') {
    rows.forEach((row, i) => {
      const boxes = row.map(id => box(nodes.get(id)!, 22))
      // กล่องในชั้นเดียวกันวางเรียงแนวนอน
      for (let r = 0; r < 3; r++) {
        const line: Line = [{ text: '  ' }]
        boxes.forEach((b, j) => {
          if (j) line.push({ text: '   ' })
          line.push(...b[r]!)
        })
        out.push(line)
      }
      const down = edges.filter(e => row.includes(e.from))
      if (i < rows.length - 1 || down.length) {
        const plain = down.every(e => !e.label) && down.length === 1 && rows[i + 1]?.includes(down[0]!.to)
        if (plain) out.push([{ text: '      │', color: '#78909c' }], [{ text: '      ▼', color: '#78909c' }])
        else for (const e of down) out.push([{ text: '   ↓ ', color: '#78909c' }, ...edgeText(e, nodes)])
      }
    })
    return out
  }
  // LR: แต่ละชั้นเป็นคอลัมน์ วางกล่องซ้อนลงมา แล้วต่อคอลัมน์ด้วยลูกศร
  const cols = rows.map(row => row.flatMap(id => box(nodes.get(id)!, 16)))
  const height = Math.max(...cols.map(c => c.length))
  const widths = cols.map(c => Math.max(...c.map(lineWidth)))
  for (let r = 0; r < height; r++) {
    const line: Line = [{ text: '  ' }]
    cols.forEach((col, j) => {
      const cell = col[r] ?? [{ text: '' }]
      line.push(...cell, { text: ' '.repeat(widths[j]! - lineWidth(cell)) })
      if (j < cols.length - 1) line.push({ text: r === 1 ? ' ──▶ ' : '     ', color: '#78909c' })
    })
    out.push(line)
  }
  // ลูกศรที่มีป้าย หรือข้ามคอลัมน์ บอกไว้ข้างล่างให้ชัด
  const notes = edges.filter(e => e.label || rows.findIndex(r => r.includes(e.to)) !== rows.findIndex(r => r.includes(e.from)) + 1)
  for (const e of notes) out.push([{ text: '   → ', color: '#78909c' }, ...edgeText(e, nodes)])
  return out
}

// ==========================================================================
// บทที่ 4: sequenceDiagram และ pie
// ==========================================================================
function drawSequence(src: string): Line[] {
  const actors: string[] = []
  const alias = new Map<string, string>()
  const add = (id: string): void => {
    if (!actors.includes(id)) actors.push(id)
  }
  const body: Line[] = []
  let depth = 0
  for (const raw of src.split('\n').slice(1)) {
    const s = raw.trim()
    if (!s || s.startsWith('%%') || /^autonumber/.test(s)) continue
    const p = /^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/.exec(s)
    if (p) {
      add(p[1]!)
      if (p[2]) alias.set(p[1]!, cleanLabel(p[2]))
      continue
    }
    const indent = '  '.repeat(depth)
    const block = /^(loop|alt|opt|par|critical|rect)\b\s*(.*)$/.exec(s)
    if (block) {
      body.push([{ text: `  ${indent}┌ ${block[1]} ${block[2]}`, color: '#ab47bc' }])
      depth++
      continue
    }
    if (/^else\b/.test(s)) {
      body.push([{ text: `  ${'  '.repeat(Math.max(0, depth - 1))}├ ${s}`, color: '#ab47bc' }])
      continue
    }
    if (s === 'end') {
      depth = Math.max(0, depth - 1)
      body.push([{ text: `  ${'  '.repeat(depth)}└`, color: '#ab47bc' }])
      continue
    }
    const note = /^note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(s)
    if (note) {
      body.push([{ text: `  ${indent}📝 ${note[1]!.trim()}: `, dim: true }, { text: cleanLabel(note[2] ?? '') }])
      continue
    }
    const msg = /^([^-\s>]+)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*([+-]?)([^:]+?)\s*:\s*(.*)$/.exec(s)
    if (msg) {
      const from = msg[1]!
      const to = msg[4]!.trim()
      add(from)
      add(to)
      const dashed = msg[2]!.startsWith('--')
      const reply = dashed ? '┄┄' : '──'
      body.push([{ text: `  ${indent}` }, { text: alias.get(from) ?? from, color: '#90caf9' }, { text: ` ${reply} ${cleanLabel(msg[5] ?? '')} ${reply}▶ `, color: dashed ? '#78909c' : '#ffb74d' }, { text: alias.get(to) ?? to, color: '#90caf9' }])
    }
  }
  const head: Line = [{ text: '  ' }]
  actors.forEach((a, i) => {
    if (i) head.push({ text: '   ' })
    head.push({ text: `[ ${alias.get(a) ?? a} ]`, color: '#90caf9' })
  })
  return [head, [{ text: '' }], ...body]
}

function drawPie(src: string): Line[] {
  const title = /^\s*pie\b(?:\s+showData)?(?:\s+title\s+(.*))?/i.exec(src.split('\n')[0] ?? '')?.[1]
  const items = [...src.matchAll(/^\s*"([^"]+)"\s*:\s*([\d.]+)/gm)].map(m => ({ label: m[1]!, value: Number(m[2]) }))
  const total = items.reduce((n, i) => n + i.value, 0) || 1
  const labelW = Math.min(20, Math.max(...items.map(i => width(i.label)), 4))
  const colors = ['#4fc3f7', '#81c784', '#ffd54f', '#ff8a65', '#ba68c8', '#4db6ac', '#f06292']
  const out: Line[] = title ? [[{ text: `  ${cleanLabel(title)}` }]] : []
  items.forEach((it, i) => {
    const pct = (it.value / total) * 100
    out.push([{ text: `  ${pad(clip(it.label, labelW), labelW)} ` }, { text: '█'.repeat(Math.max(1, Math.round(pct / 4))), color: colors[i % colors.length] }, { text: ` ${pct.toFixed(1)}%`, dim: true }])
  })
  return out
}

function draw(src: string): Line[] {
  const kind = src.trim().split(/\s/)[0]?.toLowerCase() ?? ''
  try {
    if (kind === 'flowchart' || kind === 'graph') return drawFlow(src.trim())
    if (kind === 'sequencediagram') return drawSequence(src.trim())
    if (kind === 'pie') return drawPie(src.trim())
  } catch {
    return []
  }
  return []
}

function plain(lines: Line[]): string {
  return lines.map(l => l.map(s => s.text).join('').trimEnd()).join('\n')
}

const DEMO = `flowchart TD
  A([ผู้ใช้ส่งคำสั่ง]) --> B{มีไฟล์อยู่แล้ว?}
  B -- ใช่ --> C[อ่านไฟล์]
  B -- ไม่ --> D[สร้างไฟล์ใหม่]
  C --> E((เสร็จ))
  D --> E`

const FENCE = /```mermaid[^\n]*\n([\s\S]*?)```/g

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const s = (await $.store.get('settings')) as { enabled?: boolean; showRaw?: boolean } | undefined
    enabled = s?.enabled ?? true
    showRaw = s?.showRaw ?? false
    await $.command.register({ name: 'mermaid', description: 'วาดบล็อก mermaid ในคำตอบของ Claude เป็นภาพสี (/mermaid help)', argumentHint: 'on|off | raw on|off | demo' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: วาดคำตอบของ Claude ใหม่ แทนที่เฉพาะบล็อก mermaid
  // ==========================================================================
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text
    if (!enabled || !text.includes('```mermaid')) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const parts: (string | { src: string; lines: Line[] })[] = []
    let at = 0
    for (const m of text.matchAll(FENCE)) {
      parts.push(text.slice(at, m.index))
      parts.push({ src: m[1] ?? '', lines: draw(m[1] ?? '') })
      at = (m.index ?? 0) + m[0].length
    }
    parts.push(text.slice(at))
    // ยังพิมพ์บล็อกไม่จบ (กำลังสตรีม) หรือวาดไม่ได้เลย: ปล่อยให้ engine วาดเอง
    if (!parts.some(p => typeof p !== 'string' && p.lines.length)) return next(e)
    return (
      <Box flexDirection="column">
        {parts.map(p =>
          typeof p === 'string' ? (
            p.trim() ? <Markdown text={p.trim()} /> : null
          ) : (
            <Box flexDirection="column" marginTop={1} marginBottom={1}>
              {p.lines.length ? (
                p.lines.map(line => (
                  <Text>
                    {line.map(s => (
                      <Text color={s.color} dimColor={s.dim}>
                        {s.text}
                      </Text>
                    ))}
                  </Text>
                ))
              ) : (
                <Text dimColor>(Mermaid Inline: ยังวาดแผนภาพแบบนี้ไม่ได้ แสดงโค้ดเดิม)</Text>
              )}
              {(showRaw || !p.lines.length) && <Markdown text={`\`\`\`mermaid\n${p.src}\`\`\``} />}
            </Box>
          ),
        )}
      </Box>
    )
  })

  on('command.run', { command: 'mermaid' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', { enabled, showRaw })
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await save()
      $.ui.invalidate('ui.render')
      return { text: `🧜 Mermaid Inline: ${enabled ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'raw' && (arg === 'on' || arg === 'off')) {
      showRaw = arg === 'on'
      await save()
      $.ui.invalidate('ui.render')
      return { text: `🧜 แสดงโค้ดเดิมใต้ภาพ: ${showRaw ? 'เปิด' : 'ปิด'}` }
    }
    if (sub === 'demo') return { text: `${DEMO}\n\n${plain(draw(DEMO))}` }
    if (sub === 'draw') {
      // วาดโค้ดที่พิมพ์มาเอง ใช้ ; แทนการขึ้นบรรทัดใหม่ เช่น /mermaid draw graph LR; A-->B; B-->C
      const src = e.args.trim().slice(4).trim().replace(/;\s*/g, '\n')
      const lines = draw(src)
      return { text: lines.length ? plain(lines) : 'วาดไม่ได้ ตรวจโค้ด mermaid อีกครั้ง (รองรับ flowchart/graph, sequenceDiagram, pie)' }
    }
    return { text: '🧜 Mermaid Inline TH (Mod 102)\n/mermaid on|off      เปิด/ปิด\n/mermaid raw on|off  แสดงโค้ดเดิมใต้ภาพด้วย\n/mermaid demo        ดูตัวอย่าง\n/mermaid draw <โค้ด>  วาดโค้ดที่พิมพ์เอง ใช้ ; แทนขึ้นบรรทัด\nรองรับ flowchart/graph (TD, LR), sequenceDiagram, pie' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. วาดเส้นเชื่อมจริงระหว่างกล่อง (┬ ┴ ├ ┤) แทนรายการลูกศร
 * 2. รองรับ classDiagram และ erDiagram
 * 3. ปุ่ม "เปิดใน mermaid.live" สร้างลิงก์จากโค้ดด้วย base64
 */
