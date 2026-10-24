/**
 * ============================================================================
 * MOD 15: Cyber Guard TH - ยามความปลอดภัยของโปรเจกต์ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เหตุการณ์ Supply Chain Attack (event-stream, ua-parser-js) และ OWASP Top 10
 *
 * หน้าที่ของ Mod นี้:
 * 1. บล็อกคำสั่ง Bash ที่ทำลายระบบก่อนรันจริง (rm -rf /, fork bomb, mkfs, curl | sh ...)
 * 2. ถามก่อนเมื่อ Claude จะเขียน secret (API key, private key) ลงไฟล์ เสนอให้ใช้ .env แทน
 * 2.1 ถามก่อนรัน SQL ทำลายข้อมูลผ่าน psql / mysql / sqlite3 (DROP, TRUNCATE, DELETE/UPDATE ไม่มี WHERE)
 * 3. /guard scan สแกนทั้งโปรเจกต์หา secret ที่หลุด และโค้ดเสี่ยง (eval, SQL ต่อสตริง, innerHTML)
 * 4. /guard deps ตรวจ package.json: install script น่าสงสัย, ชื่อแพ็กเกจคล้ายของดัง (typosquatting)
 * 5. /guard git ตรวจว่าไฟล์ลับ (.env, *.pem) ถูก commit เข้า git หรือไม่
 * 6. เฝ้าไฟล์สำคัญ: ถ้า Claude จะแก้ไฟล์ที่เฝ้าไว้ จะเด้งเตือน
 *
 * ข้อจำกัด: ตรวจด้วย regex จึงมีทั้งจับผิดและหลุดได้ ใช้เป็นด่านแรก ไม่ใช่แทนเครื่องมือ security เต็มรูปแบบ
 */

import type { EngineInterface, FsEntry, Register } from 'claude-code'

type Severity = 'critical' | 'high' | 'medium'
type Category = 'secret' | 'code' | 'deps' | 'git'

interface Finding {
  severity: Severity
  category: Category
  title: string
  file?: string
  line?: number
  hint: string
}

const ICON: Record<Severity, string> = { critical: '🔴', high: '🟠', medium: '🟡' }
const WEIGHT: Record<Severity, number> = { critical: 10, high: 5, medium: 2 }

// ==========================================================================
// บทที่ 1: รูปแบบของ secret ที่หลุดบ่อย (ตามรูปแบบที่แต่ละเจ้ากำหนด)
// ==========================================================================
const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'AWS Access Key', regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub Token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API Key', regex: /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'Stripe Live Key', regex: /\b(sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack Token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'LINE Channel Token', regex: /\b[A-Za-z0-9+/]{150,}={0,2}(?=["'\s]|$)/ },
  { name: 'Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
]

// ==========================================================================
// บทที่ 2: โค้ดที่เสี่ยงโดนโจมตี (injection) หรือดูเหมือนมัลแวร์
// ==========================================================================
const CODE_PATTERNS: { name: string; regex: RegExp; severity: Severity; hint: string }[] = [
  { name: 'eval() / new Function()', regex: /\beval\s*\(|new\s+Function\s*\(/, severity: 'high', hint: 'รันข้อความเป็นโค้ด ถ้าข้อความมาจากผู้ใช้ = Code Injection' },
  { name: 'SQL ต่อสตริง', regex: /(SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*["'`]\s*\+\s*\w|(SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*\$\{/i, severity: 'high', hint: 'ใช้ parameterized query (?, $1) แทนการต่อสตริง' },
  { name: 'innerHTML จากตัวแปร', regex: /\.innerHTML\s*=\s*[^'"`\s]/, severity: 'medium', hint: 'เสี่ยง XSS ใช้ textContent หรือ sanitize ก่อน' },
  { name: 'exec() ประกอบคำสั่งจากตัวแปร', regex: /\bexec(Sync)?\s*\(\s*(`[^`]*\$\{|[^'"`)]*\+)/, severity: 'high', hint: 'เสี่ยง Command Injection ใช้ execFile/spawn ส่ง argument แยก' },
  { name: 'ดาวน์โหลดแล้วรันทันที', regex: /(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba)?sh\b/, severity: 'critical', hint: 'ดาวน์โหลดสคริปต์มารันโดยไม่ตรวจ อาจเป็นมัลแวร์' },
  { name: 'Reverse shell', regex: /\bnc\s+(-\w+\s+)*-e\s|bash\s+-i\s*>&\s*\/dev\/tcp\//, severity: 'critical', hint: 'รูปแบบที่ใช้เปิดช่องให้คนอื่นควบคุมเครื่อง' },
  { name: 'Crypto miner', regex: /\b(coinhive|cryptonight|xmrig|stratum\+tcp)\b/i, severity: 'critical', hint: 'พบคำที่เกี่ยวกับโปรแกรมขุดเหรียญ' },
]

// ==========================================================================
// บทที่ 3: คำสั่ง Bash ที่ต้องบล็อกก่อนรัน (ทำลายระบบ ย้อนกลับไม่ได้)
// ==========================================================================
const DANGEROUS_COMMANDS: { name: string; regex: RegExp }[] = [
  { name: 'ลบทั้งเครื่องหรือทั้ง home', regex: /\brm\s+(-\w*[rf]\w*\s+)+(--no-preserve-root\s+)?(\/|~|\$HOME|\/\*|~\/\*|[A-Za-z]:\\?)(\s|$)/ },
  { name: 'Fork bomb', regex: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { name: 'ฟอร์แมตดิสก์', regex: /\bmkfs(\.\w+)?\s|\bformat\s+[A-Za-z]:/i },
  { name: 'เขียนทับดิสก์ตรงๆ', regex: /\bdd\s+[^\n]*of=\/dev\/(sd|nvme|disk|hd)|>\s*\/dev\/(sd|nvme|disk)[a-z0-9]*/ },
  { name: 'ดาวน์โหลดแล้วรันทันที', regex: /(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b|\biex\s*\(\s*(irm|iwr|Invoke-WebRequest|New-Object\s+Net\.WebClient)/i },
  { name: 'เปิดสิทธิ์ทั้งเครื่อง', regex: /\bchmod\s+-R\s+0?777\s+\/(\s|$)/ },
]

function dangerOf(command: string): string | undefined {
  return DANGEROUS_COMMANDS.find(d => d.regex.test(command))?.name
}

// SQL ที่ทำลายข้อมูล ส่งผ่าน client ฐานข้อมูล (psql, mysql, sqlite3 ...) - ถามก่อน ไม่บล็อกทันที
const SQL_CLIENT = /\b(?:psql|mysql|mariadb|sqlite3|sqlcmd|cockroach\s+sql|clickhouse-client|duckdb)\b|\b(?:prisma|knex|sequelize)\b.*\b(?:db\s+execute|raw)\b/i

function sqlRiskOf(command: string): string | undefined {
  if (!SQL_CLIENT.test(command)) return undefined
  const sql = command.replace(/\s+/g, ' ')
  if (/\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i.test(sql)) return 'DROP ลบตาราง/ฐานข้อมูลทั้งก้อน'
  if (/\bTRUNCATE\b/i.test(sql)) return 'TRUNCATE ลบข้อมูลทุกแถว'
  // DELETE/UPDATE ที่ไม่มี WHERE ตามหลังในประโยคเดียวกัน
  for (const m of sql.matchAll(/\b(DELETE\s+FROM|UPDATE)\b([^;"']*)/gi)) {
    if (!/\bWHERE\b/i.test(m[2] ?? '')) return `${(m[1] ?? '').toUpperCase()} ไม่มี WHERE = ทุกแถว`
  }
  return undefined
}

// ซ่อนค่า secret เวลาแสดง: เหลือ 4 ตัวแรก
function mask(value: string): string {
  return value.length <= 8 ? '****' : `${value.slice(0, 4)}…(${value.length} ตัว)`
}

function secretsIn(text: string): { name: string; value: string; line: number }[] {
  const found: { name: string; value: string; line: number }[] = []
  text.split('\n').forEach((line, i) => {
    for (const p of SECRET_PATTERNS) {
      const m = p.regex.exec(line)
      // LINE token pattern กว้างมาก นับเฉพาะบรรทัดที่มีคำว่า token/secret/key
      if (m && (p.name !== 'LINE Channel Token' || /token|secret|key/i.test(line))) found.push({ name: p.name, value: m[0], line: i + 1 })
    }
  })
  return found
}

// ==========================================================================
// บทที่ 4: ตรวจ package.json - install script และ typosquatting
// ==========================================================================
const POPULAR = ['react', 'react-dom', 'lodash', 'express', 'axios', 'moment', 'vue', 'next', 'typescript', 'webpack', 'chalk', 'commander', 'dotenv', 'jquery', 'request', 'cross-env', 'eslint', 'prettier', 'mongoose', 'socket.io', 'electron', 'discord.js', 'colors', 'ua-parser-js', 'event-stream', 'node-fetch', 'uuid', 'debug', 'body-parser', 'cors']

// ระยะห่างของคำ (Levenshtein): ต่างกันกี่ตัวอักษร
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) (dp[0] as number[])[j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = dp[i] as number[]
      const prev = dp[i - 1] as number[]
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length]?.[b.length] ?? 0
}

function checkPackageJson(text: string, file: string): Finding[] {
  const findings: Finding[] = []
  let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(text)
  } catch {
    return [{ severity: 'medium', category: 'deps', title: 'package.json อ่านไม่ได้ (JSON ผิดรูปแบบ)', file, hint: 'ตรวจ syntax ของไฟล์' }]
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    const script = pkg.scripts?.[hook]
    if (script && /curl|wget|node\s+-e|powershell|\|\s*(ba)?sh|base64|https?:\/\//i.test(script)) {
      findings.push({ severity: 'critical', category: 'deps', title: `install script น่าสงสัย (${hook}): ${script.slice(0, 80)}`, file, hint: 'สคริปต์นี้รันเองตอน npm install แบบที่ event-stream ถูกโจมตี' })
    }
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const [name, version] of Object.entries(deps)) {
    const lookalike = POPULAR.find(p => p !== name && distance(p, name) === 1 && name.length >= 4)
    if (lookalike) findings.push({ severity: 'high', category: 'deps', title: `"${name}" ชื่อคล้าย "${lookalike}"`, file, hint: 'อาจเป็น typosquatting ตรวจว่าตั้งใจใช้แพ็กเกจนี้จริงไหม' })
    if (/^(git\+|github:|https?:)/.test(version)) findings.push({ severity: 'medium', category: 'deps', title: `"${name}" ติดตั้งจาก ${version.slice(0, 60)}`, file, hint: 'ติดตั้งจาก git/URL ตรงๆ ไม่ผ่าน npm registry ตรวจแหล่งที่มา' })
  }
  return findings
}

// ==========================================================================
// บทที่ 5: เดินสแกนไฟล์ทั้งโปรเจกต์
// ==========================================================================
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '.venv', 'venv', '__pycache__', 'coverage'])
const TEXT_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|go|java|cs|sh|ps1|env|json|ya?ml|toml|ini|cfg|conf|txt|md|html|vue|svelte|sql|tf)$|^\.env/i
const MAX_FILES = 2000

let projectRoot = ''
let findings: Finding[] = []
let lastScan = { files: 0, at: 0 }
let watched: string[] = []
let isBashGuardOn = true

function sep(): string {
  return projectRoot.includes('\\') ? '\\' : '/'
}

function relative(path: string): string {
  return path.toLowerCase().startsWith(projectRoot.toLowerCase()) ? path.slice(projectRoot.length + 1) : path
}

async function scan($: EngineInterface, root: string, only?: Category): Promise<void> {
  const queue = [root]
  let files = 0
  const found: Finding[] = []
  while (queue.length > 0 && files < MAX_FILES) {
    const dir = queue.shift() ?? root
    let entries: FsEntry[]
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = `${dir}${sep()}${entry.name}`
      if (entry.kind === 'dir') {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path)
        continue
      }
      if (!TEXT_FILE.test(entry.name) || entry.size > 1024 * 1024) continue
      files++
      const text = await $.fs.read(path).catch(() => '')
      const file = relative(path)
      if (!only || only === 'secret') {
        for (const s of secretsIn(text)) found.push({ severity: 'critical', category: 'secret', title: `${s.name}: ${mask(s.value)}`, file, line: s.line, hint: 'ย้ายไปไว้ใน env และ revoke key นี้ทันที (ถือว่าหลุดแล้ว)' })
      }
      if ((!only || only === 'code') && !/\.(md|txt|json)$/i.test(entry.name)) {
        text.split('\n').forEach((line, i) => {
          for (const p of CODE_PATTERNS) if (p.regex.test(line)) found.push({ severity: p.severity, category: 'code', title: p.name, file, line: i + 1, hint: p.hint })
        })
      }
      if ((!only || only === 'deps') && entry.name === 'package.json') found.push(...checkPackageJson(text, file))
    }
  }
  findings = [...findings.filter(f => only && f.category !== only), ...found]
  lastScan = { files, at: await $.clock.now() }
}

// ==========================================================================
// บทที่ 6: ตรวจ git - ไฟล์ลับถูก commit ไปแล้วหรือยัง
// ==========================================================================
async function checkGit($: EngineInterface): Promise<string> {
  const run = await $.process.run(['git', 'ls-files'], { timeoutMs: 15_000 }).catch(() => undefined)
  if (!run || run.exitCode !== 0) return '⚪ ไม่ใช่ git repo (ข้ามการตรวจ git)'
  const tracked = run.stdout.split('\n').filter(f => /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519|ecdsa)$/.test(f) && !/\.env\.(example|sample|template)$/.test(f))
  findings = findings.filter(f => f.category !== 'git')
  for (const f of tracked) findings.push({ severity: 'critical', category: 'git', title: `ไฟล์ลับอยู่ใน git: ${f}`, file: f, hint: 'git rm --cached แล้วเพิ่มใน .gitignore และ revoke ทุก key ในไฟล์ (ถ้า push ไปแล้ว ประวัติยังมีอยู่)' })
  const ignore = await $.fs.read(`${projectRoot}${sep()}.gitignore`).catch(() => '')
  if (!/^\s*\.env/m.test(ignore)) findings.push({ severity: 'medium', category: 'git', title: '.gitignore ไม่มี .env', file: '.gitignore', hint: 'เพิ่มบรรทัด .env กันเผลอ commit' })
  return tracked.length ? `🔴 พบไฟล์ลับใน git ${tracked.length} ไฟล์` : '✅ ไม่พบไฟล์ลับใน git'
}

// ==========================================================================
// บทที่ 7: Risk Score และรายงาน
// ==========================================================================
function riskLevel(score: number): string {
  if (score >= 20) return '🔴 CRITICAL'
  if (score >= 10) return '🟠 HIGH'
  if (score >= 5) return '🟡 MEDIUM'
  return '✅ SAFE'
}

function report(list: Finding[], title: string): string {
  const score = list.reduce((s, f) => s + WEIGHT[f.severity], 0)
  const lines = [`🛡️ ${title}`, '----------------------------------------', `${riskLevel(score)} | Risk Score ${score} | สแกน ${lastScan.files} ไฟล์ | พบ ${list.length} ปัญหา`]
  for (const sev of ['critical', 'high', 'medium'] as const) {
    const group = list.filter(f => f.severity === sev)
    if (group.length === 0) continue
    lines.push('', `${ICON[sev]} ${sev.toUpperCase()} (${group.length}):`)
    for (const f of group.slice(0, 15)) {
      lines.push(`  • ${f.title}${f.file ? `  (${f.file}${f.line ? `:${f.line}` : ''})` : ''}`, `    💡 ${f.hint}`)
    }
    if (group.length > 15) lines.push(`  ... และอีก ${group.length - 15} รายการ (/guard export ดูทั้งหมด)`)
  }
  if (list.length === 0) lines.push('', '✅ ไม่พบปัญหา')
  return lines.join('\n')
}

const HELP = `🛡️ Cyber Guard TH (Mod 15)
========================================
/guard scan [path]     สแกนทั้งหมด (secret + โค้ดเสี่ยง + package.json)
/guard secrets         สแกนหา secret อย่างเดียว
/guard code            สแกนหาโค้ดเสี่ยงอย่างเดียว
/guard deps            ตรวจ package.json
/guard git             ตรวจไฟล์ลับใน git และ .gitignore
/guard report | critical | export | clear
/guard watch <ไฟล์> | unwatch <ไฟล์> | watch   เฝ้าไฟล์สำคัญ
/guard bash on|off     เปิด/ปิดการบล็อกคำสั่ง Bash อันตราย + ถามก่อนรัน SQL ทำลายข้อมูล (ค่าเริ่มต้น: เปิด)
/guard test <คำสั่ง>   ลองดูว่าคำสั่งนี้จะถูกบล็อกไหม (ไม่รันจริง)`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd.replace(/[\\/]$/, '')
    findings = []
    const savedWatch = await $.store.get('watched')
    watched = Array.isArray(savedWatch) ? (savedWatch as string[]) : []
    isBashGuardOn = (await $.store.get('bashGuard')) !== false
    await $.command.register({ name: 'guard', description: 'ยามความปลอดภัย: สแกน secret โค้ดเสี่ยง และบล็อกคำสั่งอันตราย (/guard help)', argumentHint: 'scan|secrets|deps|git|report|watch|bash' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 8: ด่านกั้นก่อนรัน Bash - ตัดสินก่อน next ถ้าอันตรายตอบ { deny } เลย
  // ==========================================================================
  // .catch: ถ้าตัวตรวจพังเองก่อนเรียก next ให้ปฏิเสธไว้ก่อน (ปลอดภัยกว่าปล่อยผ่าน)
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const danger = isBashGuardOn ? dangerOf(e.command) : undefined
    if (danger) {
      $.ui.toast(`🛡️ บล็อกคำสั่งอันตราย: ${danger}`)
      return { deny: `${$.plugin.name} blocked this command (${danger}). Ask the user to run it themselves if it is really intended.` }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its command check failed, so the command was not run.` }))

  // SQL อันตราย: ถามผ่านหน้าต่างของ Claude Code ก่อน (ไม่มีคนตอบ = ไม่รัน)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const risk = isBashGuardOn ? sqlRiskOf(e.command) : undefined
    if (!risk) return next(e)
    const answer = await $.ui.ask(`🗄️ Claude จะรัน SQL ที่ ${risk} ยืนยันไหม?`, { header: 'SQL Guard', options: ['รันเลย', 'ยกเลิก'] }).catch(() => '')
    if (answer === 'รันเลย') return next(e)
    return { deny: `${$.plugin.name}: SQL นี้ (${risk}) ต้องให้ผู้ใช้ยืนยันก่อน และผู้ใช้ไม่ได้ยืนยัน อย่าลองวิธีอื่นที่ลบข้อมูลแบบเดียวกัน ให้ถามผู้ใช้หรือเพิ่ม WHERE ที่เจาะจง` }
  })

  // ==========================================================================
  // บทที่ 9: ถามก่อนเขียน secret ลงไฟล์ และเตือนเมื่อแตะไฟล์ที่เฝ้าไว้
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const target = e.tool === 'Write' || e.tool === 'Edit' ? e.file_path : undefined
    if (!target) return next(e)

    const rel = relative(target)
    if (watched.some(w => rel === w || rel.startsWith(w.replace(/[\\/]$/, '') + sep()))) {
      $.ui.toast(`👀 Claude กำลังแก้ไฟล์ที่เฝ้าไว้: ${rel}`)
    }

    const written = e.tool === 'Write' ? e.content : e.tool === 'Edit' ? e.new_string : ''
    const secrets = /(^|[\\/])\.env(\.|$)/.test(target) ? [] : secretsIn(written)
    if (secrets.length > 0) {
      // ถามก่อนเขียน: ถ้าไม่มีใครตอบ (เช่น claude -p) ปล่อยเขียนแล้วเตือนแบบเดิม
      const answer = await $.ui
        .ask(`🥺 อุ๊ยๆ Claude จะเขียน ${secrets[0]?.name} ลงใน ${rel} ตรงๆ ให้ย้ายไปใช้ .env แทนไหม?`, { header: 'Secret', options: ['ให้ใช้ .env แทน (แนะนำ)', 'เขียนไปเลย (เป็นค่าตัวอย่าง/ทดสอบ)'] })
        .catch(() => '')
      if (answer.startsWith('ให้ใช้')) {
        return { deny: `${$.plugin.name}: ผู้ใช้ไม่ให้เขียน ${secrets.map(s => s.name).join(', ')} ลงในโค้ด ให้อ่านค่าจาก environment variable แทน (เช่น process.env.X / os.environ["X"]) แล้วใส่ค่าจริงในไฟล์ .env ที่อยู่ใน .gitignore จากนั้นเขียนไฟล์นี้ใหม่` }
      }
      if (answer) return next(e)
    }

    const ran = await next(e)
    if (secrets.length > 0 && ran.deny === undefined && !ran.isError) {
      $.ui.toast(`🔑 พบ ${secrets[0]?.name} ถูกเขียนลง ${rel} ควรย้ายไปไว้ใน .env`)
      const note = `[cyber-guard-th] ${rel} now contains what looks like a ${secrets.map(s => s.name).join(', ')}. Move it to an environment variable or a git-ignored .env file instead of source code.`
      return { ...ran, context: [...(ran.context ?? []), note] }
    }
    return ran
  })

  on('command.run', { command: 'guard' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    const target = arg && arg !== '.' ? (/^([A-Za-z]:|[\\/])/.test(arg) ? arg : `${projectRoot}${sep()}${arg}`) : projectRoot

    switch (sub) {
      case 'scan': {
        const stat = await $.fs.stat(target).catch(() => undefined)
        if (!stat) return { text: `❌ ไม่พบ ${arg}` }
        if (stat.kind === 'file') {
          const text = await $.fs.read(target)
          const file = relative(target)
          findings = [
            ...secretsIn(text).map(s => ({ severity: 'critical' as const, category: 'secret' as const, title: `${s.name}: ${mask(s.value)}`, file, line: s.line, hint: 'ย้ายไปไว้ใน env และ revoke key นี้' })),
            ...text.split('\n').flatMap((line, i) => CODE_PATTERNS.filter(p => p.regex.test(line)).map(p => ({ severity: p.severity, category: 'code' as const, title: p.name, file, line: i + 1, hint: p.hint }))),
          ]
          lastScan = { files: 1, at: await $.clock.now() }
        } else {
          findings = []
          await scan($, target)
          await checkGit($)
        }
        return { text: report(findings, `Cyber Guard รายงาน: ${relative(target) || '.'}`) }
      }
      case 'secrets':
      case 'code':
      case 'deps': {
        const category: Category = sub === 'secrets' ? 'secret' : sub
        await scan($, target, category)
        return { text: report(findings.filter(f => f.category === category), `ผลสแกน ${sub}`) }
      }
      case 'git':
        return { text: `${await checkGit($)}\n\n${report(findings.filter(f => f.category === 'git'), 'ผลตรวจ git')}` }
      case 'report':
        return { text: lastScan.at ? report(findings, 'Cyber Guard รายงานล่าสุด') : 'ยังไม่ได้สแกน ลอง /guard scan' }
      case 'critical':
        return { text: report(findings.filter(f => f.severity === 'critical'), 'เฉพาะ CRITICAL (ต้องแก้ทันที)') }
      case 'export': {
        const path = `${projectRoot}${sep()}cyber-guard-report.json`
        await $.fs.write(path, JSON.stringify({ scannedAt: new Date(lastScan.at).toISOString(), files: lastScan.files, findings }, null, 2) + '\n')
        return { text: `💾 บันทึกแล้ว: ${path} (ค่า secret ถูกซ่อนไว้แล้ว)` }
      }
      case 'clear':
        findings = []
        lastScan = { files: 0, at: 0 }
        return { text: '🧹 ล้างรายงานแล้ว' }
      case 'watch':
        if (!arg) return { text: watched.length ? ['👀 ไฟล์ที่เฝ้าอยู่', ...watched.map(w => `  ${w}`)].join('\n') : 'ยังไม่ได้เฝ้าไฟล์ไหน (/guard watch .env)' }
        watched = [...new Set([...watched, arg])]
        await $.store.set('watched', watched)
        return { text: `👀 เฝ้า ${arg} แล้ว ถ้า Claude จะแก้จะเด้งเตือน` }
      case 'unwatch':
        watched = watched.filter(w => w !== arg)
        await $.store.set('watched', watched)
        return { text: `🙈 เลิกเฝ้า ${arg} แล้ว` }
      case 'bash':
        if (arg !== 'on' && arg !== 'off') return { text: `การบล็อกคำสั่ง Bash อันตราย: ${isBashGuardOn ? 'เปิด' : 'ปิด'} (/guard bash on|off)` }
        isBashGuardOn = arg === 'on'
        await $.store.set('bashGuard', isBashGuardOn)
        return { text: isBashGuardOn ? '🛡️ เปิดการบล็อกคำสั่งอันตรายแล้ว' : '⚠️ ปิดการบล็อกคำสั่งอันตรายแล้ว' }
      case 'test': {
        const danger = dangerOf(arg)
        const sqlRisk = sqlRiskOf(arg)
        return { text: danger ? `🔴 จะถูกบล็อก: ${danger}` : sqlRisk ? `🟠 จะถามยืนยันก่อน: ${sqlRisk}` : '✅ ไม่ถูกบล็อก (แต่ Claude Code ยังถามอนุญาตตามปกติ)' }
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
 * 1. ตรวจช่องโหว่ของ dependency จริงด้วย $.process.run(['npm', 'audit', '--json'])
 * 2. สแกนประวัติ git ทั้งหมดหา secret ที่เคย commit ด้วย git log -p (ไฟล์ลบไปแล้วก็ยังอยู่ในประวัติ)
 * 3. ตรวจ SQL ใน migration file ที่ Claude เขียนด้วย (ไม่ใช่แค่คำสั่ง Bash)
 */
