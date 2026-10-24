/**
 * ============================================================================
 * MOD 26: Network Tool TH - เครื่องมือเครือข่ายครบในคำสั่งเดียว (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ping, traceroute, nslookup, whois และ speedtest ที่ Dev/IT ใช้ทุกวัน
 *
 * หน้าที่ของ Mod นี้:
 * 1. ping / traceroute ด้วยคำสั่งของระบบ (Windows, macOS, Linux)
 * 2. DNS lookup ผ่าน DNS-over-HTTPS ของ Cloudflare (ได้ผลเหมือนกันทุกระบบ)
 * 3. WHOIS ผ่าน RDAP (มาตรฐานใหม่แทน whois): วันจดทะเบียน วันหมดอายุ ผู้รับจด
 * 4. IP สาธารณะของเรา + ISP/จังหวัด, ตรวจ HTTP header และ security header
 * 5. วัดความเร็วดาวน์โหลด, เช็คพอร์ต (ทีละไม่เกิน 10 พอร์ต), ดูสัญญาณ Wi-Fi
 * 6. /net pulse <host> - ชีพจรเครือข่าย: ping ต่อเนื่อง วาดกราฟ latency สดในแผง พร้อม min/avg/max/jitter/loss
 *
 * จรรยาบรรณ: เช็คพอร์ตเฉพาะเครื่องที่เป็นของเราหรือได้รับอนุญาตเท่านั้น
 */

import type { EngineInterface, Register } from 'claude-code'
import { Grid, drawGrid, rgb } from './grid'

let isWindows = false
let isMac = false
let history: { at: number; command: string }[] = []

// ชื่อโฮสต์/IP ที่ยอมรับ (ตัวอักษร ตัวเลข จุด ขีด และ : ของ IPv6) กันการส่งค่าแปลกๆ ให้คำสั่งระบบ
function validHost(h: string | undefined): h is string {
  return Boolean(h) && /^[A-Za-z0-9.:-]{1,253}$/.test(h ?? '') && !(h ?? '').startsWith('-')
}

async function run($: EngineInterface, argv: string[], timeoutMs = 60_000, env?: Record<string, string>): Promise<string> {
  const r = await $.process.run(argv, { timeoutMs, env })
  return (r.stdout + (r.exitCode !== 0 && r.stderr ? `\n${r.stderr}` : '')).replace(/\r/g, '').trim()
}

async function json($: EngineInterface, url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(url, { headers: { 'User-Agent': 'claude-code-network-tool-th', ...headers } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as Record<string, unknown>
}

// ==========================================================================
// บทที่ 0: ชีพจรเครือข่าย - ping ต่อเนื่องหนึ่งโปรเซส อ่านทีละบรรทัดผ่าน $.process.spawn
// ==========================================================================
const PULSE_PANE = 'network-pulse-th'
let pulse: { host: string; ms: (number | null)[]; running: boolean } | undefined

// "time=12ms" (Windows) / "time=12.3 ms" (macOS/Linux) / หมดเวลา = null (packet loss)
function parsePing(line: string): number | null | undefined {
  const t = /time[=<]([\d.]+)\s*ms/i.exec(line)
  if (t) return Number(t[1])
  if (/timed out|unreachable|100% packet loss|no answer/i.test(line)) return null
  return undefined
}

function startPulse($: EngineInterface, host: string): void {
  const state = { host, ms: [] as (number | null)[], running: true }
  pulse = state
  const argv = isWindows ? ['ping', '-t', host] : ['ping', host]
  const proc = $.process.spawn({ argv })
  let buf = ''
  void (async () => {
    for await (const chunk of proc) {
      if (!state.running) break // ออกจากลูป = ปิด ping ให้เอง
      buf += chunk.text
      let i = buf.indexOf('\n')
      while (i >= 0) {
        const v = parsePing(buf.slice(0, i))
        buf = buf.slice(i + 1)
        if (v !== undefined) {
          state.ms = [...state.ms, v].slice(-120)
          $.ui.invalidate('ui.render')
        }
        i = buf.indexOf('\n')
      }
    }
  })().catch(() => undefined)
}

function pulseStats(ms: (number | null)[]): { min: number; avg: number; max: number; jitter: number; loss: number } {
  const ok = ms.filter((v): v is number => v !== null)
  const avg = ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : 0
  const jitter = ok.length > 1 ? ok.slice(1).reduce((s, v, i) => s + Math.abs(v - (ok[i] ?? v)), 0) / (ok.length - 1) : 0
  return { min: ok.length ? Math.min(...ok) : 0, avg, max: ok.length ? Math.max(...ok) : 0, jitter, loss: ms.length ? ((ms.length - ok.length) / ms.length) * 100 : 0 }
}

// กราฟแท่ง: สูงตาม latency (สเกลตามค่าสูงสุด) สีเขียว < 50ms < เหลือง < 150ms < แดง, ขาด = แท่งม่วงเต็ม
function pulseGrid(ms: (number | null)[], width: number): Grid {
  const h = 10
  const g = new Grid(width, h, rgb(12, 14, 22))
  const vals = ms.slice(-width)
  const top = Math.max(50, ...vals.filter((v): v is number => v !== null)) * 1.1
  const levels = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
  vals.forEach((v, i) => {
    const x = width - vals.length + i
    if (v === null) {
      for (let y = 0; y < h; y++) g.set(x, y, '│', rgb(170, 90, 220))
      return
    }
    const color = v < 50 ? rgb(90, 210, 110) : v < 150 ? rgb(250, 200, 60) : rgb(240, 80, 80)
    const filled = (v / top) * h * 8
    for (let row = 0; row < h; row++) {
      const lv = Math.max(0, Math.min(8, Math.round(filled - (h - 1 - row) * 8)))
      if (lv > 0) g.set(x, row, levels[lv] ?? '█', color)
    }
  })
  g.text(0, 0, `${Math.round(top)}ms`, rgb(110, 110, 130))
  return g
}

// ==========================================================================
// บทที่ 1: ping และ traceroute - แต่ละระบบใช้ flag ไม่เหมือนกัน
// ==========================================================================
async function ping($: EngineInterface, host: string): Promise<string> {
  const out = await run($, isWindows ? ['ping', '-n', '4', host] : ['ping', '-c', '4', host], 30_000)
  // เอาเฉพาะบรรทัดสรุปท้ายๆ
  const lines = out.split('\n').filter(Boolean)
  return lines.slice(-4).join('\n')
}

async function trace($: EngineInterface, host: string): Promise<string> {
  return run($, isWindows ? ['tracert', '-d', '-h', '15', '-w', '1000', host] : ['traceroute', '-n', '-m', '15', '-w', '1', host], 120_000)
}

// ==========================================================================
// บทที่ 2: DNS ผ่าน HTTPS และ WHOIS ผ่าน RDAP (ข้อมูลเป็น JSON อ่านง่าย)
// ==========================================================================
const DNS_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME']

async function dns($: EngineInterface, name: string, type: string): Promise<string> {
  const body = await json($, `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { Accept: 'application/dns-json' })
  const answers = (body.Answer as { data: string; TTL: number }[] | undefined) ?? []
  if (body.Status === 3) return `❌ ไม่มีโดเมน ${name} (NXDOMAIN)`
  return answers.length ? answers.map(a => `  ${type.padEnd(5)} ${a.data}  (TTL ${a.TTL}s)`).join('\n') : `  (ไม่มีระเบียน ${type})`
}

async function whois($: EngineInterface, domain: string): Promise<string> {
  // rdap.org ส่งต่อ (redirect) ไปเซิร์ฟเวอร์ของแต่ละ TLD; ถ้า fetch ไม่ตามให้ ตามเองจาก header location
  let res = await $.http.fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`)
  const location = res.headers.location ?? res.headers.Location
  if (res.status >= 300 && res.status < 400 && location) res = await $.http.fetch(location)
  if (res.status === 404) return `❌ ไม่พบข้อมูล ${domain} (อาจยังไม่มีคนจด หรือ TLD นี้ไม่รองรับ RDAP)`
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = JSON.parse(res.text) as {
    events?: { eventAction: string; eventDate: string }[]
    entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[]
    nameservers?: { ldhName: string }[]
    status?: string[]
  }
  const event = (a: string) => d.events?.find(e => e.eventAction === a)?.eventDate?.slice(0, 10) ?? '-'
  const registrar = d.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] ?? '-'
  const expires = d.events?.find(e => e.eventAction === 'expiration')?.eventDate
  const days = expires ? Math.round((new Date(expires).getTime() - (await $.clock.now())) / 86_400_000) : undefined
  return [
    `🌐 ${domain.toLowerCase()}`,
    `  จดทะเบียน   ${event('registration')}`,
    `  หมดอายุ     ${event('expiration')}${days !== undefined ? ` (${days < 0 ? 'หมดแล้ว' : `อีก ${days} วัน`}${days >= 0 && days < 30 ? ' ⚠️ ใกล้หมด' : ''})` : ''}`,
    `  แก้ไขล่าสุด ${event('last changed')}`,
    `  ผู้รับจด     ${registrar}`,
    `  Name server ${d.nameservers?.map(n => n.ldhName.toLowerCase()).join(', ') || '-'}`,
  ].join('\n')
}

// ==========================================================================
// บทที่ 3: IP ของเรา, HTTP header และ security header
// ==========================================================================
async function myIp($: EngineInterface): Promise<string> {
  const v4 = (await json($, 'https://api.ipify.org?format=json').catch(() => ({ ip: '-' }))) as { ip?: string }
  const geo = (await json($, 'https://ipwho.is/').catch(() => ({}))) as { ip?: string; country?: string; region?: string; city?: string; connection?: { isp?: string } }
  return [`🌍 IPv4: ${v4.ip ?? '-'}`, geo.ip && geo.ip !== v4.ip ? `   IP ที่ออกเน็ต: ${geo.ip}` : '', `   ${geo.city ?? ''} ${geo.region ?? ''} ${geo.country ?? ''}`.trim(), geo.connection?.isp ? `   ISP: ${geo.connection.isp}` : ''].filter(Boolean).join('\n')
}

const SECURITY_HEADERS: [string, string][] = [
  ['strict-transport-security', 'บังคับ HTTPS (HSTS)'],
  ['content-security-policy', 'กัน XSS (CSP)'],
  ['x-frame-options', 'กันเว็บอื่นฝังหน้าเรา (clickjacking)'],
  ['x-content-type-options', 'กัน browser เดาชนิดไฟล์'],
  ['referrer-policy', 'คุมข้อมูล referrer'],
]

async function httpCheck($: EngineInterface, input: string): Promise<string> {
  const url = /^https?:\/\//i.test(input) ? input : `https://${input}`
  const start = await $.clock.now()
  const res = await $.http.fetch(url, { headers: { 'User-Agent': 'claude-code-network-tool-th' } })
  const ms = (await $.clock.now()) - start
  const h = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), v]))
  const sec = SECURITY_HEADERS.map(([k, label]) => `  ${h[k] ? '✅' : '⚠️'} ${label}`)
  return [
    `📨 ${url}  HTTP ${res.status}  ${ms} ms  ${(res.text.length / 1024).toFixed(0)} KB`,
    `  server: ${h.server ?? '-'} | content-type: ${h['content-type'] ?? '-'} | cache-control: ${h['cache-control'] ?? '-'}`,
    'Security headers:',
    ...sec,
  ].join('\n')
}

// ==========================================================================
// บทที่ 4: วัดความเร็ว, เช็คพอร์ต, Wi-Fi
// ==========================================================================
async function speed($: EngineInterface): Promise<string> {
  // latency: ขอไฟล์ 0 ไบต์ 3 ครั้ง เอาค่าน้อยสุด
  const pings: number[] = []
  for (let i = 0; i < 3; i++) {
    const t = await $.clock.now()
    await $.http.fetch('https://speed.cloudflare.com/__down?bytes=0')
    pings.push((await $.clock.now()) - t)
  }
  // $.http.fetch รับได้ครั้งละไม่เกิน 4 MB จึงโหลด 3 MB จำนวน 3 รอบ
  let received = 0
  const t = await $.clock.now()
  for (let i = 0; i < 3; i++) received += (await $.http.fetch('https://speed.cloudflare.com/__down?bytes=3000000')).text.length
  const seconds = ((await $.clock.now()) - t) / 1000
  const mbps = (received * 8) / seconds / 1_000_000
  return `⚡ ดาวน์โหลด ~${mbps.toFixed(1)} Mbps (${(received / 1_000_000).toFixed(0)} MB ใน ${seconds.toFixed(1)} วิ) | latency ${Math.min(...pings)} ms\n   (วัดผ่าน Claude Code มี overhead ค่าจริงอาจสูงกว่านี้เล็กน้อย)`
}

async function portCheck($: EngineInterface, host: string, ports: number[]): Promise<string> {
  const rows: string[] = []
  for (const port of ports) {
    let open = false
    if (isWindows) {
      const out = await run($, ['powershell', '-NoProfile', '-NonInteractive', '-Command', '$c = New-Object Net.Sockets.TcpClient; try { $ok = $c.ConnectAsync($env:NT_HOST, [int]$env:NT_PORT).Wait(3000); if ($ok -and $c.Connected) { "open" } else { "closed" } } catch { "closed" } finally { $c.Close() }'], 15_000, { NT_HOST: host, NT_PORT: String(port) })
      open = out.trim() === 'open'
    } else {
      const r = await $.process.run(['nc', '-z', '-w', '3', host, String(port)], { timeoutMs: 10_000 }).catch(() => undefined)
      open = r?.exitCode === 0
    }
    rows.push(`  ${open ? '🟢 เปิด' : '⚪ ปิด'}  ${host}:${port}`)
  }
  return [`🔌 เช็คพอร์ต ${host}`, ...rows].join('\n')
}

async function wifi($: EngineInterface): Promise<string> {
  if (isWindows) {
    const out = await run($, ['netsh', 'wlan', 'show', 'interfaces'])
    const pick = (k: string) => new RegExp(`^\\s*${k}\\s*:\\s*(.+)$`, 'mi').exec(out)?.[1]?.trim()
    const ssid = pick('SSID')
    if (!ssid) return '📶 ไม่ได้ต่อ Wi-Fi (หรือเครื่องไม่มี Wi-Fi)'
    return `📶 ${ssid} | สัญญาณ ${pick('Signal') ?? '-'} | ${pick('Radio type') ?? ''} | รับ ${pick('Receive rate \\(Mbps\\)') ?? '-'} Mbps`
  }
  if (isMac) return run($, ['networksetup', '-getairportnetwork', 'en0'])
  const out = await run($, ['nmcli', '-t', '-f', 'active,ssid,signal', 'dev', 'wifi'])
  const active = out.split('\n').find(l => l.startsWith('yes:'))
  return active ? `📶 ${active.split(':')[1]} | สัญญาณ ${active.split(':')[2]}%` : '📶 ไม่ได้ต่อ Wi-Fi'
}

const HELP = `🌐 Network Tool TH (Mod 26)
========================================
/net ping <host>              ping 4 ครั้ง
/net trace <host>             เส้นทางไปถึงปลายทาง (สูงสุด 15 hop)
/net dns <domain> [A|AAAA|MX|TXT|NS|CNAME|all]
/net whois <domain>           วันจด วันหมดอายุ ผู้รับจด (RDAP)
/net ip                       IP สาธารณะของเรา + ISP
/net http <url>               status เวลาโหลด และ security header
/net speed                    วัดความเร็วดาวน์โหลด
/net port <host> <พอร์ต,...>   เช็คพอร์ต (สูงสุด 10) เช่น /net port localhost 3000,5432
/net wifi                     สัญญาณ Wi-Fi ที่ต่ออยู่
/net history
/net pulse <host> | pulse stop   กราฟ latency สด (ping ต่อเนื่อง)
⚠️ เช็คพอร์ตเฉพาะเครื่องที่เป็นของเราหรือได้รับอนุญาต`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    history = []
    await $.command.register({ name: 'net', description: 'เครื่องมือเครือข่าย: ping dns whois ip speed port (/net help)', argumentHint: 'ping|trace|dns|whois|ip|http|speed|port|wifi' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PULSE_PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const p = pulse
    if (!p) return <Text dimColor>/net pulse google.com</Text>
    const s = pulseStats(p.ms)
    const last = p.ms.at(-1)
    return (
      <Box flexDirection="column">
        <Text bold>{`📈 ${p.host} · ล่าสุด ${last === undefined ? '-' : last === null ? 'หมดเวลา' : `${last} ms`}`}</Text>
        {drawGrid(els, e.surface, pulseGrid(p.ms, Math.max(20, Math.min(70, e.props.bodyColumns))), 'pulse', `latency ของ ${p.host}`) as never}
        <Text dimColor>{`min ${s.min.toFixed(0)} · avg ${s.avg.toFixed(0)} · max ${s.max.toFixed(0)} ms · jitter ${s.jitter.toFixed(1)} · loss ${s.loss.toFixed(0)}% (${p.ms.length} ครั้ง)`}</Text>
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PULSE_PANE && pulse) pulse.running = false
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /net
  // ==========================================================================
  on('command.run', { command: 'net' }, async ($, e) => {
    const [sub = 'help', a1, a2] = e.args.trim().split(/\s+/).filter(Boolean)
    history = [...history, { at: await $.clock.now(), command: e.args.trim() }].slice(-30)
    try {
      switch (sub) {
        case 'ping':
          return { text: validHost(a1) ? `📡 ping ${a1}\n${await ping($, a1)}` : 'วิธีใช้: /net ping google.com' }
        case 'trace':
          return { text: validHost(a1) ? `🗺️ traceroute ${a1}\n${await trace($, a1)}` : 'วิธีใช้: /net trace google.com' }
        case 'dns': {
          if (!validHost(a1)) return { text: 'วิธีใช้: /net dns example.com [A|MX|TXT|all]' }
          const types = !a2 || a2.toLowerCase() === 'all' ? DNS_TYPES : [a2.toUpperCase()].filter(t => DNS_TYPES.includes(t))
          if (types.length === 0) return { text: `ประเภทที่รองรับ: ${DNS_TYPES.join(', ')}` }
          const parts = await Promise.all(types.map(t => dns($, a1, t)))
          const missing = parts.find(p => p.startsWith('❌'))
          if (missing) return { text: missing } // ไม่มีโดเมนนี้ บอกครั้งเดียวพอ
          return { text: [`🔎 DNS ${a1}`, ...parts.filter(p => !p.includes('(ไม่มีระเบียน') || types.length === 1)].join('\n') }
        }
        case 'whois':
          return { text: validHost(a1) && a1.includes('.') ? await whois($, a1) : 'วิธีใช้: /net whois example.com' }
        case 'ip':
          return { text: await myIp($) }
        case 'http':
          return { text: a1 ? await httpCheck($, a1) : 'วิธีใช้: /net http https://example.com' }
        case 'speed':
          return { text: await speed($) }
        case 'port': {
          const ports = (a2 ?? '').split(',').map(Number).filter(p => Number.isInteger(p) && p > 0 && p < 65536)
          if (!validHost(a1) || ports.length === 0) return { text: 'วิธีใช้: /net port localhost 3000,5432' }
          if (ports.length > 10) return { text: '❌ เช็คได้ครั้งละไม่เกิน 10 พอร์ต' }
          return { text: await portCheck($, a1, ports) }
        }
        case 'wifi':
          return { text: await wifi($) }
        case 'pulse': {
          if (a1 === 'stop') {
            if (pulse) pulse.running = false
            await $.ui.close({ id: PULSE_PANE }).catch(() => undefined)
            const s = pulse ? pulseStats(pulse.ms) : undefined
            return { text: s ? `⏹️ หยุด ping ${pulse?.host} · avg ${s.avg.toFixed(0)} ms · loss ${s.loss.toFixed(0)}%` : 'ไม่ได้ ping อยู่' }
          }
          if (!validHost(a1)) return { text: 'วิธีใช้: /net pulse google.com  (หยุด: /net pulse stop)' }
          if (pulse) pulse.running = false
          startPulse($, a1)
          await $.ui.open({ id: PULSE_PANE, title: `📈 ${a1}` })
          return { text: `📈 เริ่ม ping ${a1} ต่อเนื่อง กราฟอยู่ในแผง (/net pulse stop เพื่อหยุด)` }
        }
        case 'history':
          return { text: history.map(h => `  ${new Date(h.at).toLocaleTimeString('th-TH')}  /net ${h.command}`).join('\n') || 'ยังไม่มีประวัติ' }
        default:
          return { text: HELP }
      }
    } catch (err) {
      return { text: `❌ ${sub} ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เฝ้าดูว่าเน็ตหลุด: ping ทุก 1 นาทีด้วย $.clock.every แล้วเตือนเมื่อหาย (ต่อกับ Mod 22)
 * 2. เตือนโดเมนใกล้หมดอายุ: เก็บรายชื่อโดเมนใน $.store แล้วเช็ค whois ทุกวัน
 * 3. ตรวจใบรับรอง SSL: วันหมดอายุของ certificate (ต้องใช้ openssl หรือ API ภายนอก)
 */
