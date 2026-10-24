/**
 * ============================================================================
 * MOD 52: Project Memory TH - สมองที่สองของ Claude ข้าม session (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: เทคนิค "Memory Palace" และไฟล์ CLAUDE.md
 *
 * หน้าที่ของ Mod นี้:
 * 1. /jam <ข้อความ> - จดเรื่องที่อยากให้ Claude จำ เช่น "ใช้ pnpm ไม่ใช้ npm"
 *    แยกตามโปรเจกต์ (หรือ global ใช้ทุกโปรเจกต์)
 * 2. แนบสิ่งที่จดไว้ให้ Claude อ่านอัตโนมัติ ผ่าน event prompt.context (บริบทของบทสนทนา)
 * 3. พิมพ์ "จำไว้ว่า ..." หรือ "remember that ..." ในแชต จะถูกจดให้เอง
 * 4. /jam suggest - ให้ Haiku อ่านบทสนทนาแล้วเสนอเรื่องที่ควรจำ ให้คุณติ๊กเลือก
 *
 * ต่างจาก CLAUDE.md ยังไง: เก็บใน $.store ของเครื่องคุณ ไม่ลง repo ไม่กระทบเพื่อนร่วมทีม
 * เหมาะกับความชอบส่วนตัว หรือเรื่องที่ยังไม่อยากประกาศให้ทั้งทีม
 */

import type { EngineInterface, Register } from 'claude-code'

interface Fact {
  text: string
  at: number
}

const MAX_FACTS = 50
const MAX_LEN = 200
const AUTO = /^\s*(?:จำไว้(?:ด้วย)?ว่า|ช่วยจำว่า|remember that)\s*[:：]?\s*(.+)$/is

let root = ''
let project: Fact[] = []
let global: Fact[] = []
let enabled = true

// ==========================================================================
// บทที่ 1: เก็บแยกตามโปรเจกต์ - ใช้ path ของโปรเจกต์เป็นกุญแจ
// ==========================================================================
function key(): string {
  return `facts:${root.toLowerCase().replace(/\\/g, '/')}`
}

async function load($: EngineInterface): Promise<void> {
  root = await $.session.root()
  project = ((await $.store.get(key())) as Fact[] | undefined) ?? []
  global = ((await $.store.get('facts:global')) as Fact[] | undefined) ?? []
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set(key(), project)
  await $.store.set('facts:global', global)
  // บอก engine ว่าบริบทเปลี่ยน ให้คำนวณใหม่ (ส่งฉบับใหม่ให้โมเดลในรอบถัดไป)
  try {
    $.ui.invalidate('prompt.context')
  } catch {}
}

async function add($: EngineInterface, text: string, isGlobal: boolean): Promise<string> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN)
  if (!clean) return 'วิธีใช้: /jam ใช้ pnpm ไม่ใช้ npm'
  const list = isGlobal ? global : project
  if (list.some(f => f.text.toLowerCase() === clean.toLowerCase())) return `ℹ️ จำไว้อยู่แล้ว: ${clean}`
  const next = [...list, { text: clean, at: await $.clock.now() }].slice(-MAX_FACTS)
  if (isGlobal) global = next
  else project = next
  await save($)
  return `🧠 จำแล้ว${isGlobal ? ' (ทุกโปรเจกต์)' : ''}: ${clean}`
}

// ==========================================================================
// บทที่ 2: ข้อความที่แนบเข้า system prompt
// ==========================================================================
function section(): string {
  const lines = [...global.map(f => `- ${f.text}`), ...project.map(f => `- ${f.text}`)]
  return `# สิ่งที่ผู้ใช้ขอให้จำ (Project Memory)\nผู้ใช้จดเรื่องเหล่านี้ไว้ให้คุณจำข้าม session ทำตามเสมอ เว้นแต่ผู้ใช้สั่งเป็นอย่างอื่นในแชต:\n${lines.join('\n')}`
}

function listText(): string {
  const fmt = (list: Fact[], offset: number) => list.map((f, i) => `  ${String(i + 1 + offset).padStart(2)}. ${f.text}`)
  const out: string[] = [`🧠 Project Memory ${enabled ? '' : '(ปิดอยู่ ไม่ได้แนบให้ Claude)'}`]
  out.push(`\n📁 ${root.split(/[\\/]/).pop() ?? root} (${project.length})`, ...(project.length ? fmt(project, 0) : ['  (ว่าง)']))
  out.push(`\n🌍 ทุกโปรเจกต์ (${global.length})`, ...(global.length ? fmt(global, project.length) : ['  (ว่าง)']))
  return out.join('\n')
}

const HELP = `🧠 Project Memory TH (Mod 52)
========================================
/jam <ข้อความ>          จดให้ Claude จำ (เฉพาะโปรเจกต์นี้)
/jam global <ข้อความ>   จดให้จำทุกโปรเจกต์
/jam list               ดูทั้งหมด
/jam forget <เลข>       ลบข้อที่ระบุ
/jam suggest            ให้ Claude เสนอเรื่องที่ควรจำจากบทสนทนา
/jam on|off             แนบ/ไม่แนบให้ Claude
/jam clear confirm      ล้างของโปรเจกต์นี้
หรือพิมพ์ในแชตว่า "จำไว้ว่า ..." ก็จดให้เอง`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await load($)
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    await $.command.register({ name: 'jam', description: 'จดสิ่งที่ Claude ควรจำข้าม session (/jam help)', argumentHint: '<ข้อความ>|global|list|forget <เลข>|suggest' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: prompt.context - เติม block ของเราลงในบริบทที่แนบไปกับข้อความแรก
  // ==========================================================================
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    const blocks = r.blocks.filter(b => b.name !== 'projectMemoryTh')
    if (!enabled || project.length + global.length === 0) return { blocks }
    return { blocks: [...blocks, { name: 'projectMemoryTh', text: section() }] }
  })

  // บทที่ 4: "จำไว้ว่า ..." ในแชต - จดให้เอง แล้วส่งข้อความต่อให้ Claude ตามปกติ
  on('prompt.submit', async ($, e, next) => {
    const m = e.origin.kind === 'composer' || e.origin.kind === 'sdk' ? AUTO.exec(e.text) : null
    if (m?.[1]) $.ui.toast(await add($, m[1], false))
    return next(e)
  })

  on('command.run', { command: 'jam' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/).filter(Boolean)
    switch (sub) {
      case '':
      case 'list':
        return { text: listText() }
      case 'help':
        return { text: HELP }
      case 'global':
        return { text: await add($, rest.join(' '), true) }
      case 'forget': {
        const n = Number(rest[0])
        if (!Number.isInteger(n) || n < 1 || n > project.length + global.length) return { text: 'วิธีใช้: /jam forget 2  (ดูเลขจาก /jam list)' }
        let removed: Fact | undefined
        if (n <= project.length) [removed] = project.splice(n - 1, 1)
        else [removed] = global.splice(n - 1 - project.length, 1)
        project = [...project]
        global = [...global]
        await save($)
        return { text: `🗑️ ลืมแล้ว: ${removed?.text ?? ''}` }
      }
      case 'on':
      case 'off':
        enabled = sub === 'on'
        await $.store.set('enabled', enabled)
        await save($)
        return { text: enabled ? '🧠 แนบความจำให้ Claude แล้ว' : '😶 หยุดแนบความจำ (ยังเก็บไว้)' }
      case 'clear':
        if (rest[0] !== 'confirm') return { text: `ล้างความจำของโปรเจกต์นี้ ${project.length} ข้อ? พิมพ์ /jam clear confirm` }
        project = []
        await save($)
        return { text: '🧹 ล้างแล้ว' }
      case 'suggest': {
        // ==================================================================
        // บทที่ 5: ให้ Haiku เสนอ แล้วถามด้วยหน้าต่างเลือกของ Claude Code ($.ui.ask)
        // ==================================================================
        const messages = await $.session.messages()
        const convo = messages.filter(m => m.role === 'user').slice(-30).map(m => `- ${m.text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
        if (!convo) return { text: 'ยังไม่มีบทสนทนาให้อ่าน' }
        const system = 'อ่านข้อความของผู้ใช้ แล้วดึง "ความชอบหรือกฎที่คงทน" ที่ผู้ใช้อยากให้ทำตามในอนาคต เช่น เครื่องมือที่ใช้ สไตล์โค้ด ภาษาที่ตอบ ห้ามเอางานชั่วคราวหรือคำสั่งครั้งเดียว ตอบเป็นรายการ ภาษาไทย ไม่เกิน 4 ข้อ ข้อละบรรทัด ขึ้นต้นด้วย "- " สั้นไม่เกิน 80 ตัวอักษร ถ้าไม่มีให้ตอบ NONE'
        let suggestions: string[] = []
        for (const model of ['haiku', await $.session.model()]) {
          const r = await $.model.complete({ model, system, prompt: convo, maxTokens: 300 }).catch(() => undefined)
          if (r?.isAnswered) {
            suggestions = r.text.split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(l => l && l !== 'NONE').slice(0, 4)
            break
          }
        }
        const fresh = suggestions.filter(s => !project.some(f => f.text === s))
        if (fresh.length === 0) return { text: '🤔 ยังไม่เห็นเรื่องที่ควรจำเพิ่ม' }
        const picked = await $.ui.ask('อยากให้ Claude จำข้อไหนบ้าง?', fresh.length >= 2 ? { options: fresh, header: 'จำอะไรดี', multiSelect: true } : [fresh[0] ?? '', 'ไม่ต้องจำ']).catch(() => '')
        const chosen = fresh.filter(s => picked.split(', ').includes(s) || picked === s)
        if (chosen.length === 0) return { text: `💡 ข้อเสนอ:\n${fresh.map(s => `  - ${s}`).join('\n')}\nจดเองได้ด้วย /jam <ข้อความ>` }
        for (const s of chosen) await add($, s, false)
        return { text: `🧠 จำเพิ่ม ${chosen.length} ข้อ:\n${chosen.map(s => `  - ${s}`).join('\n')}` }
      }
      default:
        return { text: await add($, args, false) }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งออกความจำของโปรเจกต์เป็นไฟล์ CLAUDE.local.md
 * 2. ให้ความจำแต่ละข้อมีวันหมดอายุ (เช่น "สัปดาห์นี้ห้าม deploy")
 * 3. แยกความจำตาม branch ของ git
 */
