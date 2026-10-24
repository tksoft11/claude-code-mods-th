/**
 * ============================================================================
 * MOD 47: SQLite TH - เปิดฐานข้อมูล SQLite ดูตาราง รัน SQL ใน Claude Code (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: DB Browser for SQLite และ TablePlus
 *
 * หน้าที่ของ Mod นี้:
 * 1. เปิดไฟล์ .db / .sqlite ของจริง ดูรายชื่อตาราง จำนวนแถว และโครงสร้าง
 * 2. รัน SQL แล้วแสดงผลเป็นตารางในแชตและในแผง
 * 3. ส่งออกผลลัพธ์เป็น CSV (เปิดใน Excel ภาษาไทยไม่เพี้ยน)
 * 4. กันพลาด: DROP / DELETE หรือ UPDATE ที่ไม่มี WHERE ต้องพิมพ์ confirm ต่อท้าย
 *
 * ทำงานยังไง: เรียก Python (มี sqlite3 ในตัว) ถ้าไม่มีจะใช้โปรแกรม sqlite3
 * ส่ง SQL และ path ผ่าน env/argv เสมอ ไม่ต่อเป็นคำสั่ง shell (กันคำสั่งแทรก)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Result {
  columns: string[]
  rows: unknown[][]
  changes?: number
  truncated?: boolean
  error?: string
}

const PANE = 'sqlite-th'
const LIMIT = 200

let dbPath = ''
let runner: string[] | undefined // คำสั่ง python ที่ใช้ได้บนเครื่องนี้
let last: { sql: string; result: Result } | undefined

// ==========================================================================
// บทที่ 1: สคริปต์ Python ตัวเล็ก - รับค่าทาง env ตอบกลับเป็น JSON
// ==========================================================================
const PY = `
import json, os, sqlite3
db, sql, mode = os.environ["SQ_DB"], os.environ.get("SQ_SQL", ""), os.environ["SQ_MODE"]
limit = int(os.environ.get("SQ_LIMIT", "200"))
def cell(v):
    return "<blob %d bytes>" % len(v) if isinstance(v, (bytes, bytearray)) else v
out = {"columns": [], "rows": []}
try:
    if mode != "create" and not os.path.exists(db):
        raise Exception("not found: " + db)
    con = sqlite3.connect(db)
    if mode == "create":
        con.execute("select 1")
    elif mode == "tables":
        names = con.execute("select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name").fetchall()
        out["columns"] = ["table", "type", "rows"]
        out["rows"] = [[n, t, con.execute('select count(*) from "%s"' % n.replace('"', '""')).fetchone()[0]] for n, t in names]
    elif mode == "schema":
        cols = con.execute('pragma table_info("%s")' % sql.replace('"', '""')).fetchall()
        if not cols:
            raise Exception("no such table: " + sql)
        out["columns"] = ["column", "type", "not null", "default", "pk"]
        out["rows"] = [[c[1], c[2], "yes" if c[3] else "", c[4], c[5] or ""] for c in cols]
    else:
        cur = con.execute(sql)
        if cur.description:
            out["columns"] = [d[0] for d in cur.description]
            rows = cur.fetchmany(limit + 1)
            out["truncated"] = len(rows) > limit
            out["rows"] = [[cell(v) for v in r] for r in rows[:limit]]
        else:
            out["changes"] = con.total_changes
        con.commit()
except Exception as e:
    out["error"] = str(e)
print(json.dumps(out, default=str))
`

function parse(stdout: string): Result | undefined {
  try {
    const r = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as Result
    return Array.isArray(r.columns) ? r : undefined
  } catch {
    return undefined
  }
}

// ==========================================================================
// บทที่ 2: รัน - ลอง python แต่ละชื่อ แล้วจำตัวที่ใช้ได้ ถ้าไม่มีเลยใช้ sqlite3 CLI
// ==========================================================================
async function exec($: EngineInterface, mode: string, sql: string, limit = LIMIT): Promise<Result> {
  const env = { SQ_DB: dbPath, SQ_SQL: sql, SQ_MODE: mode, SQ_LIMIT: String(limit), PYTHONIOENCODING: 'utf-8' }
  const candidates = runner ? [runner] : [['python', '-I', '-c'], ['py', '-3', '-I', '-c'], ['python3', '-I', '-c']]
  for (const c of candidates) {
    const run = await $.process.run([...c, PY], { env, timeoutMs: 60_000 }).catch(() => undefined)
    const r = run && parse(run.stdout)
    if (r) {
      runner = c
      return { ...r, truncated: r.truncated || run.isStdoutTruncated }
    }
  }
  return execCli($, mode, sql, limit)
}

async function execCli($: EngineInterface, mode: string, sql: string, limit: number): Promise<Result> {
  if (mode !== 'create' && !(await $.fs.exists(dbPath))) return { columns: [], rows: [], error: `not found: ${dbPath}` }
  const q = (name: string) => `"${name.replace(/"/g, '""')}"`
  const s = (text: string) => `'${text.replace(/'/g, "''")}'`
  const query =
    mode === 'create' ? 'select 1' : mode === 'tables' ? "select name as \"table\", type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name" : mode === 'schema' ? `select name as "column", type, case "notnull" when 1 then 'yes' else '' end as "not null", dflt_value as "default", case pk when 0 then '' else pk end as pk from pragma_table_info(${s(sql)})` : sql
  const run = await $.process.run(['sqlite3', '-json', dbPath, query], { timeoutMs: 60_000 }).catch(() => undefined)
  if (!run) return { columns: [], rows: [], error: 'ไม่พบ Python หรือโปรแกรม sqlite3 บนเครื่องนี้' }
  if (run.exitCode !== 0) return { columns: [], rows: [], error: run.stderr.trim() || `sqlite3 exit ${run.exitCode}` }
  const objects = run.stdout.trim() ? (JSON.parse(run.stdout) as Record<string, unknown>[]) : []
  const columns = Object.keys(objects[0] ?? {})
  const rows = objects.slice(0, limit).map(o => columns.map(c => o[c]))
  // CLI ไม่บอกจำนวนแถวต่อตาราง: นับเพิ่มทีละตาราง
  if (mode === 'tables') {
    for (const row of rows) {
      const n = await $.process.run(['sqlite3', dbPath, `select count(*) from ${q(String(row[0]))}`], { timeoutMs: 30_000 }).catch(() => undefined)
      row.push(Number(n?.stdout.trim() ?? 0))
    }
    columns.push('rows')
  }
  return { columns, rows, truncated: objects.length > limit }
}

// ==========================================================================
// บทที่ 3: วาดตารางเป็นข้อความ (สระบน/ล่างของไทยไม่กินที่)
// ==========================================================================
function width(text: string): number {
  return [...text].filter(ch => !/[ัิ-ฺ็-๎]/.test(ch)).length
}

function show(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 40 ? `${s.slice(0, 39)}…` : s.replace(/\s+/g, ' ')
}

function table(r: Result, maxRows = 30): string {
  if (r.columns.length === 0) return ''
  const cells = [r.columns, ...r.rows.slice(0, maxRows).map(row => row.map(show))]
  const widths = r.columns.map((_, i) => Math.max(...cells.map(row => width(row[i] ?? ''))))
  const line = (row: string[]) => row.map((c, i) => c + ' '.repeat((widths[i] ?? 0) - width(c))).join(' │ ')
  const sep = widths.map(w => '─'.repeat(w)).join('─┼─')
  const more = r.rows.length > maxRows || r.truncated ? `\n… แสดง ${Math.min(maxRows, r.rows.length)} จาก ${r.truncated ? `มากกว่า ${r.rows.length}` : r.rows.length} แถว` : ''
  return [line(cells[0] ?? []), sep, ...cells.slice(1).map(line)].join('\n') + more
}

function csv(r: Result): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [r.columns, ...r.rows].map(row => row.map(esc).join(',')).join('\r\n') + '\r\n'
}

// ==========================================================================
// บทที่ 4: คำสั่งอันตราย - ต้องมีคำว่า confirm ต่อท้าย
// ==========================================================================
function danger(sql: string): string | undefined {
  const s = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
  if (/^drop\b/i.test(s)) return 'DROP ลบทั้งตาราง'
  if (/^(?:delete|update)\b/i.test(s) && !/\bwhere\b/i.test(s)) return `${s.split(' ')[0]?.toUpperCase()} ไม่มี WHERE = ทุกแถว`
  if (/^alter\b.*\bdrop\b/i.test(s)) return 'ALTER ... DROP ลบคอลัมน์'
  return undefined
}

async function resolvePath($: EngineInterface, p: string): Promise<string> {
  const unquoted = p.replace(/^["']|["']$/g, '')
  if (/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(unquoted)) return unquoted
  const root = (await $.session.cwd()).replace(/[\\/]$/, '')
  return `${root}${root.includes('\\') ? '\\' : '/'}${unquoted}`
}

const HELP = `🗄️ SQLite TH (Mod 47)
========================================
/sqlite open <ไฟล์.db>          เปิดฐานข้อมูล (ไม่มีไฟล์ใช้ open <ไฟล์> new)
/sqlite tables                  รายชื่อตาราง + จำนวนแถว
/sqlite schema <ตาราง>          โครงสร้างตาราง
/sqlite <SQL>                   รัน SQL เช่น /sqlite select * from users limit 10
/sqlite export <ไฟล์.csv> <SQL|ตาราง>   ส่งออก CSV
/sqlite close                   ปิด
DROP / DELETE หรือ UPDATE ไม่มี WHERE ต้องพิมพ์ confirm ต่อท้าย`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    dbPath = ((await $.store.get('db')) as string | undefined) ?? ''
    await $.command.register({ name: 'sqlite', description: 'เปิดฐานข้อมูล SQLite ดูตาราง รัน SQL ส่งออก CSV (/sqlite help)', argumentHint: 'open <ไฟล์>|tables|schema <ตาราง>|<SQL>|export' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lines = last ? table(last.result, 50).split('\n') : []
    return (
      <Box flexDirection="column">
        <Text color="#4fc3f7">🗄️ {dbPath || 'ยังไม่ได้เปิดฐานข้อมูล'}</Text>
        {last && <Text dimColor>{last.sql.slice(0, 100)}</Text>}
        {lines.map((l, i) => (
          <Text bold={i === 0}>{l}</Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'sqlite' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/).filter(Boolean)
    const need = () => (dbPath ? undefined : { text: '❌ ยังไม่ได้เปิดฐานข้อมูล: /sqlite open data.db' })
    const shown = async (sql: string, r: Result) => {
      last = { sql, result: r }
      await $.ui.open({ id: PANE, title: '🗄️ SQLite' })
      $.ui.invalidate('ui.render')
    }

    switch (sub.toLowerCase()) {
      case '':
      case 'help':
        return { text: `${HELP}\n\nตอนนี้: ${dbPath || '(ยังไม่ได้เปิด)'}` }
      case 'open': {
        const isNew = rest.at(-1) === 'new'
        const target = (isNew ? rest.slice(0, -1) : rest).join(' ')
        if (!target) return { text: 'วิธีใช้: /sqlite open data.db' }
        const path = await resolvePath($, target)
        if (!isNew && !(await $.fs.exists(path))) return { text: `❌ ไม่พบไฟล์ ${path}\nสร้างใหม่: /sqlite open ${target} new` }
        const prev = dbPath
        dbPath = path
        const r = await exec($, isNew ? 'create' : 'tables', '')
        if (r.error) {
          dbPath = prev
          return { text: `❌ เปิดไม่ได้: ${r.error}` }
        }
        await $.store.set('db', dbPath)
        if (isNew) return { text: `✨ สร้าง/เปิด ${path} แล้ว` }
        await shown('tables', r)
        return { text: `🗄️ เปิด ${path}\n\n${table(r) || '(ยังไม่มีตาราง)'}` }
      }
      case 'close':
        dbPath = ''
        last = undefined
        await $.store.delete('db')
        await $.ui.close({ id: PANE })
        return { text: '👋 ปิดฐานข้อมูลแล้ว' }
      case 'tables': {
        const missing = need()
        if (missing) return missing
        const r = await exec($, 'tables', '')
        if (r.error) return { text: `❌ ${r.error}` }
        await shown('tables', r)
        return { text: table(r) || '(ยังไม่มีตาราง)' }
      }
      case 'schema': {
        const missing = need()
        if (missing) return missing
        if (!rest[0]) return { text: 'วิธีใช้: /sqlite schema users' }
        const r = await exec($, 'schema', rest.join(' '))
        if (r.error) return { text: `❌ ${r.error}` }
        await shown(`schema ${rest.join(' ')}`, r)
        return { text: `📐 ${rest.join(' ')}\n${table(r)}` }
      }
      case 'export': {
        const missing = need()
        if (missing) return missing
        const [file, ...q] = rest
        if (!file || q.length === 0) return { text: 'วิธีใช้: /sqlite export users.csv users  หรือ  /sqlite export top.csv select * from users where age > 30' }
        const sql = q.length === 1 ? `select * from "${q[0]?.replace(/"/g, '""')}"` : q.join(' ')
        if (!/^\s*(?:select|with|pragma)\b/i.test(sql)) return { text: '❌ export ใช้ได้กับ SELECT เท่านั้น' }
        const r = await exec($, 'query', sql, 100_000)
        if (r.error) return { text: `❌ ${r.error}` }
        const out = await resolvePath($, file.endsWith('.csv') ? file : `${file}.csv`)
        await $.fs.write(out, csv(r))
        return { text: `💾 ส่งออก ${r.rows.length.toLocaleString('en-US')} แถวไปที่ ${out}${r.truncated ? '\n⚠️ ข้อมูลยาวเกินไป ได้ไม่ครบ ลองใส่ WHERE หรือ LIMIT' : ''}` }
      }
      default: {
        // ที่เหลือคือ SQL ทั้งก้อน
        const missing = need()
        if (missing) return missing
        const confirmed = /\s+confirm$/i.test(args)
        const sql = args.replace(/\s+confirm$/i, '')
        const risk = danger(sql)
        if (risk && !confirmed) return { text: `⚠️ ${risk}\nถ้าแน่ใจ พิมพ์คำสั่งเดิมแล้วต่อท้ายด้วย confirm:\n/sqlite ${sql} confirm` }
        const r = await exec($, 'query', sql)
        if (r.error) return { text: `❌ ${r.error}` }
        if (r.columns.length === 0) {
          $.ui.invalidate('ui.render')
          return { text: `✅ สำเร็จ${r.changes !== undefined ? ` (เปลี่ยนแปลง ${r.changes} แถว)` : ''}` }
        }
        await shown(sql, r)
        return { text: `${table(r)}\n(${r.rows.length}${r.truncated ? '+' : ''} แถว)` }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. นำเข้า CSV เป็นตารางใหม่ (/sqlite import data.csv)
 * 2. ให้ Claude เขียน SQL จากภาษาไทย ("ลูกค้าที่ซื้อเกิน 3 ครั้ง") ด้วย $.model.complete
 * 3. เลื่อนดูผลลัพธ์ทีละหน้าในแผง (LIMIT/OFFSET)
 */
