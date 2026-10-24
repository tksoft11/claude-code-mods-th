/**
 * ============================================================================
 * MOD 94: Quick Prefix TH - สัญลักษณ์นำหน้า prompt เปลี่ยนโหมดเฉพาะรอบนั้น (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: think-hard, use-haiku และ thrift ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้: พิมพ์สัญลักษณ์นำหน้า prompt แล้วรอบนั้นรอบเดียวเปลี่ยนโหมด
 *   +  คิดเต็มที่ (effort สูงสุด) สำหรับงานยาก เช่น "+ ออกแบบ schema ใหม่"
 *   _  ใช้ Haiku เร็วและถูก สำหรับงานง่าย เช่น "_ เปลี่ยนชื่อตัวแปรนี้"
 *   ~  โหมดประหยัด: effort ต่ำ และบอก Claude ให้อ่านเฉพาะที่จำเป็น ตอบสั้น
 * รอบถัดไปกลับเป็นค่าเดิมของ session เอง ไม่ต้องสลับ /model ไปมา
 *
 * (ไม่ใช้ ! เพราะ Claude Code ใช้ ! นำหน้าเป็นโหมด shell อยู่แล้ว)
 */

import type { Register } from 'claude-code'

type Mode = 'max' | 'haiku' | 'thrift'

const MODES: Record<string, { mode: Mode; label: string; color: string }> = {
  '+': { mode: 'max', label: '🧠 คิดเต็มที่', color: '#ab47bc' },
  _: { mode: 'haiku', label: '⚡ Haiku', color: '#4fc3f7' },
  '~': { mode: 'thrift', label: '🪙 ประหยัด', color: '#7cb342' },
}

// turn.step ส่งชื่อ model ถึง API ตรงๆ จึงต้องใช้ id เต็ม (alias "haiku" ได้ 404)
const HAIKU_ID = 'claude-haiku-5-5'

const THRIFT_NOTE = 'Quick Prefix (โหมดประหยัด): รอบนี้ให้ทำแบบประหยัด อ่านเฉพาะส่วนของไฟล์ที่จำเป็น (ใช้ offset/limit หรือ grep) ไม่สำรวจเกินงาน ไม่รันคำสั่งที่ไม่จำเป็น และตอบสั้นที่สุดที่ยังครบถ้วน'

let pending: Mode | undefined
let current: { turnId: string; mode: Mode } | undefined
let counts: Record<Mode, number> = { max: 0, haiku: 0, thrift: 0 }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    pending = undefined
    current = undefined
    counts = { max: 0, haiku: 0, thrift: 0 }
    await $.command.register({ name: 'prefix', description: 'สัญลักษณ์นำหน้า prompt: + คิดเต็มที่, _ Haiku, ~ ประหยัด (รอบเดียว)' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 1: อ่านสัญลักษณ์แล้วตัดออกจาก prompt
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    const m = /^([+_~])\s*([\s\S]+)$/.exec(e.text)
    const def = m ? MODES[m[1]!] : undefined
    if (e.origin.kind === 'plugin' || !m || !def) return next(e)
    pending = def.mode
    counts[def.mode]++
    const context = def.mode === 'thrift' ? [...(e.context ?? []), THRIFT_NOTE] : e.context
    return next({ ...e, text: m[2]!, context })
  })

  // ==========================================================================
  // บทที่ 2: ผูกโหมดกับ turn ที่เพิ่งเริ่ม
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      current = pending ? { turnId: e.turnId, mode: pending } : undefined
      pending = undefined
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: เปลี่ยน model / effort ของทุกคำขอใน turn นั้น
  // ==========================================================================
  // turn.step เป็น event แบบสตรีม: hook เป็น async generator ส่งต่อทุกชิ้นด้วย yield*
  on('turn.step', async function* ($, e, next) {
    if (!current || e.agentId || e.turnId !== current.turnId) return yield* next(e)
    if (current.mode === 'haiku') return yield* next({ ...e, model: HAIKU_ID })
    if (current.mode === 'max') return yield* next({ ...e, effort: 'max' })
    return yield* next({ ...e, effort: 'low' })
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && current?.turnId === e.turnId) {
      current = undefined
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // ==========================================================================
  // บทที่ 4: บอกว่ารอบนี้อยู่โหมดไหน
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!current || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const def = Object.values(MODES).find(d => d.mode === current?.mode)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text color={def?.color}>{`${def?.label ?? ''} · เฉพาะรอบนี้`}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'prefix' }, async () => ({
    text: `⚡ Quick Prefix TH (Mod 94)
พิมพ์นำหน้า prompt (มีผลรอบเดียว):
  +  คิดเต็มที่ (effort max)     ใช้ไป ${counts.max} ครั้ง
  _  ใช้ Haiku เร็ว ถูก           ใช้ไป ${counts.haiku} ครั้ง
  ~  ประหยัด (effort ต่ำ ตอบสั้น)  ใช้ไป ${counts.thrift} ครั้ง
ตัวอย่าง: "+ ออกแบบระบบ cache ใหม่"  "_ แก้คำผิดใน README"`,
  }))
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ระบายสีสัญลักษณ์ในช่องพิมพ์ตอนพิมพ์ ด้วย decorations ของ prompt.edit
 * 2. เพิ่ม = สำหรับ Sonnet และ * สำหรับ Opus
 * 3. ให้ Haiku เดาเองว่างานยากแค่ไหน แล้วเลือกโหมดให้อัตโนมัติ
 */
