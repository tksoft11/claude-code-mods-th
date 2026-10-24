/**
 * ============================================================================
 * MOD 63: Progress Plant TH - ต้นไม้ที่โตตามโค้ดที่เขียน (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: แอป Forest และช่องสีเขียวบนหน้า GitHub
 *
 * หน้าที่ของ Mod นี้:
 * 1. นับบรรทัดที่ Claude เพิ่ม/ลบให้วันนี้ จาก Edit / Write / MultiEdit ที่สำเร็จ
 * 2. ต้นไม้ในแถบสถานะโตเป็นขั้น: 🌰 → 🌱 20 → 🌿 100 → 🪴 250 → 🌳 500 → 🌸 1000 → 🍎 2000 บรรทัด
 * 3. ขึ้นวันใหม่ ต้นไม้ของเมื่อวานย้ายไปปลูกในสวน (/plant garden ดูย้อนหลัง 30 วัน)
 *
 * นับจาก "ข้อความที่ Claude ส่งให้ tool" จึงเป็นค่าประมาณ ไม่ใช่ git diff
 */

import type { EngineInterface, Register } from 'claude-code'

interface Day {
  date: string
  added: number
  removed: number
}

const STAGES: { at: number; icon: string; name: string }[] = [
  { at: 0, icon: '🌰', name: 'เมล็ด' },
  { at: 20, icon: '🌱', name: 'ต้นอ่อน' },
  { at: 100, icon: '🌿', name: 'แตกใบ' },
  { at: 250, icon: '🪴', name: 'ไม้กระถาง' },
  { at: 500, icon: '🌳', name: 'ต้นไม้ใหญ่' },
  { at: 1000, icon: '🌸', name: 'ออกดอก' },
  { at: 2000, icon: '🍎', name: 'ออกผล' },
]

let today: Day = { date: '', added: 0, removed: 0 }
let garden: Day[] = []
let enabled = true

function dateOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function stageOf(lines: number): { at: number; icon: string; name: string } {
  return [...STAGES].reverse().find(s => lines >= s.at) ?? { at: 0, icon: '🌰', name: 'เมล็ด' }
}

function lineCount(text: unknown): number {
  return typeof text === 'string' && text.length ? text.split('\n').length : 0
}

// ==========================================================================
// บทที่ 1: นับบรรทัดจากสิ่งที่ส่งให้ tool แก้ไฟล์
// ==========================================================================
function delta(tool: string, input: Record<string, unknown>): { added: number; removed: number } {
  if (tool === 'Write') return { added: lineCount(input.content), removed: 0 }
  if (tool === 'Edit') return { added: lineCount(input.new_string), removed: lineCount(input.old_string) }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return (input.edits as { old_string?: string; new_string?: string }[]).reduce((s, x) => ({ added: s.added + lineCount(x.new_string), removed: s.removed + lineCount(x.old_string) }), { added: 0, removed: 0 })
  }
  return { added: 0, removed: 0 }
}

async function rollover($: EngineInterface): Promise<void> {
  const d = dateOf(await $.clock.now())
  if (today.date === d) return
  // ย้ายต้นไม้ของวันก่อนลงสวน (ถ้าโตแล้ว)
  if (today.date && today.added > 0) garden = [...garden, today].slice(-60)
  today = { date: d, added: 0, removed: 0 }
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('plant', { today, garden })
}

function status($: EngineInterface): void {
  if (!enabled) {
    $.ui.status(undefined)
    return
  }
  const s = stageOf(today.added)
  $.ui.status(`${s.icon} วันนี้ +${today.added}/-${today.removed}`)
}

function progress(): string {
  const s = stageOf(today.added)
  const next = STAGES.find(x => x.at > today.added)
  if (!next) return `${s.icon} ${s.name} ขั้นสูงสุดแล้ว! (+${today.added} บรรทัด)`
  const pct = (today.added - s.at) / (next.at - s.at)
  return `${s.icon} ${s.name}  [${'█'.repeat(Math.round(pct * 16)).padEnd(16, '░')}]  อีก ${next.at - today.added} บรรทัดจะเป็น ${next.icon} ${next.name}`
}

const HELP = `🌱 Progress Plant TH (Mod 63)
========================================
/plant           ต้นไม้วันนี้ + ความคืบหน้าสู่ขั้นถัดไป
/plant garden    สวน 30 วันล่าสุด
/plant on|off    แสดง/ซ่อนในแถบสถานะ
ขั้น: ${STAGES.map(s => `${s.icon}${s.at}`).join(' ')} บรรทัด`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('plant')) as { today?: Day; garden?: Day[] } | undefined
    today = saved?.today ?? { date: '', added: 0, removed: 0 }
    garden = saved?.garden ?? []
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    await rollover($)
    status($)
    await $.command.register({ name: 'plant', description: 'ต้นไม้ในแถบสถานะที่โตตามโค้ดที่ Claude เขียนวันนี้ (/plant)', argumentHint: 'garden|on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: รดน้ำ - ทุกครั้งที่แก้ไฟล์สำเร็จ ต้นไม้โตขึ้น และฉลองเมื่อขึ้นขั้นใหม่
  // ==========================================================================
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!['Write', 'Edit', 'MultiEdit'].includes(e.tool) || r.deny !== undefined || r.isError) return r
    await rollover($)
    const before = stageOf(today.added)
    const d = delta(e.tool, e as unknown as Record<string, unknown>)
    today = { ...today, added: today.added + d.added, removed: today.removed + d.removed }
    const after = stageOf(today.added)
    if (after.at > before.at) $.ui.toast(`${after.icon} ต้นไม้โตเป็น "${after.name}" แล้ว! วันนี้ +${today.added} บรรทัด`)
    status($)
    await save($)
    return r
  })

  on('command.run', { command: 'plant' }, async ($, e) => {
    const sub = e.args.trim()
    await rollover($)
    if (sub === 'on' || sub === 'off') {
      enabled = sub === 'on'
      await $.store.set('enabled', enabled)
      status($)
      return { text: enabled ? '🌱 แสดงต้นไม้ในแถบสถานะแล้ว' : 'ซ่อนต้นไม้แล้ว (ยังนับต่อ)' }
    }
    if (sub === 'garden') {
      const days = [...garden.slice(-29), today]
      const total = days.reduce((s, d) => s + d.added, 0)
      return {
        text: [`🏡 สวนของคุณ (${days.length} วัน · รวม +${total} บรรทัด)`, '', days.map(d => stageOf(d.added).icon).join(' '), '', ...days.slice(-10).reverse().map(d => `  ${d.date}  ${stageOf(d.added).icon}  +${d.added}/-${d.removed}`)].join('\n'),
      }
    }
    if (sub) return { text: HELP }
    return { text: `${progress()}\n\nวันนี้ Claude เพิ่ม ${today.added} บรรทัด ลบ ${today.removed} บรรทัด\nดูสวน: /plant garden` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ต้นไม้เหี่ยว 🥀 ถ้าไม่ได้เขียนโค้ดเลย 3 วัน
 * 2. แยกต้นไม้ตามโปรเจกต์ ปลูกเป็นสวนหลายแปลง
 * 3. นับจาก git diff --stat จริงตอนจบวัน แทนการนับจาก tool
 */
