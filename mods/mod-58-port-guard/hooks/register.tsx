/**
 * ============================================================================
 * MOD 58: Port Guard TH - ยามเฝ้าพอร์ต (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: "ทำไมเว็บเข้าไม่ได้... อ้าว dev server ตายไปตั้งแต่เมื่อไหร่"
 *
 * หน้าที่ของ Mod นี้:
 * 1. ทุก 30 วินาที ดูว่าพอร์ตที่เฝ้าไว้ถูกโปรแกรมไหนใช้อยู่ (netstat / lsof / ss)
 * 2. เด้งเตือนเมื่อ: server ที่เคยรันอยู่หายไป (ตาย), มีโปรแกรมอื่นมายึดพอร์ตแทน,
 *    และ (ถ้าเปิด) เมื่อมี server ใหม่เริ่มใช้พอร์ต
 * 3. ก่อน Claude รันคำสั่งเปิด server (npm run dev, vite, next dev ...) บนพอร์ตที่ไม่ว่าง
 *    เตือนทันที และบอก Claude ว่าพอร์ตนั้นมีโปรแกรมไหนใช้อยู่
 *
 * ปิดโปรแกรมที่ยึดพอร์ตใช้ Mod 18 (/pain kill <port>)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Holder {
  pid: number
  name: string
}

const DEFAULT_PORTS: Record<number, string> = { 3000: 'dev server', 5173: 'Vite', 8080: 'web', 8000: 'Python/Django', 4200: 'Angular', 5432: 'PostgreSQL', 3306: 'MySQL', 6379: 'Redis', 27017: 'MongoDB' }

let ports: Record<number, string> = { ...DEFAULT_PORTS }
let enabled = true
let announceStart = false
let snapshot = new Map<number, Holder>()
let ticker: Timer | undefined
let isWindows = false
let checkedAt = 0

// ==========================================================================
// บทที่ 1: อ่านพอร์ตที่ถูกฟังอยู่ทั้งเครื่อง (port -> pid)
// ==========================================================================
async function listening($: EngineInterface): Promise<Map<number, number>> {
  const found = new Map<number, number>()
  if (isWindows) {
    const run = await $.process.run(['netstat', '-ano', '-p', 'TCP'], { timeoutMs: 15_000 }).catch(() => undefined)
    for (const line of run?.stdout.split('\n') ?? []) {
      // ไม่พึ่งคำว่า LISTENING เพราะ Windows ภาษาอื่นแปลคำนี้
      const m = /TCP\s+\S+:(\d+)\s+(?:0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)/.exec(line)
      if (m) found.set(Number(m[1]), Number(m[2]))
    }
    return found
  }
  const lsof = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN'], { timeoutMs: 15_000 }).catch(() => undefined)
  if (lsof?.exitCode === 0) {
    for (const line of lsof.stdout.split('\n').slice(1)) {
      const m = /^\S+\s+(\d+)\s.*:(\d+)\s+\(LISTEN\)/.exec(line)
      if (m) found.set(Number(m[2]), Number(m[1]))
    }
    return found
  }
  const ss = await $.process.run(['ss', '-ltnp'], { timeoutMs: 15_000 }).catch(() => undefined)
  for (const line of ss?.stdout.split('\n') ?? []) {
    const m = /:(\d+)\s+\S+.*pid=(\d+)/.exec(line)
    if (m) found.set(Number(m[1]), Number(m[2]))
  }
  return found
}

async function processName($: EngineInterface, pid: number): Promise<string> {
  const run = isWindows
    ? await $.process.run(['tasklist', '/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeoutMs: 10_000 }).catch(() => undefined)
    : await $.process.run(['ps', '-p', String(pid), '-o', 'comm='], { timeoutMs: 10_000 }).catch(() => undefined)
  const out = run?.stdout.trim() ?? ''
  return (isWindows ? /^"([^"]+)"/.exec(out)?.[1] : out.split('/').pop()) || `PID ${pid}`
}

async function scan($: EngineInterface): Promise<Map<number, Holder>> {
  const all = await listening($)
  const next = new Map<number, Holder>()
  for (const port of Object.keys(ports).map(Number)) {
    const pid = all.get(port)
    if (pid === undefined) continue
    // ชื่อโปรแกรมเดิมใช้ซ้ำได้ถ้า PID ไม่เปลี่ยน (ไม่ต้องเรียก tasklist ทุกรอบ)
    const known = snapshot.get(port)
    next.set(port, known?.pid === pid ? known : { pid, name: await processName($, pid) })
  }
  return next
}

// ==========================================================================
// บทที่ 2: เทียบกับรอบก่อน แล้วเตือนเฉพาะสิ่งที่เปลี่ยน
// ==========================================================================
async function check($: EngineInterface): Promise<void> {
  const next = await scan($)
  for (const port of Object.keys(ports).map(Number)) {
    const before = snapshot.get(port)
    const now = next.get(port)
    const label = `${port} (${ports[port]})`
    if (before && !now) $.ui.toast(`🔴 พอร์ต ${label} ว่างแล้ว: ${before.name} ที่รันอยู่หยุดทำงาน`, { timeoutMs: 15_000 })
    else if (before && now && before.pid !== now.pid) $.ui.toast(`⚠️ พอร์ต ${label} เปลี่ยนเจ้าของ: ${before.name} → ${now.name} (PID ${now.pid})`, { timeoutMs: 15_000 })
    else if (!before && now && announceStart && checkedAt) $.ui.toast(`🟢 พอร์ต ${label}: ${now.name} เริ่มใช้งาน`)
  }
  snapshot = next
  checkedAt = await $.clock.now()
}

function startWatching($: EngineInterface): void {
  ticker?.cancel()
  ticker = enabled ? $.clock.every(30_000, () => void check($)) : undefined
}

// คำสั่งที่น่าจะเปิด server + พอร์ตที่จะใช้
function serverPort(command: string): number | undefined {
  if (!/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b|\bvite\b|\bnext\s+(?:dev|start)\b|\bnuxt\s+dev\b|\bng\s+serve\b|\bmanage\.py\s+runserver\b|\buvicorn\b|\bflask\s+run\b|\bhttp\.server\b|\brails\s+s(?:erver)?\b/.test(command)) return undefined
  const explicit = /(?:--port[ =]|-p\s+|PORT=|runserver\s+(?:[\d.]+:)?|http\.server\s+)(\d{2,5})/.exec(command)?.[1]
  if (explicit) return Number(explicit)
  if (/\bvite\b|\bnpm\s+run\s+dev\b.*vite/.test(command)) return 5173
  if (/manage\.py\s+runserver|uvicorn|http\.server/.test(command)) return 8000
  if (/\bng\s+serve\b/.test(command)) return 4200
  return 3000
}

function statusText(): string {
  const rows = Object.entries(ports)
    .map(([p, label]) => {
      const h = snapshot.get(Number(p))
      return `  ${h ? '🟢' : '⚪'} ${p.padStart(5)}  ${label.padEnd(16)} ${h ? `${h.name} (PID ${h.pid})` : 'ว่าง'}`
    })
    .join('\n')
  return `🛡️ Port Guard ${enabled ? '✅ เฝ้าอยู่ (ทุก 30 วิ)' : '⏸️ ปิดอยู่'}\n${rows}\n\nปิดโปรแกรมที่ยึดพอร์ต: /pain kill <port> (Mod 18)`
}

const HELP = `🛡️ Port Guard TH (Mod 58)
========================================
/portguard                 สถานะพอร์ตที่เฝ้า (เช็คใหม่ทันที)
/portguard add <พอร์ต> [ชื่อ]  เฝ้าพอร์ตเพิ่ม เช่น /portguard add 4000 api
/portguard remove <พอร์ต>
/portguard start on|off    แจ้งเมื่อมี server ใหม่เริ่มใช้พอร์ตด้วย (ตอนนี้: START)
/portguard on|off          เปิด/ปิดการเฝ้า`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    const saved = (await $.store.get('settings')) as { ports?: Record<number, string>; enabled?: boolean; announceStart?: boolean } | undefined
    ports = saved?.ports ?? { ...DEFAULT_PORTS }
    enabled = saved?.enabled ?? true
    announceStart = saved?.announceStart ?? false
    snapshot = new Map()
    checkedAt = 0
    await $.command.register({ name: 'portguard', description: 'ยามเฝ้าพอร์ต: เตือนเมื่อ server ตายหรือพอร์ตถูกยึด (/portguard help)', argumentHint: 'add|remove <port>|start on|off|on|off' })
    // รอบแรกแค่จำสถานะ ไม่เตือน
    void scan($).then(s => {
      snapshot = s
    })
    startWatching($)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ก่อน Claude เปิด server - พอร์ตว่างไหม?
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const port = enabled ? serverPort(e.command) : undefined
    if (port === undefined) return next(e)
    const all = await listening($)
    const pid = all.get(port)
    if (pid === undefined) return next(e)
    const name = await processName($, pid)
    $.ui.toast(`⚠️ พอร์ต ${port} ถูก ${name} (PID ${pid}) ใช้อยู่แล้ว`, { timeoutMs: 12_000 })
    const r = await next(e)
    if (r.deny !== undefined) return r
    const note = `[port-guard-th] ก่อนรันคำสั่งนี้ พอร์ต ${port} ถูกใช้อยู่แล้วโดย ${name} (PID ${pid}) ถ้า server ไม่ขึ้นหรือย้ายไปพอร์ตอื่น นี่คือสาเหตุ ให้บอกผู้ใช้ และอย่าปิดโปรแกรมนั้นเองโดยไม่ถาม`
    return { ...r, context: [...(r.context ?? []), note] }
  })

  on('command.run', { command: 'portguard' }, async ($, e) => {
    const [sub = '', value = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const save = () => $.store.set('settings', { ports, enabled, announceStart })
    switch (sub) {
      case '':
        snapshot = await scan($)
        return { text: statusText() }
      case 'add': {
        const port = Number(value)
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { text: 'วิธีใช้: /portguard add 4000 api' }
        ports = { ...ports, [port]: rest.join(' ') || 'กำหนดเอง' }
        await save()
        snapshot = await scan($)
        return { text: `👀 เฝ้าพอร์ต ${port} แล้ว\n\n${statusText()}` }
      }
      case 'remove': {
        const port = Number(value)
        if (!(port in ports)) return { text: `ไม่ได้เฝ้าพอร์ต ${value}` }
        const { [port]: _, ...restPorts } = ports
        ports = restPorts
        snapshot.delete(port)
        await save()
        return { text: `เลิกเฝ้าพอร์ต ${port} แล้ว` }
      }
      case 'start':
        if (value !== 'on' && value !== 'off') return { text: 'วิธีใช้: /portguard start on|off' }
        announceStart = value === 'on'
        await save()
        return { text: announceStart ? '🟢 จะแจ้งเมื่อมี server ใหม่เริ่มใช้พอร์ตด้วย' : 'แจ้งเฉพาะ server ตายหรือพอร์ตเปลี่ยนเจ้าของ' }
      case 'on':
      case 'off':
        enabled = sub === 'on'
        await save()
        startWatching($)
        return { text: enabled ? '✅ เริ่มเฝ้าพอร์ต' : '⏸️ หยุดเฝ้าพอร์ต' }
      default:
        return { text: HELP.replace('START', announceStart ? 'เปิด' : 'ปิด') }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เมื่อ dev server ตาย เสนอให้ Claude รันใหม่ด้วยคำสั่งเดิม
 * 2. จำว่าโปรเจกต์ไหนใช้พอร์ตอะไร แล้วเฝ้าเฉพาะพอร์ตของโปรเจกต์ที่เปิดอยู่
 * 3. ส่งแจ้งเตือนไปมือถือเมื่อฐานข้อมูลหยุด (ต่อกับ Mod 22)
 */
