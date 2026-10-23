/**
 * ============================================================================
 * MOD 21: Status Page TH - หน้าสถานะระบบแบบ status.example.com (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Atlassian Statuspage, Better Stack, Upptime
 *
 * หน้าที่ของ Mod นี้:
 * 1. ลงทะเบียน service (เว็บ/API) แล้วเช็คจริงทาง HTTP: ขึ้นไหม, ตอบกี่ ms
 * 2. เก็บประวัติ คำนวณ uptime %, เช็คอัตโนมัติเป็นระยะ และเด้งเตือนเมื่อสถานะเปลี่ยน
 * 3. บันทึก incident (เหตุขัดข้อง) และปิด incident
 * 4. ส่งออกเป็นไฟล์ HTML หน้าเดียว 5 ธีม เอาไปขึ้นเว็บ (GitHub Pages, Netlify) ได้เลย
 * 5. แผงด้านข้างแสดงสถานะสด
 *
 * หมายเหตุ: ใช้ชื่อคำสั่ง /statuspage เพราะ /status เป็นคำสั่งเดิมของ Claude Code
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Service {
  name: string
  url: string
}
interface Probe {
  at: number
  up: boolean
  status: number // 0 = เชื่อมต่อไม่ได้
  ms: number
}
interface Incident {
  id: number
  title: string
  service?: string
  level: 'minor' | 'major'
  startedAt: number
  resolvedAt?: number
}
interface Data {
  services: Service[]
  history: Record<string, Probe[]>
  incidents: Incident[]
  nextIncident: number
  title: string
}

const PANE = 'status-page-th'
const MAX_HISTORY = 500
let data: Data = { services: [], history: {}, incidents: [], nextIncident: 0, title: 'สถานะระบบ' }
let monitor: Timer | undefined

async function save($: EngineInterface): Promise<void> {
  await $.store.set('statuspage', data)
}

// ==========================================================================
// บทที่ 1: เช็ค service หนึ่งตัว - ถือว่า "ขึ้น" เมื่อตอบ 2xx/3xx ภายใน 10 วินาที
// ==========================================================================
async function probe($: EngineInterface, s: Service): Promise<Probe> {
  const start = await $.clock.now()
  try {
    const res = await Promise.race([
      $.http.fetch(s.url, { headers: { 'User-Agent': 'claude-code-status-page-th' } }),
      $.clock.sleep(10_000).then(() => undefined),
    ])
    const ms = (await $.clock.now()) - start
    return res ? { at: start, up: res.status < 400, status: res.status, ms } : { at: start, up: false, status: 0, ms }
  } catch {
    return { at: start, up: false, status: 0, ms: (await $.clock.now()) - start }
  }
}

// เช็คทุก service พร้อมกัน แล้วบอกตัวที่สถานะเปลี่ยน (ขึ้น->ล่ม หรือ ล่ม->ขึ้น)
async function checkAll($: EngineInterface): Promise<string[]> {
  const changes: string[] = []
  await Promise.all(
    data.services.map(async s => {
      const p = await probe($, s)
      const list = data.history[s.name] ?? []
      const before = list.at(-1)
      data.history[s.name] = [...list, p].slice(-MAX_HISTORY)
      if (before && before.up !== p.up) changes.push(p.up ? `✅ ${s.name} กลับมาใช้ได้แล้ว` : `🔴 ${s.name} ล่ม (HTTP ${p.status || 'ไม่ตอบ'})`)
    }),
  )
  await save($)
  $.ui.invalidate('ui.render')
  return changes
}

// ==========================================================================
// บทที่ 2: คำนวณ uptime และสถานะรวม
// ==========================================================================
function uptime(name: string): number | undefined {
  const list = data.history[name] ?? []
  return list.length ? (list.filter(p => p.up).length / list.length) * 100 : undefined
}

function overall(): { label: string; color: string } {
  const last = data.services.map(s => data.history[s.name]?.at(-1))
  const openMajor = data.incidents.some(i => !i.resolvedAt && i.level === 'major')
  if (last.some(p => p && !p.up) || openMajor) return { label: 'ระบบมีปัญหาบางส่วน', color: '#d32f2f' }
  if (data.incidents.some(i => !i.resolvedAt)) return { label: 'กำลังตรวจสอบเหตุขัดข้อง', color: '#f9a825' }
  return { label: 'ทุกระบบทำงานปกติ', color: '#2e7d32' }
}

function statusText(): string {
  if (data.services.length === 0) return 'ยังไม่มี service เพิ่มด้วย /statuspage add <ชื่อ> <url>'
  const o = overall()
  const rows = data.services.map(s => {
    const p = data.history[s.name]?.at(-1)
    const up = uptime(s.name)
    return `${p ? (p.up ? '🟢' : '🔴') : '⚪'} ${s.name.padEnd(16)} ${p ? `${p.status || 'ไม่ตอบ'} ${p.ms}ms` : 'ยังไม่เช็ค'}${up !== undefined ? `  uptime ${up.toFixed(2)}%` : ''}`
  })
  const open = data.incidents.filter(i => !i.resolvedAt)
  return [`📡 ${data.title}: ${o.label}`, '----------------------------------------', ...rows, ...(open.length ? ['', '⚠️ เหตุขัดข้องที่ยังไม่ปิด:', ...open.map(i => `  #${i.id} ${i.title}${i.service ? ` (${i.service})` : ''}`)] : [])].join('\n')
}

// ==========================================================================
// บทที่ 3: สร้างหน้า HTML หน้าเดียว (escape ทุกข้อความที่มาจากผู้ใช้)
// ==========================================================================
const THEMES: Record<string, { bg: string; card: string; text: string; muted: string; up: string; down: string; font: string }> = {
  light: { bg: '#f6f8fa', card: '#ffffff', text: '#1f2328', muted: '#656d76', up: '#2da44e', down: '#cf222e', font: 'system-ui, sans-serif' },
  dark: { bg: '#0d1117', card: '#161b22', text: '#e6edf3', muted: '#8b949e', up: '#3fb950', down: '#f85149', font: 'system-ui, sans-serif' },
  thai: { bg: '#fdf6e3', card: '#fffaf0', text: '#3e2723', muted: '#8d6e63', up: '#2e7d32', down: '#b71c1c', font: '"Sarabun", "Noto Sans Thai", sans-serif' },
  minimal: { bg: '#ffffff', card: '#ffffff', text: '#111111', muted: '#888888', up: '#111111', down: '#e00000', font: 'Georgia, serif' },
  ocean: { bg: '#e3f2fd', card: '#ffffff', text: '#0d47a1', muted: '#5472a1', up: '#00897b', down: '#d84315', font: 'system-ui, sans-serif' },
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtml(theme: string, now: number): string {
  const t = THEMES[theme] ?? THEMES.light!
  const o = overall()
  const services = data.services
    .map(s => {
      const list = (data.history[s.name] ?? []).slice(-60)
      const bars = list.map(p => `<i title="${new Date(p.at).toLocaleString('th-TH')} · ${p.status || 'ไม่ตอบ'} · ${p.ms}ms" style="background:${p.up ? t.up : t.down}"></i>`).join('')
      const up = uptime(s.name)
      const last = list.at(-1)
      return `<section class="card"><div class="row"><b>${esc(s.name)}</b><span style="color:${last?.up === false ? t.down : t.up}">${last ? (last.up ? 'ปกติ' : 'ขัดข้อง') : '-'}</span></div><div class="bars">${bars}</div><div class="muted">uptime ${up !== undefined ? up.toFixed(2) : '-'}% · ${list.length} ครั้งล่าสุด</div></section>`
    })
    .join('\n')
  const incidents = [...data.incidents]
    .reverse()
    .slice(0, 10)
    .map(i => `<li><b>${esc(i.title)}</b>${i.service ? ` · ${esc(i.service)}` : ''}<div class="muted">${new Date(i.startedAt).toLocaleString('th-TH')}${i.resolvedAt ? ` → แก้แล้ว ${new Date(i.resolvedAt).toLocaleString('th-TH')}` : ' · ยังไม่ปิด'}</div></li>`)
    .join('')
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)}</title>
<style>
body{margin:0;background:${t.bg};color:${t.text};font-family:${t.font}}
main{max-width:760px;margin:0 auto;padding:24px 16px}
.banner{background:${o.color};color:#fff;padding:16px 20px;border-radius:10px;font-size:1.2em;font-weight:600}
.card{background:${t.card};border:1px solid ${t.muted}33;border-radius:10px;padding:14px 16px;margin:12px 0}
.row{display:flex;justify-content:space-between}
.bars{display:flex;gap:2px;margin:10px 0 6px;height:28px}.bars i{flex:1;border-radius:2px;min-width:3px}
.muted{color:${t.muted};font-size:.85em}
ul{padding-left:18px}li{margin:8px 0}
</style></head><body><main>
<h1>${esc(data.title)}</h1>
<div class="banner">${o.label}</div>
${services || '<p class="muted">ยังไม่มี service</p>'}
<h2>เหตุขัดข้องล่าสุด</h2>
${incidents ? `<ul>${incidents}</ul>` : '<p class="muted">ไม่มีเหตุขัดข้อง</p>'}
<p class="muted">อัปเดต ${new Date(now).toLocaleString('th-TH')}</p>
</main></body></html>
`
}

const HELP = `📡 Status Page TH (Mod 21)
========================================
/statuspage                     สถานะล่าสุด + เปิดแผง
/statuspage add <ชื่อ> <url>     เพิ่ม service
/statuspage remove <ชื่อ>
/statuspage check               เช็คทุก service ตอนนี้
/statuspage monitor on [นาที]    เช็คอัตโนมัติ (ค่าเริ่มต้น 5 นาที) | monitor off
/statuspage incident <ข้อความ> [--service ชื่อ] [--major]
/statuspage resolve <id>        ปิด incident
/statuspage title <ชื่อหน้า>
/statuspage reset confirm       ล้างข้อมูลทั้งหมด
/statuspage export [ธีม]        สร้าง status.html  ธีม: ${Object.keys(THEMES).join(', ')}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('statuspage')) as Partial<Data> | undefined
    data = { services: [], history: {}, incidents: [], nextIncident: 0, title: 'สถานะระบบ', ...saved }
    await $.command.register({ name: 'statuspage', description: 'หน้าสถานะระบบ: เช็ค service, uptime, incident, ส่งออก HTML (/statuspage help)', argumentHint: 'add|check|monitor|incident|export' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงสถานะสด
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const o = overall()
    return (
      <Box flexDirection="column">
        <Box backgroundColor={o.color} paddingX={1}>
          <Text color="#ffffff" bold>
            {o.label}
          </Text>
        </Box>
        {data.services.map(s => {
          const p = data.history[s.name]?.at(-1)
          const recent = (data.history[s.name] ?? []).slice(-20)
          return (
            <Box flexDirection="column">
              <Text>
                {p ? (p.up ? '🟢' : '🔴') : '⚪'} {s.name} <Text dimColor>{p ? `${p.ms}ms · ${uptime(s.name)?.toFixed(1)}%` : 'ยังไม่เช็ค'}</Text>
              </Text>
              <Text>
                {recent.map(r => (
                  <Text color={r.up ? '#2e7d32' : '#d32f2f'}>▮</Text>
                ))}
              </Text>
            </Box>
          )
        })}
        {monitor && <Text dimColor>เช็คอัตโนมัติอยู่</Text>}
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /statuspage
  // ==========================================================================
  on('command.run', { command: 'statuspage' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/).filter(Boolean)
    const now = await $.clock.now()

    switch (sub) {
      case 'help':
        return { text: HELP }
      case 'add': {
        const [name, rawUrl] = rest
        if (!name || !rawUrl) return { text: 'วิธีใช้: /statuspage add api https://api.example.com/health' }
        let url: string
        try {
          const parsed = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
          // host ต้องเป็นโดเมนที่มีจุด, localhost หรือ IP (กัน "not" กลายเป็น https://not/)
          if (!/\.|^localhost$|^\[/.test(parsed.hostname)) throw new Error('bad host')
          url = parsed.href
        } catch {
          return { text: `❌ URL ไม่ถูกต้อง: ${rawUrl}` }
        }
        data.services = [...data.services.filter(s => s.name !== name), { name, url }]
        await save($)
        const p = await probe($, { name, url })
        data.history[name] = [...(data.history[name] ?? []), p]
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `➕ เพิ่ม ${name} แล้ว: ${p.up ? '🟢 ใช้ได้' : '🔴 ใช้ไม่ได้'} (HTTP ${p.status || 'ไม่ตอบ'}, ${p.ms}ms)` }
      }
      case 'remove':
        data.services = data.services.filter(s => s.name !== rest[0])
        delete data.history[rest[0] ?? '']
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `🗑️ ลบ ${rest[0] ?? ''} แล้ว` }
      case 'check': {
        if (data.services.length === 0) return { text: HELP }
        const changes = await checkAll($)
        return { text: `${statusText()}${changes.length ? `\n\n${changes.join('\n')}` : ''}` }
      }
      case 'monitor': {
        monitor?.cancel()
        monitor = undefined
        if (rest[0] === 'off') return { text: '⏹️ หยุดเช็คอัตโนมัติแล้ว' }
        const minutes = Math.max(1, Number(rest[1]) || 5)
        monitor = $.clock.every(minutes * 60_000, () => {
          void checkAll($).then(changes => changes.forEach(c => $.ui.toast(c)))
        })
        $.ui.invalidate('ui.render')
        return { text: `⏱️ เช็คอัตโนมัติทุก ${minutes} นาที ขณะเปิด Claude Code (เปลี่ยนสถานะจะเด้งเตือน)` }
      }
      case 'incident': {
        const service = /--service\s+(\S+)/.exec(args)?.[1]
        const title = args.replace(/^incident\s*/, '').replace(/--service\s+\S+|--major/g, '').trim()
        if (!title) return { text: 'วิธีใช้: /statuspage incident API ตอบช้า --service api --major' }
        const incident: Incident = { id: data.nextIncident++, title, service, level: /--major/.test(args) ? 'major' : 'minor', startedAt: now }
        data.incidents = [...data.incidents, incident].slice(-100)
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `⚠️ เปิด incident #${incident.id}: ${title}` }
      }
      case 'resolve': {
        const incident = data.incidents.find(i => i.id === Number(rest[0]))
        if (!incident) return { text: `❌ ไม่พบ incident #${rest[0] ?? ''}` }
        incident.resolvedAt = now
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `✅ ปิด incident #${incident.id} แล้ว` }
      }
      case 'reset':
        if (rest[0] !== 'confirm') return { text: '⚠️ จะลบ service ประวัติ และ incident ทั้งหมด ยืนยันด้วย /statuspage reset confirm' }
        monitor?.cancel()
        monitor = undefined
        data = { services: [], history: {}, incidents: [], nextIncident: 0, title: 'สถานะระบบ' }
        await save($)
        $.ui.invalidate('ui.render')
        return { text: '🧹 ล้างข้อมูลทั้งหมดแล้ว' }
      case 'title':
        data.title = rest.join(' ') || data.title
        await save($)
        return { text: `📝 ชื่อหน้า: ${data.title}` }
      case 'export': {
        const theme = rest[0] && THEMES[rest[0]] ? rest[0] : 'light'
        const root = (await $.session.cwd()).replace(/[\\/]$/, '')
        const path = `${root}${root.includes('\\') ? '\\' : '/'}status.html`
        await $.fs.write(path, buildHtml(theme, now))
        return { text: `💾 สร้าง ${path} (ธีม ${theme}) เปิดใน browser หรืออัปขึ้นเว็บได้เลย` }
      }
      default:
        await $.ui.open({ id: PANE, title: '📡 Status' })
        return { text: statusText() }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งแจ้งเตือนเข้ามือถือเมื่อ service ล่ม (ต่อกับ Mod 22 Smartwatch Notify หรือ LINE)
 * 2. วัดเวลาตอบเฉลี่ยรายวันแล้ววาดกราฟ
 * 3. ตั้ง GitHub Actions ให้ export status.html ทุก 5 นาทีแล้ว deploy อัตโนมัติ
 */
