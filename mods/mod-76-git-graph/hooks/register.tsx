/**
 * ============================================================================
 * MOD 76: Git Graph TH - กราฟ git สีสวยในแผง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: GitLens / git log --graph ที่อ่านยากเพราะไม่มีสี
 *
 * หน้าที่ของ Mod นี้:
 * 1. /gitgraph [จำนวน] - วาดกราฟ commit ทุก branch: เส้นแต่ละเลนคนละสี,
 *    ป้าย HEAD (เขียว) branch (ฟ้า) remote (ม่วง) tag (เหลือง), hash, ข้อความ, ผู้เขียน, เวลา
 * 2. /gitgraph branch - สรุปทุก branch: ล้ำหน้า/ตามหลัง main กี่ commit, commit ล่าสุดเมื่อไหร่
 * 3. /gitgraph file <path> - กราฟเฉพาะ commit ที่แตะไฟล์นั้น
 * 4. แผงรีเฟรชเองเมื่อ Claude รันคำสั่ง git ที่เปลี่ยนประวัติ (commit, merge, rebase, checkout ...)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Row {
  graph: string
  hash: string
  refs: string[]
  subject: string
  author: string
  when: string
}

const PANE = 'git-graph-th'
const LANE_COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#26c6da', '#ff7043', '#8d6e63']
const SEP = '\u001f' // ตัวคั่นที่ไม่มีในข้อความ commit ปกติ

let rows: Row[] = []
let title = ''
let lastArgs: string[] = []

// ==========================================================================
// บทที่ 1: อ่าน git log --graph แล้วแยก "ส่วนกราฟ" ออกจากข้อมูล commit
// ==========================================================================
async function load($: EngineInterface, extra: string[]): Promise<string | undefined> {
  const r = await $.process.run(['git', 'log', '--graph', '--all', '--date=relative', `--format=${SEP}%h${SEP}%D${SEP}%s${SEP}%an${SEP}%ad`, ...extra], { timeoutMs: 30_000 }).catch(() => undefined)
  if (!r || r.exitCode !== 0) return r ? r.stderr.trim().split('\n')[0] : 'ไม่พบคำสั่ง git'
  lastArgs = extra
  rows = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [graph = '', hash = '', refs = '', subject = '', author = '', when = ''] = line.split(SEP)
      return { graph: graph.replace(/\s+$/, ''), hash, refs: refs ? refs.split(', ') : [], subject, author, when: when.replace(/ ago$/, '') }
    })
  return undefined
}

// สีของตัวอักษรกราฟตามคอลัมน์ (เลนเดียวกัน = สีเดียวกันตลอดทั้งกราฟ)
function laneColor(col: number): string {
  return LANE_COLORS[Math.floor(col / 2) % LANE_COLORS.length] ?? '#90a4ae'
}

function refColor(ref: string): string {
  if (ref.startsWith('HEAD')) return '#66bb6a'
  if (ref.startsWith('tag:')) return '#ffca28'
  if (ref.includes('/')) return '#ab47bc'
  return '#42a5f5'
}

function plain(r: Row): string {
  return `${r.graph} ${r.hash}${r.refs.length ? ` (${r.refs.join(', ')})` : ''} ${r.subject}${r.author ? ` · ${r.author} · ${r.when}` : ''}`.trimEnd()
}

// ==========================================================================
// บทที่ 2: สรุป branch - ใช้ rev-list --left-right --count เทียบกับ branch หลัก
// ==========================================================================
async function branches($: EngineInterface): Promise<string> {
  const head = await $.process.run(['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { timeoutMs: 10_000 }).catch(() => undefined)
  let main = head?.exitCode === 0 ? head.stdout.trim().replace(/^origin\//, '') : ''
  const list = await $.process.run(['git', 'for-each-ref', '--sort=-committerdate', '--format=%(refname:short)|%(committerdate:relative)|%(subject)', 'refs/heads'], { timeoutMs: 15_000 }).catch(() => undefined)
  if (!list || list.exitCode !== 0) return '❌ โฟลเดอร์นี้ไม่ใช่ git repo'
  const names = list.stdout.split('\n').filter(Boolean).map(l => l.split('|'))
  if (!main) main = names.find(n => n[0] === 'main' || n[0] === 'master')?.[0] ?? names[0]?.[0] ?? 'main'
  const out: string[] = [`🌿 branch ทั้งหมด ${names.length} (เทียบกับ ${main})`]
  for (const [name = '', when = '', subject = ''] of names.slice(0, 25)) {
    const c = await $.process.run(['git', 'rev-list', '--left-right', '--count', `${main}...${name}`], { timeoutMs: 10_000 }).catch(() => undefined)
    const [behind = '0', ahead = '0'] = c?.stdout.trim().split(/\s+/) ?? []
    const state = name === main ? '⭐ หลัก' : ahead === '0' ? '✅ merge แล้ว' : `↑${ahead} ↓${behind}`
    out.push(`  ${name.padEnd(28)} ${state.padEnd(14)} ${when.replace(/ ago$/, '').padEnd(14)} ${subject.slice(0, 40)}`)
  }
  return out.join('\n')
}

async function refresh($: EngineInterface): Promise<void> {
  if (rows.length === 0) return
  await load($, lastArgs)
  $.ui.invalidate('ui.render')
}

const HELP = `🌳 Git Graph TH (Mod 76)
========================================
/gitgraph [จำนวน]       กราฟ commit ทุก branch (ค่าเริ่มต้น 40)
/gitgraph branch        สรุป branch: ล้ำหน้า/ตามหลัง/merge แล้ว
/gitgraph file <path>   เฉพาะ commit ที่แตะไฟล์นั้น`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    rows = []
    await $.command.register({ name: 'gitgraph', description: 'กราฟ git สีสวย ทุก branch + สรุป branch (/gitgraph help)', argumentHint: '[จำนวน]|branch|file <path>' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: วาด - ตัวอักษรกราฟแต่ละคอลัมน์ได้สีของเลนนั้น
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (rows.length === 0) return <Text dimColor>/gitgraph</Text>
    return (
      <Box flexDirection="column">
        <Text dimColor>{title}</Text>
        {rows.map(r => (
          <Text wrap="truncate-end">
            {[...r.graph].map((ch, i) => (ch === ' ' ? ' ' : <Text color={ch === '*' ? '#ffffff' : laneColor(i)}>{ch === '*' ? '●' : ch}</Text>))}
            {r.hash ? <Text color="#ffd54f">{` ${r.hash}`}</Text> : null}
            {r.refs.map(ref => (
              <Text color="#000000" backgroundColor={refColor(ref)}>{` ${ref.replace('HEAD -> ', '➜ ').replace('tag: ', '🏷 ')} `}</Text>
            ))}
            {r.subject ? ` ${r.subject}` : ''}
            {r.author ? <Text dimColor>{` · ${r.author} · ${r.when}`}</Text> : null}
          </Text>
        ))}
      </Box>
    )
  })

  // Claude เปลี่ยนประวัติ git → วาดใหม่ให้เอง
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (/\bgit\s+(?:commit|merge|rebase|checkout|switch|reset|cherry-pick|revert|tag|branch|pull|fetch|stash)\b/.test(e.command)) await refresh($)
    return r
  })

  on('command.run', { command: 'gitgraph' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'help') return { text: HELP }
    if (sub === 'branch') return { text: await branches($) }
    let extra: string[]
    if (sub === 'file') {
      const path = rest.join(' ')
      if (!path) return { text: 'วิธีใช้: /gitgraph file src/app.ts' }
      extra = ['-n', '60', '--follow', '--', path]
      title = `📄 ${path}`
    } else {
      const n = Math.max(5, Math.min(200, Number(sub) || 40))
      extra = ['-n', String(n)]
      title = `🌳 ${n} commit ล่าสุด ทุก branch`
    }
    // --follow ใช้กับ --all/--graph ร่วมกันไม่ได้ จึงตัด --all ออกในโหมดไฟล์
    const err = await load($, sub === 'file' ? extra : extra)
    if (err && sub === 'file') {
      const r2 = await $.process.run(['git', 'log', '--graph', '--date=relative', `--format=${SEP}%h${SEP}%D${SEP}%s${SEP}%an${SEP}%ad`, '-n', '60', '--', rest.join(' ')], { timeoutMs: 30_000 }).catch(() => undefined)
      if (r2?.exitCode === 0) {
        rows = r2.stdout.split('\n').filter(Boolean).map(line => {
          const [graph = '', hash = '', refs = '', subject = '', author = '', when = ''] = line.split(SEP)
          return { graph: graph.replace(/\s+$/, ''), hash, refs: refs ? refs.split(', ') : [], subject, author, when: when.replace(/ ago$/, '') }
        })
      } else return { text: `❌ ${err}` }
    } else if (err) return { text: `❌ ${err}` }
    if (rows.length === 0) return { text: '📭 ยังไม่มี commit' }
    await $.ui.open({ id: PANE, title: '🌳 Git Graph' })
    $.ui.invalidate('ui.render')
    return { text: [title, ...rows.slice(0, 25).map(plain), rows.length > 25 ? `… ดูทั้งหมดในแผง (${rows.length} แถว)` : ''].filter(Boolean).join('\n') }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. กด Enter ที่แถว commit เพื่อดู diff ของ commit นั้น
 * 2. ไฮไลต์ commit ที่ Claude ทำใน session นี้ (ดูจาก Co-Authored-By)
 * 3. วาดกราฟแบบ SVG เส้นโค้งสวยๆ บน VS Code
 */
