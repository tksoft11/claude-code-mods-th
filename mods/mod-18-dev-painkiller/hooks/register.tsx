/**
 * ============================================================================
 * MOD 18: Dev Painkiller TH - แก้ปัญหาที่ Dev เจอทุกวัน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ปัญหาจริงที่เจอทุกวัน "Port 3000 is already in use", ลืมลบ console.log, .env ไม่ครบ
 *
 * หน้าที่ของ Mod นี้:
 * 1. /pain scan สแกนทีเดียวครบ: พอร์ตที่ถูกใช้, .env, console.log, TODO, ไฟล์ใหญ่ใน git, git, cache
 * 2. /pain kill <port> ปิดโปรแกรมที่ยึดพอร์ต (แสดงชื่อโปรแกรมก่อน ต้องยืนยันด้วย confirm)
 * 3. /pain env fix สร้าง .env จาก .env.example และเพิ่ม .env ลง .gitignore
 * 4. /pain clean ลบ cache ของ build (แสดงรายการก่อน ต้องยืนยันด้วย confirm)
 * 5. /pain logs fix ให้ Claude ช่วยลบ console.log (ผ่านการอนุญาตแก้ไฟล์ตามปกติ)
 * 6. /pain deps แพ็กเกจตกรุ่น แยกตัวที่ข้ามเวอร์ชันหลัก (เช็คเองสัปดาห์ละครั้ง)
 * 7. /pain todos rank ให้ Claude จัดลำดับความสำคัญของ TODO
 *
 * หลักความปลอดภัย: คำสั่งที่ลบหรือปิดอะไร แสดงก่อนเสมอ และทำจริงเมื่อพิมพ์ confirm ต่อท้าย
 */

import type { EngineInterface, FsEntry, Register } from 'claude-code'

type Level = 'high' | 'medium' | 'info'
interface Issue {
  area: string
  level: Level
  title: string
  fix?: string
}

const ICON: Record<Level, string> = { high: '🔴', medium: '🟡', info: '🔵' }
const DEV_PORTS = [3000, 3001, 4200, 5000, 5173, 5432, 6379, 8000, 8080, 8888, 9000]
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', '.turbo'])
const CODE_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|py)$/
const CACHE_DIRS = ['node_modules/.cache', '.next/cache', '.turbo', '.parcel-cache', '.eslintcache', '.vite', '__pycache__']

let projectRoot = ''
let isWindows = false
let issues: Issue[] = []

const sep = () => (isWindows ? '\\' : '/')
const join = (...parts: string[]) => parts.join(sep()).replace(/[\\/]+/g, sep())

// ==========================================================================
// บทที่ 1: หาพอร์ตที่ถูกใช้ - Windows ใช้ netstat, macOS/Linux ใช้ lsof หรือ ss
// ==========================================================================
interface PortUse {
  port: number
  pid: number
  name: string
}

async function listeningPorts($: EngineInterface): Promise<PortUse[]> {
  const found = new Map<number, number>() // port -> pid
  if (isWindows) {
    const run = await $.process.run(['netstat', '-ano', '-p', 'TCP'])
    for (const line of run.stdout.split('\n')) {
      // ฟังอยู่ = foreign address เป็น 0.0.0.0:0 หรือ [::]:0 (ไม่พึ่งคำว่า LISTENING เพราะ Windows ภาษาอื่นแปลคำนี้)
      const m = /TCP\s+\S+:(\d+)\s+(0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)/.exec(line)
      if (m) found.set(Number(m[1]), Number(m[3]))
    }
  } else {
    const run = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN']).catch(() => undefined)
    if (run && run.exitCode === 0) {
      for (const line of run.stdout.split('\n').slice(1)) {
        const m = /^\S+\s+(\d+)\s.*:(\d+)\s+\(LISTEN\)/.exec(line)
        if (m) found.set(Number(m[2]), Number(m[1]))
      }
    } else {
      const ss = await $.process.run(['ss', '-ltnp']).catch(() => undefined)
      for (const line of ss?.stdout.split('\n') ?? []) {
        const m = /:(\d+)\s+\S+.*pid=(\d+)/.exec(line)
        if (m) found.set(Number(m[1]), Number(m[2]))
      }
    }
  }

  const result: PortUse[] = []
  for (const port of DEV_PORTS) {
    const pid = found.get(port)
    if (pid !== undefined) result.push({ port, pid, name: await processName($, pid) })
  }
  return result
}

async function processName($: EngineInterface, pid: number): Promise<string> {
  const run = isWindows
    ? await $.process.run(['tasklist', '/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).catch(() => undefined)
    : await $.process.run(['ps', '-p', String(pid), '-o', 'comm=']).catch(() => undefined)
  const out = run?.stdout.trim() ?? ''
  return (isWindows ? /^"([^"]+)"/.exec(out)?.[1] : out.split('/').pop()) || 'ไม่ทราบชื่อ'
}

// ==========================================================================
// บทที่ 2: เดินอ่านไฟล์โค้ด หา console.log / debugger / TODO
// ==========================================================================
async function walkCode($: EngineInterface, visit: (file: string, text: string) => void, limit = 1500): Promise<void> {
  const queue = [projectRoot]
  let count = 0
  while (queue.length && count < limit) {
    const dir = queue.shift() ?? projectRoot
    let entries: FsEntry[] = []
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.kind === 'dir') {
        if (!SKIP_DIRS.has(e.name)) queue.push(path)
      } else if (CODE_FILE.test(e.name) && e.size < 512 * 1024) {
        count++
        visit(path.slice(projectRoot.length + 1), await $.fs.read(path).catch(() => ''))
      }
    }
  }
}

type Hit = { file: string; line: number; text: string }

async function findPatterns($: EngineInterface, regex: RegExp): Promise<Hit[]> {
  const hits: Hit[] = []
  await walkCode($, (file, text) => {
    // ข้ามไฟล์ test และ script ที่ตั้งใจพิมพ์ออกจอ
    if (/(^|[\\/])(test|tests|__tests__|scripts?)[\\/]|\.(test|spec)\./.test(file)) return
    text.split('\n').forEach((line, i) => {
      if (regex.test(line)) hits.push({ file, line: i + 1, text: line.trim().slice(0, 80) })
    })
  })
  return hits
}

// ==========================================================================
// บทที่ 3: ตรวจ .env - เทียบชื่อตัวแปรกับ .env.example (ไม่แสดงค่า)
// ==========================================================================
function envKeys(text: string): string[] {
  return text
    .split('\n')
    .map(l => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k))
}

async function checkEnv($: EngineInterface): Promise<{ text: string; issues: Issue[] }> {
  const env = await $.fs.read(join(projectRoot, '.env')).catch(() => undefined)
  const example = (await $.fs.read(join(projectRoot, '.env.example')).catch(() => undefined)) ?? (await $.fs.read(join(projectRoot, '.env.sample')).catch(() => undefined))
  const ignore = (await $.fs.read(join(projectRoot, '.gitignore')).catch(() => '')) ?? ''
  const found: Issue[] = []
  const lines = ['🔑 .env']

  if (env === undefined) {
    lines.push(example ? '  ❌ ไม่มี .env แต่มี .env.example' : '  ⚪ ไม่มี .env และ .env.example')
    if (example) found.push({ area: 'env', level: 'high', title: 'ไม่มี .env (มี .env.example)', fix: '/pain env fix' })
  } else {
    lines.push(`  ✅ มี .env (${envKeys(env).length} ตัวแปร)`)
  }
  if (env !== undefined && example) {
    const missing = envKeys(example).filter(k => !envKeys(env).includes(k))
    lines.push(missing.length ? `  ⚠️ ขาดตัวแปรที่ .env.example มี: ${missing.join(', ')}` : '  ✅ ตัวแปรครบตาม .env.example')
    if (missing.length) found.push({ area: 'env', level: 'medium', title: `.env ขาด ${missing.join(', ')}`, fix: 'เพิ่มค่าเองใน .env' })
  }
  const ignored = /^\s*\/?\.env(\s|$|\*)/m.test(ignore)
  lines.push(ignored ? '  ✅ .gitignore มี .env' : '  ⚠️ .gitignore ไม่มี .env (เสี่ยง commit ความลับ)')
  if (!ignored) found.push({ area: 'env', level: 'high', title: '.gitignore ไม่มี .env', fix: '/pain env fix' })
  return { text: lines.join('\n'), issues: found }
}

// ==========================================================================
// บทที่ 4: ตรวจ git - ไฟล์ใหญ่, branch ที่ merge แล้ว, conflict ค้าง
// ==========================================================================
async function git($: EngineInterface, args: string[]): Promise<string | undefined> {
  const run = await $.process.run(['git', ...args], { timeoutMs: 20_000 }).catch(() => undefined)
  return run && run.exitCode === 0 ? run.stdout : undefined
}

async function checkGit($: EngineInterface): Promise<{ text: string; issues: Issue[] }> {
  const files = await git($, ['ls-files'])
  if (files === undefined) return { text: '🌿 Git: ไม่ใช่ git repo', issues: [] }
  const found: Issue[] = []
  const lines = ['🌿 Git']

  const big: string[] = []
  for (const f of files.split('\n').filter(Boolean)) {
    const st = await $.fs.stat(join(projectRoot, f)).catch(() => undefined)
    if (st && st.size > 5 * 1024 * 1024) big.push(`${f} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)
  }
  lines.push(big.length ? `  🐘 ไฟล์ใหญ่กว่า 5 MB ใน git: ${big.slice(0, 5).join(', ')}` : '  ✅ ไม่มีไฟล์ใหญ่กว่า 5 MB ใน git')
  if (big.length) found.push({ area: 'git', level: 'medium', title: `ไฟล์ใหญ่ใน git ${big.length} ไฟล์`, fix: 'ใช้ Git LFS หรือย้ายออกแล้วเพิ่มใน .gitignore' })

  const current = (await git($, ['branch', '--show-current']))?.trim() ?? ''
  const merged = (await git($, ['branch', '--merged']))?.split('\n').map(b => b.replace('*', '').trim()).filter(b => b && b !== current && !['main', 'master', 'develop'].includes(b)) ?? []
  const all = (await git($, ['branch']))?.split('\n').filter(Boolean).length ?? 0
  lines.push(`  🌿 branch ทั้งหมด ${all} อัน, merge แล้วลบได้ ${merged.length} อัน${merged.length ? `: ${merged.slice(0, 5).join(', ')}` : ''}`)
  if (merged.length >= 5) found.push({ area: 'git', level: 'info', title: `branch ที่ merge แล้ว ${merged.length} อัน`, fix: 'git branch -d <ชื่อ>' })

  const changes = (await git($, ['status', '--porcelain']))?.split('\n').filter(Boolean) ?? []
  const conflicts = changes.filter(l => /^(UU|AA|DD|AU|UA|DU|UD) /.test(l))
  lines.push(`  📝 ไฟล์ที่ยังไม่ commit ${changes.length} ไฟล์${conflicts.length ? `, 💥 conflict ค้าง ${conflicts.length} ไฟล์` : ''}`)
  if (conflicts.length) found.push({ area: 'git', level: 'high', title: `merge conflict ค้าง ${conflicts.length} ไฟล์`, fix: 'แก้ conflict แล้ว git add' })
  return { text: lines.join('\n'), issues: found }
}

// ==========================================================================
// บทที่ 5: cache ที่ลบได้อย่างปลอดภัย (build ใหม่ก็สร้างกลับมาเอง)
// ==========================================================================
async function existingCaches($: EngineInterface): Promise<string[]> {
  const result: string[] = []
  for (const c of CACHE_DIRS) if (await $.fs.exists(join(projectRoot, c))) result.push(c)
  return result
}

async function removePath($: EngineInterface, path: string): Promise<void> {
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Remove-Item -LiteralPath $env:PK_TARGET -Recurse -Force"]
    : ['sh', '-c', 'rm -rf -- "$PK_TARGET"']
  const run = await $.process.run(argv, { env: { PK_TARGET: path }, timeoutMs: 120_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `exit ${run.exitCode}`)
}

function report(): string {
  if (issues.length === 0) return '🩹 ไม่พบปัญหา 🎉 (หรือยังไม่ได้ /pain scan)'
  const lines = [`🩹 Dev Painkiller - พบ ${issues.length} ปัญหา`, '----------------------------------------']
  for (const level of ['high', 'medium', 'info'] as const) {
    for (const i of issues.filter(x => x.level === level)) lines.push(`${ICON[level]} [${i.area}] ${i.title}${i.fix ? `\n    💡 ${i.fix}` : ''}`)
  }
  return lines.join('\n')
}

// ==========================================================================
// บทที่ 5.5: แพ็กเกจที่ตกรุ่น - npm outdated (exit code 1 เมื่อมีของตกรุ่น ไม่ใช่ error)
// ==========================================================================
interface Outdated {
  name: string
  current: string
  latest: string
  major: boolean
}

async function outdated($: EngineInterface): Promise<Outdated[] | string> {
  if (!(await $.fs.exists(`${projectRoot}${sep()}package.json`))) return 'ไม่พบ package.json (ตอนนี้รองรับโปรเจกต์ Node)'
  // บน Windows npm เป็นไฟล์ .cmd ต้องเรียกผ่าน cmd /c
  const argv = isWindows ? ['cmd', '/c', 'npm', 'outdated', '--json'] : ['npm', 'outdated', '--json']
  const r = await $.process.run(argv, { timeoutMs: 120_000 }).catch(() => undefined)
  if (!r) return 'ไม่พบคำสั่ง npm'
  let data: Record<string, { current?: string; latest?: string }> = {}
  try {
    data = JSON.parse(r.stdout || '{}') as typeof data
  } catch {
    return `อ่านผล npm outdated ไม่ได้: ${r.stderr.trim().split('\n')[0] ?? ''}`
  }
  const major = (v?: string) => Number(/\d+/.exec(v ?? '')?.[0] ?? NaN)
  return Object.entries(data)
    .filter(([, v]) => v.latest && v.current !== v.latest)
    .map(([name, v]) => ({ name, current: v.current ?? '(ยังไม่ติดตั้ง)', latest: v.latest ?? '', major: major(v.latest) > major(v.current) || !v.current }))
    .sort((a, b) => Number(b.major) - Number(a.major) || a.name.localeCompare(b.name))
}

function outdatedText(list: Outdated[]): string {
  if (list.length === 0) return '✅ แพ็กเกจเป็นเวอร์ชันล่าสุดหมดแล้ว'
  const majors = list.filter(p => p.major)
  const minors = list.filter(p => !p.major)
  return [
    `📦 แพ็กเกจตกรุ่น ${list.length} ตัว`,
    ...(majors.length ? ['', `🔴 ข้ามเวอร์ชันหลัก ${majors.length} ตัว (อาจมี breaking change อ่าน changelog ก่อน)`, ...majors.map(p => `  ${p.name.padEnd(28)} ${p.current} → ${p.latest}`)] : []),
    ...(minors.length ? ['', `🟡 อัปเดตย่อย ${minors.length} ตัว (ปกติปลอดภัย: npm update)`, ...minors.slice(0, 30).map(p => `  ${p.name.padEnd(28)} ${p.current} → ${p.latest}`)] : []),
  ].join('\n')
}

const HELP = `🩹 Dev Painkiller TH (Mod 18)
========================================
/pain scan               สแกนทุกอย่าง
/pain ports              พอร์ต dev ที่ถูกใช้อยู่ และโปรแกรมที่ใช้
/pain kill <port>        ดูว่าจะปิดโปรแกรมไหน  ->  /pain kill <port> confirm  ปิดจริง
/pain env                ตรวจ .env    |  /pain env fix  สร้าง .env + เพิ่มใน .gitignore
/pain logs               หา console.log / debugger  |  /pain logs fix  ให้ Claude ช่วยลบ
/pain todos              หา TODO FIXME HACK XXX  |  /pain todos rank  ให้ Claude จัดลำดับความสำคัญ
/pain deps               แพ็กเกจตกรุ่น (เช็คเองสัปดาห์ละครั้งตอนเปิด Claude Code)
/pain git                ไฟล์ใหญ่ใน git, branch ที่ merge แล้ว, conflict
/pain clean              ดู cache ที่ลบได้  ->  /pain clean confirm  ลบจริง
/pain report             ผลสแกนล่าสุด`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd.replace(/[\\/]$/, '')
    isWindows = /^[A-Za-z]:/.test(projectRoot)
    issues = []
    await $.command.register({ name: 'pain', description: 'แก้ปัญหา Dev ทุกวัน: พอร์ตชน, .env, console.log, TODO, แพ็กเกจตกรุ่น (/pain help)', argumentHint: 'scan|ports|kill|env|logs|todos|deps|git|clean' })
    // เช็คแพ็กเกจตกรุ่นสัปดาห์ละครั้งต่อโปรเจกต์ (ไม่รอ ไม่ขวางการเริ่ม session)
    const key = `deps:${projectRoot.toLowerCase()}`
    const last = ((await $.store.get(key)) as number | undefined) ?? 0
    const now = await $.clock.now()
    if (now - last > 7 * 24 * 3600_000) {
      void outdated($).then(async list => {
        if (typeof list === 'string') return
        await $.store.set(key, now)
        const majors = list.filter(p => p.major).length
        if (list.length) $.ui.toast(`📦 มีแพ็กเกจตกรุ่น ${list.length} ตัว${majors ? ` (ข้ามเวอร์ชันหลัก ${majors})` : ''} ดู: /pain deps`, { timeoutMs: 12_000 })
      })
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 6: คำสั่ง /pain
  // ==========================================================================
  on('command.run', { command: 'pain' }, async ($, e) => {
    const [sub = 'help', arg, confirm] = e.args.trim().split(/\s+/).filter(Boolean)

    switch (sub) {
      case 'scan': {
        issues = []
        const ports = await listeningPorts($).catch(() => [])
        for (const p of ports) issues.push({ area: 'port', level: 'info', title: `พอร์ต ${p.port} ถูกใช้โดย ${p.name} (PID ${p.pid})`, fix: `/pain kill ${p.port} confirm` })
        const env = await checkEnv($)
        issues.push(...env.issues)
        const logs = await findPatterns($, /\bconsole\.log\s*\(|^\s*debugger\s*;?\s*$/)
        if (logs.length) issues.push({ area: 'code', level: 'medium', title: `console.log / debugger ${logs.length} จุด`, fix: '/pain logs แล้ว /pain logs fix' })
        const todos = await findPatterns($, /\b(TODO|FIXME|HACK|XXX)\b/)
        if (todos.length) issues.push({ area: 'code', level: 'info', title: `TODO/FIXME ${todos.length} จุด`, fix: '/pain todos' })
        const g = await checkGit($)
        issues.push(...g.issues)
        const caches = await existingCaches($)
        if (caches.length) issues.push({ area: 'cache', level: 'info', title: `มี cache ที่ลบได้: ${caches.join(', ')}`, fix: '/pain clean confirm' })
        return { text: report() }
      }
      case 'ports': {
        const ports = await listeningPorts($)
        if (ports.length === 0) return { text: `🔌 ไม่มีโปรแกรมใช้พอร์ต dev ยอดนิยม (${DEV_PORTS.join(', ')})` }
        return { text: ['🔌 พอร์ตที่ถูกใช้', ...ports.map(p => `  :${p.port}  ${p.name} (PID ${p.pid})`), '', 'ปิดด้วย /pain kill <port> confirm'].join('\n') }
      }
      case 'kill': {
        const port = Number(arg)
        if (!port) return { text: 'วิธีใช้: /pain kill 3000  (ดูก่อน)  แล้ว  /pain kill 3000 confirm  (ปิดจริง)' }
        const use = (await listeningPorts($)).find(p => p.port === port)
        if (!use) {
          if (!DEV_PORTS.includes(port)) return { text: `ℹ️ ตรวจได้เฉพาะพอร์ต ${DEV_PORTS.join(', ')}` }
          return { text: `✅ พอร์ต ${port} ว่างอยู่แล้ว` }
        }
        if (confirm !== 'confirm') return { text: `⚠️ พอร์ต ${port} ถูกใช้โดย ${use.name} (PID ${use.pid})\nถ้าแน่ใจว่าปิดได้ พิมพ์: /pain kill ${port} confirm` }
        const run = isWindows ? await $.process.run(['taskkill', '/PID', String(use.pid), '/F']) : await $.process.run(['kill', String(use.pid)])
        return { text: run.exitCode === 0 ? `✅ ปิด ${use.name} (PID ${use.pid}) แล้ว พอร์ต ${port} ว่างแล้ว` : `❌ ปิดไม่ได้: ${run.stderr.trim() || run.stdout.trim()}` }
      }
      case 'env': {
        if (arg !== 'fix') return { text: (await checkEnv($)).text }
        const done: string[] = []
        const envPath = join(projectRoot, '.env')
        if (!(await $.fs.exists(envPath))) {
          const example = (await $.fs.read(join(projectRoot, '.env.example')).catch(() => undefined)) ?? (await $.fs.read(join(projectRoot, '.env.sample')).catch(() => undefined))
          if (example !== undefined) {
            await $.fs.write(envPath, example)
            done.push('✅ สร้าง .env จาก .env.example แล้ว (อย่าลืมใส่ค่าจริง)')
          }
        }
        const ignorePath = join(projectRoot, '.gitignore')
        const ignore = (await $.fs.read(ignorePath).catch(() => '')) ?? ''
        if (!/^\s*\/?\.env(\s|$|\*)/m.test(ignore)) {
          await $.fs.write(ignorePath, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}.env\n`)
          done.push('✅ เพิ่ม .env ใน .gitignore แล้ว')
        }
        return { text: done.length ? done.join('\n') : '✅ ไม่มีอะไรต้องแก้' }
      }
      case 'logs': {
        const logs = await findPatterns($, /\bconsole\.log\s*\(|^\s*debugger\s*;?\s*$/)
        if (logs.length === 0) return { text: '✅ ไม่พบ console.log / debugger' }
        if (arg === 'fix') {
          const files = [...new Set(logs.map(l => l.file))].slice(0, 20)
          void $.prompt.submit({ text: `ช่วยลบ console.log และ debugger ที่ใช้ debug ออกจากไฟล์เหล่านี้ (เก็บ log ที่ตั้งใจให้ผู้ใช้เห็นไว้):\n${files.map(f => `- ${f}`).join('\n')}` })
          return { text: `🧹 ส่งงานให้ Claude ลบ console.log ใน ${files.length} ไฟล์แล้ว (Claude จะขออนุญาตก่อนแก้ทุกไฟล์)` }
        }
        return { text: [`🐛 console.log / debugger ${logs.length} จุด`, ...logs.slice(0, 30).map(l => `  ${l.file}:${l.line}  ${l.text}`), logs.length > 30 ? `  ... และอีก ${logs.length - 30} จุด` : '', '/pain logs fix = ให้ Claude ช่วยลบ'].filter(Boolean).join('\n') }
      }
      case 'todos': {
        const todos = await findPatterns($, /\b(TODO|FIXME|HACK|XXX)\b/)
        if (todos.length === 0) return { text: '✅ ไม่มี TODO ค้าง' }
        const lines = todos.slice(0, 80).map(t => `${t.file}:${t.line}  ${t.text}`)
        if (arg === 'rank') {
          // ให้ Haiku จัดกลุ่มตามความสำคัญ (อ่านเฉพาะบรรทัด TODO ไม่ส่งทั้งไฟล์)
          const system = 'จัดลำดับความสำคัญของ TODO/FIXME ในโค้ด ตอบเป็นภาษาไทย 3 หัวข้อ: 🔴 สูง (บั๊ก ความปลอดภัย ข้อมูลเสียหาย), 🟡 กลาง (ฟีเจอร์ค้าง ประสิทธิภาพ), 🟢 ต่ำ (ความสวยงาม refactor) แต่ละข้อคงรูป "ไฟล์:บรรทัด" ไว้ ตามด้วยเหตุผลสั้นๆ ไม่เกิน 10 คำ'
          for (const model of ['haiku', await $.session.model()]) {
            const r = await $.model.complete({ model, system, prompt: lines.join('\n'), maxTokens: 1500 }).catch(() => undefined)
            if (r?.isAnswered) return { text: `📝 TODO ${todos.length} จุด จัดลำดับโดย Claude\n\n${r.text.trim()}` }
          }
          return { text: '❌ ถาม Claude ไม่สำเร็จ' }
        }
        return { text: [`📝 TODO/FIXME ${todos.length} จุด`, ...lines.slice(0, 40).map(l => `  ${l}`), '', 'ให้ Claude จัดลำดับ: /pain todos rank'].join('\n') }
      }
      case 'deps': {
        const list = await outdated($)
        if (typeof list === 'string') return { text: `❌ ${list}` }
        await $.store.set(`deps:${projectRoot.toLowerCase()}`, await $.clock.now())
        return { text: outdatedText(list) }
      }
      case 'git':
        return { text: (await checkGit($)).text }
      case 'clean': {
        const caches = await existingCaches($)
        if (caches.length === 0) return { text: '✅ ไม่มี cache ให้ลบ' }
        if (arg !== 'confirm') return { text: `🧹 cache ที่ลบได้ (build ใหม่จะสร้างกลับมาเอง):\n${caches.map(c => `  ${c}`).join('\n')}\nลบจริงด้วย /pain clean confirm` }
        const results: string[] = []
        for (const c of caches) {
          try {
            await removePath($, join(projectRoot, c))
            results.push(`  ✅ ${c}`)
          } catch (err) {
            results.push(`  ❌ ${c}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        return { text: ['🧹 ลบ cache', ...results].join('\n') }
      }
      case 'report':
        return { text: report() }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ดัก tool.call ของ Bash: ถ้า npm run dev ล้มเหลวด้วย EADDRINUSE ให้ toast แนะนำ /pain kill
 * 2. หา dependency ที่ไม่ได้ใช้ด้วย $.process.run(['npx', 'depcheck', '--json'])
 * 3. ลบ branch ที่ merge แล้วทั้งหมด (แสดงรายการ + confirm แบบเดียวกับ /pain clean)
 */
