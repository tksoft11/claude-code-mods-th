/**
 * ============================================================================
 * MOD 77: System Monitor TH - กราฟชีพจรเครื่อง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Task Manager แท็บ Performance และ htop
 *
 * หน้าที่ของ Mod นี้:
 * 1. /sysmon - แผงกราฟ CPU และ RAM ย้อนหลัง 2 นาที (อ่านทุก 3 วินาที เฉพาะตอนแผงเปิด)
 *    สีไล่จากเขียว → เหลือง → แดงตามความหนัก
 * 2. โปรแกรมที่กินแรมมากสุด 5 อันดับ
 * 3. เตือนเมื่อ CPU เกิน 90% ติดกัน 30 วินาที หรือ RAM เกิน 90% (ตอนแผงเปิด)
 *
 * อ่านค่าจากระบบ: Windows ใช้ PowerShell (CIM), Linux อ่าน /proc ตรงๆ, macOS ใช้ top / vm_stat
 */

import type { EngineInterface, Register, Timer } from 'claude-code'
import { Grid, drawGrid, rgb } from './grid'

interface Sample {
  cpu: number
  ram: number
  ramUsedGb: number
  ramTotalGb: number
  top: { name: string; mb: number }[]
}

const PANE = 'system-monitor-th'
const HISTORY = 40 // 40 x 3 วิ = 2 นาที
let samples: Sample[] = []
let ticker: Timer | undefined
let platform: 'win' | 'linux' | 'mac' = 'linux'
let lastProc: { idle: number; total: number } | undefined
let hotSince = 0
let warned = false
let busy = false
let streaming = false

// ==========================================================================
// บทที่ 1: อ่านค่าตามระบบปฏิบัติการ
// ==========================================================================
// PowerShell เปิดครั้งแรกช้า (หลายวินาที) จึงเปิดค้างไว้ตัวเดียว ให้พิมพ์ค่าออกมาทุก 3 วินาที
const PS_LOOP = `
while ($true) {
  $cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $os = Get-CimInstance Win32_OperatingSystem
  $top = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { @{ name = $_.ProcessName; mb = [int]($_.WorkingSet64 / 1MB) } }
  $json = @{ cpu = [int]$cpu; total = [double]$os.TotalVisibleMemorySize; free = [double]$os.FreePhysicalMemory; top = @($top) } | ConvertTo-Json -Compress -Depth 3
  [Console]::Out.WriteLine($json); [Console]::Out.Flush()
  Start-Sleep -Seconds 3
}
`

function parseWindows(line: string): Sample | undefined {
  try {
    const d = JSON.parse(line) as { cpu: number; total: number; free: number; top: { name: string; mb: number }[] }
    const totalGb = d.total / 1024 / 1024
    const usedGb = (d.total - d.free) / 1024 / 1024
    return { cpu: d.cpu, ram: (usedGb / totalGb) * 100, ramUsedGb: usedGb, ramTotalGb: totalGb, top: d.top ?? [] }
  } catch {
    return undefined
  }
}

async function readLinux($: EngineInterface): Promise<Sample | undefined> {
  const stat = await $.fs.read('/proc/stat').catch(() => '')
  const mem = await $.fs.read('/proc/meminfo').catch(() => '')
  const nums = (/^cpu\s+(.+)$/m.exec(stat)?.[1] ?? '').split(/\s+/).map(Number)
  if (nums.length < 4) return undefined
  const idle = (nums[3] ?? 0) + (nums[4] ?? 0)
  const total = nums.reduce((s, n) => s + (n || 0), 0)
  const cpu = lastProc ? 100 * (1 - (idle - lastProc.idle) / Math.max(1, total - lastProc.total)) : 0
  lastProc = { idle, total }
  const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(mem)?.[1] ?? 0)
  const totalGb = kb('MemTotal') / 1024 / 1024
  const usedGb = (kb('MemTotal') - kb('MemAvailable')) / 1024 / 1024
  const ps = await $.process.run(['ps', '-eo', 'comm,rss', '--sort=-rss'], { timeoutMs: 10_000 }).catch(() => undefined)
  const top = (ps?.stdout ?? '').split('\n').slice(1, 6).map(l => /^(.*?)\s+(\d+)$/.exec(l.trim())).filter((m): m is RegExpExecArray => !!m).map(m => ({ name: m[1] ?? '', mb: Math.round(Number(m[2]) / 1024) }))
  return { cpu: Math.max(0, Math.min(100, cpu)), ram: (usedGb / Math.max(0.001, totalGb)) * 100, ramUsedGb: usedGb, ramTotalGb: totalGb, top }
}

async function readMac($: EngineInterface): Promise<Sample | undefined> {
  const t = await $.process.run(['top', '-l', '1', '-n', '5', '-o', 'mem', '-stats', 'command,mem'], { timeoutMs: 15_000 }).catch(() => undefined)
  if (!t || t.exitCode !== 0) return undefined
  const cpuIdle = Number(/CPU usage:.*?([\d.]+)% idle/.exec(t.stdout)?.[1] ?? 100)
  const used = /PhysMem: ([\d.]+)([GM]) used/.exec(t.stdout)
  const unused = /([\d.]+)([GM]) unused/.exec(t.stdout)
  const gb = (m: RegExpExecArray | null) => (m ? Number(m[1]) / (m[2] === 'M' ? 1024 : 1) : 0)
  const usedGb = gb(used)
  const totalGb = usedGb + gb(unused)
  const top = t.stdout.split('\n').slice(-6).map(l => /^(.+?)\s+([\d.]+)([GMK])\+?$/.exec(l.trim())).filter((m): m is RegExpExecArray => !!m).map(m => ({ name: m[1] ?? '', mb: Math.round(Number(m[2]) * (m[3] === 'G' ? 1024 : m[3] === 'K' ? 1 / 1024 : 1)) }))
  return { cpu: 100 - cpuIdle, ram: (usedGb / Math.max(0.001, totalGb)) * 100, ramUsedGb: usedGb, ramTotalGb: totalGb, top }
}

// Windows: อ่านทีละบรรทัดจาก PowerShell ที่เปิดค้างไว้ ออกจากลูป = ปิดโปรเซสลูกให้เอง
function startWindows($: EngineInterface): void {
  const proc = $.process.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', PS_LOOP] })
  let buf = ''
  void (async () => {
    for await (const chunk of proc) {
      if (!streaming) break
      if (chunk.stream !== 'stdout') continue
      buf += chunk.text
      let i = buf.indexOf('\n')
      while (i >= 0) {
        const s = parseWindows(buf.slice(0, i).trim())
        buf = buf.slice(i + 1)
        if (s) await record($, s)
        i = buf.indexOf('\n')
      }
    }
  })().catch(() => undefined)
}

async function sample($: EngineInterface): Promise<void> {
  if (busy) return
  busy = true
  try {
    const s = platform === 'mac' ? await readMac($) : await readLinux($)
    if (s) await record($, s)
  } finally {
    busy = false
  }
}

async function record($: EngineInterface, s: Sample): Promise<void> {
  {
    samples = [...samples, s].slice(-HISTORY)
    const now = await $.clock.now()
    if (s.cpu >= 90) hotSince ||= now
    else hotSince = 0
    if (!warned && ((hotSince && now - hotSince >= 30_000) || s.ram >= 90)) {
      warned = true
      $.ui.toast(s.ram >= 90 ? `🥵 RAM ใช้ไป ${Math.round(s.ram)}% แล้ว` : '🔥 CPU เกิน 90% มา 30 วินาทีแล้ว', { timeoutMs: 12_000 })
    }
    if (s.cpu < 70 && s.ram < 80) warned = false
    $.ui.invalidate('ui.render')
  }
}

// ==========================================================================
// บทที่ 2: กราฟพื้นที่ - บล็อกครึ่งระดับ ▁▂▃▄▅▆▇█ ให้ความละเอียดสูงกว่าจำนวนแถว
// ==========================================================================
const LEVELS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function heat(p: number): number {
  // เขียว (0%) → เหลือง (60%) → แดง (100%)
  return p < 60 ? rgb((p / 60) * 255, 200, 60) : rgb(255, 200 - ((p - 60) / 40) * 170, 60)
}

function chart(g: Grid, top: number, height: number, values: number[], color: (v: number) => number, label: string): void {
  const w = g.w - 6
  const vals = values.slice(-w)
  const offset = w - vals.length
  vals.forEach((v, i) => {
    const filled = (Math.max(0, Math.min(100, v)) / 100) * height * 8
    for (let row = 0; row < height; row++) {
      const level = Math.max(0, Math.min(8, Math.round(filled - (height - 1 - row) * 8)))
      if (level > 0) g.set(offset + i, top + row, LEVELS[level] ?? '█', color(v))
    }
  })
  g.text(w + 1, top, '100', rgb(120, 120, 140))
  g.text(w + 1, top + height - 1, '  0', rgb(120, 120, 140))
  g.text(0, top - 1, label, rgb(230, 230, 240))
}

function frame(width: number): Grid {
  const g = new Grid(Math.max(30, Math.min(70, width)), 17, rgb(14, 16, 24))
  const last = samples.at(-1)
  chart(g, 1, 6, samples.map(s => s.cpu), heat, `CPU ${last ? Math.round(last.cpu) : '-'}%`)
  chart(g, 9, 6, samples.map(s => s.ram), v => (v > 90 ? rgb(255, 80, 80) : rgb(90, 170, 255)), `RAM ${last ? `${Math.round(last.ram)}% (${last.ramUsedGb.toFixed(1)}/${last.ramTotalGb.toFixed(1)} GB)` : '-'}`)
  g.text(0, 16, 'last 2 min · every 3s', rgb(110, 110, 130))
  return g
}

function stop(): void {
  ticker?.cancel()
  ticker = undefined
  streaming = false // ลูปอ่าน PowerShell จะหลุดในรอบถัดไป แล้วโปรเซสลูกถูกปิด
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    platform = /^[A-Za-z]:/.test(e.cwd) ? 'win' : e.cwd.startsWith('/Users/') ? 'mac' : 'linux'
    await $.command.register({ name: 'sysmon', description: 'กราฟ CPU / RAM สดในแผง + โปรแกรมที่กินแรมมากสุด (/sysmon | /sysmon stop)', argumentHint: 'stop' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const top = samples.at(-1)?.top ?? []
    return (
      <Box flexDirection="column">
        {drawGrid(els, e.surface, frame(e.props.bodyColumns), 'chart', `CPU ${Math.round(samples.at(-1)?.cpu ?? 0)}% RAM ${Math.round(samples.at(-1)?.ram ?? 0)}%`) as never}
        {top.length > 0 && <Text dimColor>🧠 กินแรมมากสุด</Text>}
        {top.map(p => (
          <Text>{`  ${p.name.slice(0, 24).padEnd(24)} ${String(p.mb).padStart(6)} MB`}</Text>
        ))}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stop()
    return next(e)
  })

  on('command.run', { command: 'sysmon' }, async ($, e) => {
    if (e.args.trim() === 'stop') {
      stop()
      await $.ui.close({ id: PANE })
      return { text: '⏹️ ปิดกราฟแล้ว' }
    }
    await $.ui.open({ id: PANE, title: '💓 System Monitor' })
    if (platform === 'win') {
      if (!streaming) {
        streaming = true
        startWindows($)
      }
    } else if (!ticker) {
      await sample($)
      ticker = $.clock.every(3000, () => void sample($))
    }
    const s = samples.at(-1)
    return { text: s ? `💓 CPU ${Math.round(s.cpu)}% · RAM ${Math.round(s.ram)}% (${s.ramUsedGb.toFixed(1)}/${s.ramTotalGb.toFixed(1)} GB)\nกราฟอยู่ในแผง (/sysmon stop เพื่อปิด)` : '💓 เปิดกราฟแล้ว กำลังอ่านค่า…' }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เพิ่มกราฟดิสก์และเครือข่าย
 * 2. ปุ่มปิดโปรแกรมที่กินแรมมากสุด (ถามก่อนเสมอ)
 * 3. ใส่หมุดบนกราฟตอนที่ Claude เริ่ม/จบงาน เห็นว่างานไหนทำเครื่องหนัก
 */
