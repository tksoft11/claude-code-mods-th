/**
 * ============================================================================
 * MOD 33: Dev Exercise TH - ยืดเหยียดแก้ Office Syndrome ที่โต๊ะ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ท่ายืดเหยียดสำหรับคนทำงานออฟฟิศ
 *
 * หน้าที่ของ Mod นี้:
 * 1. ท่ายืดเหยียด 12 ท่า แยกตามส่วน: คอ บ่า ไหล่ หลัง ข้อมือ ตา ขา
 * 2. แผงพาทำ: บอกวิธีทีละท่า นับถอยหลัง แล้วไปท่าถัดไปเอง
 * 3. ชุดสำเร็จรูป: เร็ว 3 นาที, คอบ่าไหล่, ข้อมือ+ตา สำหรับคนพิมพ์เยอะ
 * 4. เตือนให้ลุกขยับทุกชั่วโมง และนับว่าวันนี้ทำไปกี่ท่า
 *
 * ⚠️ เป็นท่าทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ ถ้าเจ็บหรือชาให้หยุด และปรึกษาแพทย์/นักกายภาพ
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Move {
  id: string
  name: string
  area: string
  seconds: number
  steps: string
}

// ==========================================================================
// บทที่ 1: คลังท่า - ทำได้บนเก้าอี้ ไม่ต้องใช้อุปกรณ์
// ==========================================================================
const MOVES: Move[] = [
  { id: 'neck-tilt', name: 'เอียงคอ', area: 'คอ', seconds: 30, steps: 'นั่งหลังตรง เอียงหูซ้ายไปหาไหล่ซ้ายช้าๆ ค้าง 15 วิ แล้วสลับข้าง ไหล่ไม่ยกตาม' },
  { id: 'chin-tuck', name: 'เก็บคาง', area: 'คอ', seconds: 30, steps: 'มองตรง ดันคางถอยหลังเหมือนทำคางสองชั้น ค้าง 5 วิ ทำซ้ำ 5 ครั้ง แก้คอยื่น' },
  { id: 'shoulder-roll', name: 'หมุนไหล่', area: 'บ่า ไหล่', seconds: 30, steps: 'ยกไหล่ขึ้นหาหู หมุนไปด้านหลังเป็นวงกว้างช้าๆ 10 รอบ แล้วหมุนไปด้านหน้า 10 รอบ' },
  { id: 'shoulder-cross', name: 'ดึงแขนข้ามอก', area: 'บ่า ไหล่', seconds: 30, steps: 'เหยียดแขนขวาข้ามอก ใช้มือซ้ายดึงที่ข้อศอกเข้าหาตัว ค้าง 15 วิ แล้วสลับ' },
  { id: 'chest-open', name: 'เปิดอก', area: 'หลัง', seconds: 30, steps: 'ประสานมือไว้ด้านหลัง เหยียดแขนลง ดึงสะบักเข้าหากัน ยกอกขึ้น ค้าง 20 วิ' },
  { id: 'seated-twist', name: 'บิดตัวบนเก้าอี้', area: 'หลัง', seconds: 30, steps: 'นั่งหลังตรง บิดลำตัวไปทางขวา จับพนักเก้าอี้ ค้าง 15 วิ แล้วสลับ หายใจปกติ' },
  { id: 'cat-cow', name: 'โก่งหลัง-แอ่นหลัง', area: 'หลัง', seconds: 30, steps: 'มือวางบนเข่า หายใจเข้าแอ่นอกมองขึ้น หายใจออกโก่งหลังก้มคาง ทำช้าๆ 8 รอบ' },
  { id: 'wrist-flex', name: 'ยืดข้อมือ', area: 'ข้อมือ', seconds: 30, steps: 'เหยียดแขนตรง หงายมือ ใช้อีกมือดึงนิ้วลงหาตัว ค้าง 10 วิ แล้วคว่ำมือดึงลง ค้าง 10 วิ ทำสองข้าง' },
  { id: 'finger-spread', name: 'กาง-กำนิ้ว', area: 'ข้อมือ', seconds: 20, steps: 'กางนิ้วให้สุด 3 วิ แล้วกำมือแน่น 3 วิ ทำซ้ำ 10 ครั้ง' },
  { id: 'eye-20', name: 'พักตา 20-20-20', area: 'ตา', seconds: 20, steps: 'มองวัตถุที่ไกลประมาณ 6 เมตร (20 ฟุต) นาน 20 วินาที กะพริบตาบ่อยๆ' },
  { id: 'eye-roll', name: 'กลอกตา', area: 'ตา', seconds: 20, steps: 'หลับตา กลอกตาช้าๆ เป็นวงกลม 5 รอบ แล้วสลับทิศ' },
  { id: 'calf-raise', name: 'เขย่งปลายเท้า', area: 'ขา', seconds: 30, steps: 'ยืนจับโต๊ะ เขย่งปลายเท้าขึ้น-ลงช้าๆ 15 ครั้ง ช่วยการไหลเวียนเลือดที่ขา' },
]

const ROUTINES: Record<string, { name: string; moves: string[] }> = {
  quick: { name: 'เร็ว 3 นาที', moves: ['neck-tilt', 'shoulder-roll', 'chest-open', 'wrist-flex', 'eye-20', 'calf-raise'] },
  neck: { name: 'คอ บ่า ไหล่', moves: ['chin-tuck', 'neck-tilt', 'shoulder-roll', 'shoulder-cross', 'chest-open'] },
  typing: { name: 'ข้อมือ + ตา (พิมพ์เยอะ)', moves: ['wrist-flex', 'finger-spread', 'eye-20', 'eye-roll', 'shoulder-roll'] },
  back: { name: 'หลัง', moves: ['cat-cow', 'seated-twist', 'chest-open', 'calf-raise'] },
}

const PANE = 'dev-exercise-th'
let session: { moves: Move[]; index: number; endsAt: number } | undefined
let ticker: Timer | undefined
let reminder: Timer | undefined
let doneToday = { date: '', count: 0 }

const find = (id: string) => MOVES.find(m => m.id === id)

// ==========================================================================
// บทที่ 2: พาทำทีละท่า - timer ทุก 1 วิ หมดเวลาแล้วไปท่าถัดไป
// ==========================================================================
function stopSession(): void {
  ticker?.cancel()
  ticker = undefined
  session = undefined
}

async function countDone($: EngineInterface): Promise<void> {
  const today = new Date(await $.clock.now()).toDateString()
  doneToday = doneToday.date === today ? { date: today, count: doneToday.count + 1 } : { date: today, count: 1 }
  await $.store.set('done', doneToday)
}

async function tick($: EngineInterface): Promise<void> {
  if (!session) return
  const now = await $.clock.now()
  if (now >= session.endsAt) {
    await countDone($)
    session.index++
    const next = session.moves[session.index]
    if (!next) {
      $.ui.toast(`🎉 ครบ ${session.moves.length} ท่าแล้ว เก่งมาก!`)
      stopSession()
    } else {
      session.endsAt = now + next.seconds * 1000
      $.ui.toast(`➡️ ท่าถัดไป: ${next.name}`)
    }
  }
  $.ui.invalidate('ui.render')
}

async function startSession($: EngineInterface, moves: Move[]): Promise<void> {
  stopSession()
  session = { moves, index: 0, endsAt: (await $.clock.now()) + (moves[0]?.seconds ?? 30) * 1000 }
  ticker = $.clock.every(1000, () => void tick($))
  await $.ui.open({ id: PANE, title: '🧘 ยืดเหยียด', focus: true, closeOnEscape: true })
  $.ui.invalidate('ui.render')
}

const HELP = `🧘 Dev Exercise TH (Mod 33)
========================================
/exercise                 ชุดเร็ว 3 นาที (พาทำในแผง)
/exercise <ชุด>           ${Object.entries(ROUTINES).map(([k, r]) => `${k} = ${r.name}`).join(' | ')}
/exercise do <ท่า>        ทำท่าเดียว
/exercise list            ทุกท่า แยกตามส่วน
/exercise remind on [นาที] | off   เตือนลุกขยับ (ค่าเริ่มต้นทุก 60 นาที)
/exercise today           วันนี้ทำไปกี่ท่า
⚠️ ถ้าเจ็บหรือชาให้หยุด ไม่ใช่คำแนะนำทางการแพทย์`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('done')) as { date: string; count: number } | undefined
    doneToday = saved ?? { date: '', count: 0 }
    const minutes = (await $.store.get('remind')) as number | undefined
    if (minutes) reminder = $.clock.every(minutes * 60_000, () => $.ui.toast(`🧘 นั่งมา ${minutes} นาทีแล้ว ลุกขยับหน่อย /exercise`))
    await $.command.register({ name: 'exercise', description: 'ท่ายืดเหยียดแก้ Office Syndrome พาทำในแผง (/exercise help)', argumentHint: '[quick|neck|typing|back]|do|list|remind' })
    return next(e)
  })

  on('ui.close', ($, e, next) => {
    if (e.id === PANE) stopSession()
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แผงพาทำ - ชื่อท่า วิธีทำ นับถอยหลัง ปุ่มข้าม
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!session) return <Text dimColor>เริ่มด้วย /exercise</Text>
    const move = session.moves[session.index]
    if (!move) return <Text>🎉 ครบแล้ว</Text>
    const left = Math.max(0, Math.ceil((session.endsAt - (await $.clock.now())) / 1000))
    const bar = '█'.repeat(Math.round((left / move.seconds) * 20)).padEnd(20, '░')
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          ท่าที่ {session.index + 1}/{session.moves.length} · {move.area}
        </Text>
        <Text bold>{move.name}</Text>
        <Text>{move.steps}</Text>
        <Text color="#26a69a">
          {bar} {left} วิ
        </Text>
        <Button key="skip" hotkey="n" label="ข้ามท่า (n)" onPress={() => {
          if (session) session.endsAt = 0
          void tick($)
        }} />
      </Box>
    )
  })

  on('command.run', { command: 'exercise' }, async ($, e) => {
    const [sub = 'quick', a1, a2] = e.args.trim().split(/\s+/).filter(Boolean)
    const routine = ROUTINES[sub]
    if (routine) {
      const moves = routine.moves.map(find).filter((m): m is Move => Boolean(m))
      await startSession($, moves)
      return { text: `🧘 เริ่มชุด "${routine.name}" ${moves.length} ท่า รวม ${moves.reduce((s, m) => s + m.seconds, 0)} วินาที ดูในแผงได้เลย (กด n เพื่อข้าม, Esc เพื่อหยุด)` }
    }
    switch (sub) {
      case 'do': {
        const m = find(a1 ?? '')
        if (!m) return { text: `ไม่มีท่า "${a1 ?? ''}" ดูรายการด้วย /exercise list` }
        await startSession($, [m])
        return { text: `🧘 ${m.name} ${m.seconds} วิ\n${m.steps}` }
      }
      case 'list': {
        const areas = [...new Set(MOVES.map(m => m.area))]
        return { text: areas.map(a => `${a}\n${MOVES.filter(m => m.area === a).map(m => `  ${m.id.padEnd(15)} ${m.name} (${m.seconds} วิ)`).join('\n')}`).join('\n') }
      }
      case 'remind': {
        reminder?.cancel()
        reminder = undefined
        if (a1 === 'off') {
          await $.store.delete('remind')
          return { text: '🔕 ปิดการเตือนแล้ว' }
        }
        const minutes = Math.min(180, Math.max(15, Number(a2) || 60))
        reminder = $.clock.every(minutes * 60_000, () => $.ui.toast(`🧘 นั่งมา ${minutes} นาทีแล้ว ลุกขยับหน่อย /exercise`))
        await $.store.set('remind', minutes)
        return { text: `🔔 จะเตือนให้ลุกขยับทุก ${minutes} นาที` }
      }
      case 'today': {
        const today = new Date(await $.clock.now()).toDateString()
        return { text: `📊 วันนี้ทำไป ${doneToday.date === today ? doneToday.count : 0} ท่า` }
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
 * 1. เตือนอัตโนมัติเมื่อ Claude ทำงานยาว (ระหว่างรอ ลุกยืดเส้นได้พอดี): ดัก turn.start
 * 2. ใช้ $.audio.speak อ่านขั้นตอนให้ฟัง จะได้ไม่ต้องมองจอ
 * 3. สรุปรายสัปดาห์ว่ายืดเหยียดไปกี่ท่า
 */
