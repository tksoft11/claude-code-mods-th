/**
 * ============================================================================
 * MOD 39: GCloud TH - ดู Google Cloud ผ่าน gcloud CLI (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Google Cloud Console และ gcloud CLI
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดูสถานะ: บัญชีที่ login, project ที่เลือก, region เริ่มต้น
 * 2. ดูของที่รันอยู่: VM (Compute Engine), Cloud Run, และสถานะ billing ของ project
 * 3. สลับ project ที่ใช้
 * 4. Template คำสั่งที่ใช้บ่อย (deploy Cloud Run, สร้าง VM, เก็บ secret) แบบ copy ไปใช้
 * 5. /gcloud ask ให้ Claude ทำงาน GCP ให้ (Claude จะขออนุญาตก่อนรันคำสั่งทุกครั้ง)
 *
 * ความปลอดภัย: Mod เรียก gcloud เฉพาะคำสั่งอ่านอย่างเดียว ไม่สร้าง ลบ หรือ deploy เอง
 * ต้องติดตั้ง gcloud CLI และ gcloud auth login ก่อน
 */

import type { EngineInterface, Register } from 'claude-code'

let isWindows = false

// ==========================================================================
// บทที่ 1: เรียก gcloud แล้วอ่านผลเป็น JSON (--format=json อ่านง่ายกว่าข้อความ)
// ==========================================================================
// Windows ติดตั้ง gcloud เป็น gcloud.cmd จึงต้องเรียกผ่าน cmd /c; argument เป็นค่าคงที่หรือผ่านการตรวจแล้ว
async function gcloud($: EngineInterface, args: string[]): Promise<unknown> {
  const argv = isWindows ? ['cmd', '/c', 'gcloud', ...args, '--format=json'] : ['gcloud', ...args, '--format=json']
  const r = await $.process.run(argv, { timeoutMs: 60_000 }).catch(err => {
    throw new Error(`เรียก gcloud ไม่ได้: ${err instanceof Error ? err.message : String(err)}`)
  })
  if (r.exitCode !== 0) {
    if (/not recognized|not found|No such file/i.test(r.stderr)) throw new Error('NOT_INSTALLED')
    throw new Error(r.stderr.trim().split('\n').slice(-2).join(' ') || `gcloud exit ${r.exitCode}`)
  }
  return r.stdout.trim() ? JSON.parse(r.stdout) : null
}

const NOT_INSTALLED = `☁️ ยังไม่พบ gcloud CLI
1. ติดตั้ง: https://cloud.google.com/sdk/docs/install
2. รัน gcloud auth login แล้วเปิด Claude Code ใหม่
3. /gcloud status`

function validProject(id: string | undefined): id is string {
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id ?? '')
}

// ==========================================================================
// บทที่ 2: คำสั่งอ่านอย่างเดียว
// ==========================================================================
async function status($: EngineInterface): Promise<string> {
  const cfg = (await gcloud($, ['config', 'list'])) as { core?: { account?: string; project?: string }; compute?: { region?: string; zone?: string }; run?: { region?: string } }
  return [
    '☁️ Google Cloud',
    `  บัญชี    ${cfg.core?.account ?? '(ยังไม่ login: gcloud auth login)'}`,
    `  project  ${cfg.core?.project ?? '(ยังไม่เลือก: /gcloud use <project-id>)'}`,
    `  region   compute ${cfg.compute?.region ?? '-'} / run ${cfg.run?.region ?? '-'}`,
  ].join('\n')
}

async function projects($: EngineInterface): Promise<string> {
  const list = (await gcloud($, ['projects', 'list'])) as { projectId: string; name: string; lifecycleState?: string }[]
  return list.length ? ['📁 Projects', ...list.map(p => `  ${p.projectId.padEnd(30)} ${p.name}${p.lifecycleState && p.lifecycleState !== 'ACTIVE' ? ` (${p.lifecycleState})` : ''}`)].join('\n') : 'ไม่มี project'
}

async function vms($: EngineInterface): Promise<string> {
  const list = (await gcloud($, ['compute', 'instances', 'list'])) as { name: string; status: string; zone: string; machineType: string }[]
  if (list.length === 0) return '🖥️ ไม่มี VM ใน project นี้'
  return ['🖥️ Compute Engine', ...list.map(v => `  ${v.status === 'RUNNING' ? '🟢' : '⚪'} ${v.name.padEnd(24)} ${v.machineType.split('/').pop()} · ${v.zone.split('/').pop()} · ${v.status}`), '', '💡 VM ที่ไม่ใช้ หยุดไว้จะไม่เสียค่า CPU (แต่ยังเสียค่าดิสก์)'].join('\n')
}

async function runServices($: EngineInterface): Promise<string> {
  const list = (await gcloud($, ['run', 'services', 'list'])) as { metadata?: { name?: string; labels?: Record<string, string> }; status?: { url?: string; conditions?: { type: string; status: string }[] } }[]
  if (list.length === 0) return '🏃 ไม่มี Cloud Run service'
  return ['🏃 Cloud Run', ...list.map(s => `  ${s.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? '🟢' : '🔴'} ${s.metadata?.name ?? '-'}  ${s.status?.url ?? ''}`)].join('\n')
}

async function billing($: EngineInterface): Promise<string> {
  const cfg = (await gcloud($, ['config', 'list'])) as { core?: { project?: string } }
  const project = cfg.core?.project
  if (!validProject(project)) return 'ยังไม่ได้เลือก project /gcloud use <project-id>'
  const info = (await gcloud($, ['billing', 'projects', 'describe', project])) as { billingEnabled?: boolean; billingAccountName?: string }
  return `💳 ${project}: billing ${info.billingEnabled ? `เปิด (${info.billingAccountName ?? ''})` : 'ปิด'}\n💡 ตั้งงบและการแจ้งเตือนที่ https://console.cloud.google.com/billing/budgets กันบิลบาน`
}

// ==========================================================================
// บทที่ 3: Template คำสั่งที่ใช้บ่อย (แสดงให้ copy ไม่รันเอง)
// ==========================================================================
const TEMPLATES: Record<string, { name: string; cmd: string; note: string }> = {
  run: { name: 'Deploy Cloud Run จากโค้ด', cmd: 'gcloud run deploy my-app --source . --region=asia-southeast1 --allow-unauthenticated', note: 'จ่ายตามที่ใช้ มี free tier รายเดือน เหมาะกับเว็บ/API' },
  vm: { name: 'สร้าง VM เล็กสุด', cmd: 'gcloud compute instances create my-vm --machine-type=e2-micro --zone=us-central1-a --image-family=debian-12 --image-project=debian-cloud', note: 'e2-micro อยู่ใน Always Free เฉพาะบาง region ในสหรัฐฯ (เช่น us-central1) region อื่นเสียเงิน' },
  stop: { name: 'หยุด VM', cmd: 'gcloud compute instances stop my-vm --zone=us-central1-a', note: 'หยุดแล้วไม่เสียค่า CPU/RAM' },
  secret: { name: 'เก็บ secret', cmd: 'printf "ค่าลับ" | gcloud secrets create my-api-key --data-file=-', note: 'อย่าเก็บ key ไว้ในโค้ด ใช้ Secret Manager แทน' },
  logs: { name: 'ดู log ของ Cloud Run', cmd: 'gcloud run services logs read my-app --region=asia-southeast1 --limit=50', note: 'ดู error ล่าสุดของ service' },
  apis: { name: 'เปิด API ที่ต้องใช้', cmd: 'gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com', note: 'ต้องเปิดก่อน deploy Cloud Run ครั้งแรก' },
}

const HELP = `☁️ GCloud TH (Mod 39)
========================================
/gcloud status            บัญชี project region
/gcloud projects          project ทั้งหมด
/gcloud use <project-id>  สลับ project
/gcloud vms | run | billing   VM, Cloud Run, สถานะ billing
/gcloud template [ชื่อ]   ${Object.keys(TEMPLATES).join(' ')}
/gcloud ask <งาน>         ให้ Claude ทำงาน GCP ให้ (ขออนุญาตก่อนรันทุกคำสั่ง)
free tier ล่าสุด: https://cloud.google.com/free`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    await $.command.register({ name: 'gcloud', description: 'ดู Google Cloud: project VM Cloud Run billing + template คำสั่ง (/gcloud help)', argumentHint: 'status|projects|use|vms|run|billing|template|ask' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /gcloud
  // ==========================================================================
  on('command.run', { command: 'gcloud' }, async ($, e) => {
    const [sub = 'status', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    try {
      switch (sub) {
        case 'status':
          return { text: await status($) }
        case 'projects':
          return { text: await projects($) }
        case 'use': {
          if (!validProject(rest[0])) return { text: 'วิธีใช้: /gcloud use my-project-123 (ดู id ด้วย /gcloud projects)' }
          await gcloud($, ['config', 'set', 'project', rest[0]])
          return { text: `✅ ใช้ project ${rest[0]} แล้ว` }
        }
        case 'vms':
          return { text: await vms($) }
        case 'run':
          return { text: await runServices($) }
        case 'billing':
          return { text: await billing($) }
        case 'template': {
          const t = TEMPLATES[rest[0] ?? '']
          if (!t) return { text: ['📋 Template', ...Object.entries(TEMPLATES).map(([k, v]) => `  ${k.padEnd(7)} ${v.name}`), '', '/gcloud template run'].join('\n') }
          return { text: `📋 ${t.name}\n\n  ${t.cmd}\n\n💡 ${t.note}\nแก้ชื่อ/region ก่อนรัน หรือให้ Claude ทำ: /gcloud ask ${t.name}` }
        }
        case 'ask': {
          const task = rest.join(' ')
          if (!task) return { text: 'วิธีใช้: /gcloud ask deploy โฟลเดอร์นี้ขึ้น Cloud Run region สิงคโปร์' }
          $.clock.after(50, () => void $.prompt.submit({ text: `ใช้ gcloud CLI ทำงานนี้บน Google Cloud: ${task}\nตรวจ project และ region ปัจจุบันก่อน อธิบายคำสั่งที่จะรันและค่าใช้จ่ายที่อาจเกิด แล้วค่อยรัน` }).catch(() => undefined)) // ส่งหลังคำสั่งตอบกลับแล้ว (ส่งระหว่าง command.run ไม่ได้)
          return { text: `☁️ ส่งงานให้ Claude แล้ว: ${task}` }
        }
        default:
          return { text: HELP }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { text: msg === 'NOT_INSTALLED' ? NOT_INSTALLED : `❌ ${msg}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. แจ้งเตือนเมื่อมี VM รันทิ้งไว้เกิน 8 ชม. (เช็คด้วย $.clock.every)
 * 2. แผงสรุปค่าใช้จ่ายรายเดือนจาก BigQuery billing export
 * 3. เทียบเวลา deploy และ revision ของ Cloud Run
 */
