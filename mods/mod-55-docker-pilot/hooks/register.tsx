/**
 * ============================================================================
 * MOD 55: Docker Pilot TH - กัปตันเรือ Container (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Docker Desktop และ k9s แต่ย่อให้อยู่ข้างแชต
 *
 * หน้าที่ของ Mod นี้:
 * 1. /docker - แดชบอร์ด container ในแผง: สถานะ, health, CPU, แรม, พอร์ต (รีเฟรชทุก 10 วินาที)
 * 2. แจ้งเตือนเมื่อ container ที่เคยรันอยู่ตาย หรือกลายเป็น unhealthy ระหว่างเปิดแผง
 * 3. /docker logs <ชื่อ> - log ล่าสุด, /docker start|stop|restart <ชื่อ> (stop ถามก่อน)
 * 4. /docker pods - Pod ของ Kubernetes ที่พัง (CrashLoopBackOff, Error, restart บ่อย)
 * 5. /docker why <ชื่อ> - ให้ Claude อ่าน log แล้วบอกว่าทำไมพัง
 *
 * เรียกคำสั่ง docker / kubectl ผ่าน $.process.run (argv ล้วน ชื่อ container ส่งเป็น argument)
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Container {
  id: string
  name: string
  image: string
  state: string // running | exited | restarting | paused | created | dead
  status: string // "Up 2 hours (healthy)", "Exited (1) 3 minutes ago"
  ports: string
  project: string
  cpu?: string
  mem?: string
}

const PANE = 'docker-pilot-th'
let containers: Container[] = []
let error = ''
let updatedAt = 0
let ticker: Timer | undefined
let showAll = false

// ==========================================================================
// บทที่ 1: อ่านสถานะ - docker ps + docker stats แบบ JSON ทีละบรรทัด
// ==========================================================================
function jsonLines<T>(text: string): T[] {
  return text
    .split('\n')
    .map(l => {
      try {
        return JSON.parse(l) as T
      } catch {
        return undefined
      }
    })
    .filter((x): x is T => !!x)
}

async function refresh($: EngineInterface, withStats: boolean): Promise<void> {
  const ps = await $.process.run(['docker', 'ps', '-a', '--format', '{{json .}}'], { timeoutMs: 20_000 }).catch(() => undefined)
  if (!ps || ps.exitCode !== 0) {
    error = !ps ? 'ไม่พบคำสั่ง docker บนเครื่องนี้' : /daemon|pipe|connect/i.test(ps.stderr) ? 'Docker ยังไม่ได้เปิด (เปิด Docker Desktop ก่อน)' : ps.stderr.trim().slice(0, 200)
    containers = []
    return
  }
  error = ''
  const rows = jsonLines<Record<string, string>>(ps.stdout)
  const next: Container[] = rows.map(r => ({
    id: r.ID ?? '',
    name: r.Names ?? '',
    image: r.Image ?? '',
    state: r.State ?? '',
    status: r.Status ?? '',
    ports: (r.Ports ?? '').replace(/0\.0\.0\.0:|\[::\]:|:::/g, '').split(', ').filter((p, i, a) => p && a.indexOf(p) === i).join(', '),
    project: /com\.docker\.compose\.project=([^,]+)/.exec(r.Labels ?? '')?.[1] ?? '',
  }))
  if (withStats && next.some(c => c.state === 'running')) {
    const st = await $.process.run(['docker', 'stats', '--no-stream', '--format', '{{json .}}'], { timeoutMs: 20_000 }).catch(() => undefined)
    for (const s of jsonLines<Record<string, string>>(st?.stdout ?? '')) {
      const c = next.find(x => x.id === s.ID)
      if (c) Object.assign(c, { cpu: s.CPUPerc, mem: (s.MemUsage ?? '').split(' / ')[0] })
    }
  }
  // เทียบกับรอบก่อน: ตัวที่เพิ่งตาย / เพิ่ง unhealthy
  for (const c of next) {
    const before = containers.find(x => x.id === c.id)
    if (!before) continue
    if (before.state === 'running' && c.state !== 'running') $.ui.toast(`💥 ${c.name} หยุดทำงาน: ${c.status}`, { timeoutMs: 15_000 })
    else if (!/unhealthy/.test(before.status) && /unhealthy/.test(c.status)) $.ui.toast(`🤒 ${c.name} unhealthy`, { timeoutMs: 15_000 })
  }
  containers = next
  updatedAt = await $.clock.now()
}

function icon(c: Container): string {
  if (/unhealthy/.test(c.status)) return '🤒'
  if (c.state === 'running') return /healthy/.test(c.status) ? '💚' : '🟢'
  if (c.state === 'restarting') return '🔄'
  if (c.state === 'paused') return '⏸️'
  return /Exited \(0\)/.test(c.status) ? '⚪' : '🔴'
}

function problem(c: Container): boolean {
  return /unhealthy/.test(c.status) || c.state === 'restarting' || c.state === 'dead' || (c.state === 'exited' && !/Exited \(0\)/.test(c.status))
}

function visible(): Container[] {
  return showAll ? containers : containers.filter(c => c.state === 'running' || c.state === 'restarting' || problem(c))
}

function table(list: Container[]): string {
  if (list.length === 0) return 'ไม่มี container'
  return list.map(c => `${icon(c)} ${c.name.slice(0, 32).padEnd(32)} ${c.status.slice(0, 26).padEnd(26)} ${(c.cpu ?? '').padStart(6)} ${(c.mem ?? '').padStart(9)}  ${c.ports}`).join('\n')
}

function startTicker($: EngineInterface): void {
  ticker ??= $.clock.every(10_000, () => {
    void refresh($, true).then(() => $.ui.invalidate('ui.render'))
  })
}

// ==========================================================================
// บทที่ 2: Kubernetes - หา Pod ที่มีปัญหา
// ==========================================================================
interface PodList {
  items: { metadata: { name: string; namespace: string }; status: { phase: string; containerStatuses?: { restartCount: number; state: { waiting?: { reason?: string }; terminated?: { reason?: string } } }[] } }[]
}

async function pods($: EngineInterface): Promise<string> {
  const r = await $.process.run(['kubectl', 'get', 'pods', '-A', '-o', 'json', '--request-timeout=10s'], { timeoutMs: 20_000 }).catch(() => undefined)
  if (!r) return '❌ ไม่พบคำสั่ง kubectl'
  if (r.exitCode !== 0) {
    if (/connect|refused|no such host|localhost:8080/i.test(r.stderr)) return '☸️ ยังไม่มี Kubernetes cluster ที่ต่อได้ (เปิด Kubernetes ใน Docker Desktop หรือตั้งค่า kubeconfig)'
    return `❌ ต่อ cluster ไม่ได้: ${r.stderr.trim().split('\n').pop()?.slice(0, 200)}`
  }
  const list = (JSON.parse(r.stdout) as PodList).items
  const rows = list.map(p => {
    const cs = p.status.containerStatuses ?? []
    const reason = cs.map(c => c.state.waiting?.reason ?? c.state.terminated?.reason).find(Boolean) ?? p.status.phase
    const restarts = cs.reduce((s, c) => s + c.restartCount, 0)
    return { name: `${p.metadata.namespace}/${p.metadata.name}`, reason, restarts, bad: !['Running', 'Succeeded', 'Completed'].includes(reason) || restarts >= 5 }
  })
  const bad = rows.filter(p => p.bad)
  return [`☸️ Pod ทั้งหมด ${rows.length} · มีปัญหา ${bad.length}`, ...bad.slice(0, 30).map(p => `  🔴 ${p.name.padEnd(50)} ${p.reason.padEnd(18)} restart ${p.restarts}`), bad.length ? '\nดู log: kubectl logs -n <ns> <pod> --previous' : '  ✅ ไม่มี Pod ที่มีปัญหา'].join('\n')
}

function find(name: string): Container | undefined {
  return containers.find(c => c.name === name) ?? containers.find(c => c.id.startsWith(name)) ?? containers.find(c => c.name.includes(name))
}

async function logs($: EngineInterface, c: Container, lines: number): Promise<string> {
  const r = await $.process.run(['docker', 'logs', '--tail', String(lines), '--timestamps', c.id], { timeoutMs: 20_000 }).catch(() => undefined)
  return `${r?.stdout ?? ''}${r?.stderr ?? ''}`.trim()
}

const HELP = `🐳 Docker Pilot TH (Mod 55)
========================================
/docker               แดชบอร์ด (แสดงเฉพาะตัวที่รัน/มีปัญหา)
/docker all           แสดงทุกตัว รวมที่หยุดปกติ
/docker logs <ชื่อ> [บรรทัด]   log ล่าสุด (ค่าเริ่มต้น 40)
/docker why <ชื่อ>    ให้ Claude อ่าน log แล้วบอกสาเหตุ
/docker start|stop|restart <ชื่อ>
/docker pods          Pod ของ Kubernetes ที่มีปัญหา
ชื่อพิมพ์บางส่วนได้ เช่น /docker logs db`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'docker', description: 'แดชบอร์ด Docker: container, CPU, แรม, log, start/stop และ Pod ที่พัง (/docker help)', argumentHint: 'all|logs|why|start|stop|restart <ชื่อ>|pods' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แผงแดชบอร์ด
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = visible()
    const running = containers.filter(c => c.state === 'running').length
    const bad = containers.filter(problem).length
    return (
      <Box flexDirection="column">
        {error ? (
          <Text color="#e53935">❌ {error}</Text>
        ) : (
          <Text>
            🐳 รัน <Text color="#43a047">{running}</Text> · มีปัญหา <Text color={bad ? '#e53935' : undefined}>{bad}</Text> · ทั้งหมด {containers.length}
            <Text dimColor> · อัปเดต {updatedAt ? new Date(updatedAt).toLocaleTimeString('th-TH') : '-'}</Text>
          </Text>
        )}
        {list.map(c => (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={problem(c) ? '#e53935' : undefined}>
              {icon(c)} {c.name}
              {c.project ? <Text dimColor> ({c.project})</Text> : null}
            </Text>
            <Text dimColor>
              {'   '}
              {c.status}
              {c.cpu ? ` · CPU ${c.cpu} · RAM ${c.mem}` : ''}
              {c.ports ? ` · ${c.ports}` : ''}
            </Text>
          </Box>
        ))}
        {!showAll && containers.length > list.length && <Text dimColor>ซ่อน {containers.length - list.length} ตัวที่หยุดปกติ (/docker all)</Text>}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      ticker?.cancel()
      ticker = undefined
    }
    return next(e)
  })

  on('command.run', { command: 'docker' }, async ($, e) => {
    const [sub = '', name = '', extra = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '':
      case 'all': {
        showAll = sub === 'all'
        await refresh($, true)
        await $.ui.open({ id: PANE, title: '🐳 Docker' })
        startTicker($)
        $.ui.invalidate('ui.render')
        return { text: error ? `❌ ${error}` : table(visible()) }
      }
      case 'pods':
        return { text: await pods($) }
      case 'logs':
      case 'why':
      case 'start':
      case 'stop':
      case 'restart': {
        if (!name) return { text: `วิธีใช้: /docker ${sub} <ชื่อ container>` }
        await refresh($, false)
        if (error) return { text: `❌ ${error}` }
        const c = find(name)
        if (!c) return { text: `❌ ไม่พบ container "${name}"` }
        if (sub === 'logs') {
          const n = Math.min(500, Math.max(1, Number(extra) || 40))
          return { text: `📜 ${c.name} (${c.status})\n${(await logs($, c, n)) || '(ไม่มี log)'}` }
        }
        if (sub === 'why') {
          const text = await logs($, c, 120)
          const system = 'คุณเป็นวิศวกร DevOps อ่าน log ของ Docker container แล้วอธิบายเป็นภาษาไทยไม่เกิน 6 บรรทัด: สถานะตอนนี้, สาเหตุที่น่าจะเป็น (อ้างบรรทัด log), สิ่งที่ควรลองทำ ห้ามเดาเกินข้อมูล'
          for (const model of ['haiku', await $.session.model()]) {
            const r = await $.model.complete({ model, system, prompt: `container: ${c.name}\nimage: ${c.image}\nstatus: ${c.status}\n\nlog:\n${text.slice(-8000)}`, maxTokens: 500 }).catch(() => undefined)
            if (r?.isAnswered) return { text: `🩺 ${c.name}\n\n${r.text.trim()}` }
          }
          return { text: '❌ ถาม Claude ไม่สำเร็จ' }
        }
        if (sub === 'stop') {
          const a = await $.ui.ask(`หยุด container ${c.name} ไหม?`, ['หยุดเลย', 'ยกเลิก']).catch(() => '')
          if (a !== 'หยุดเลย') return { text: 'ยกเลิก' }
        }
        const r = await $.process.run(['docker', sub, c.id], { timeoutMs: 60_000 }).catch(() => undefined)
        await refresh($, false)
        $.ui.invalidate('ui.render')
        return { text: r?.exitCode === 0 ? `✅ ${sub} ${c.name} แล้ว → ${find(c.name)?.status ?? ''}` : `❌ ${sub} ไม่สำเร็จ: ${r?.stderr.trim() ?? ''}` }
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
 * 1. จัดกลุ่มตาม docker compose project แล้วสั่ง up/down ทั้งกลุ่ม
 * 2. วาดกราฟ CPU ย้อนหลังด้วยตัวอักษร ▁▂▃▅▇
 * 3. ส่งแจ้งเตือนไปมือถือเมื่อ container ตาย (ต่อกับ Mod 22)
 */
