/**
 * ============================================================================
 * MOD 11: Sweet Alert TH - Alert สวยๆ แบบ SweetAlert (ฉบับสอนทำ)
 * ============================================================================
 * Mod ของเราเอง: ทำ SweetAlert ใน Claude Code
 *
 * หน้าที่ของ Mod นี้:
 * 1. /alert แสดง dialog กลางจอ ขอบสีตามประเภท: success, error, warning, info, question, loading
 * 2. /confirm ถามยืนยัน มีปุ่ม "ใช่" กับ "ยกเลิก" ให้กดจริง
 * 3. /prompt ให้กรอกข้อมูลในช่อง Input แล้วกด Enter
 * 4. /toast แจ้งเตือนเล็กๆ มุมจอ
 * 5. มีคิว: สั่งหลาย alert ติดกัน จะแสดงทีละอันตามลำดับ
 * 6. ปิดอัตโนมัติได้ + เก็บประวัติว่าแต่ละ alert ถูกตอบว่าอะไร
 * 7. tool ที่สำคัญล้มเหลว (Bash/Edit/Write) จะเด้ง toast เตือนเอง
 *
 * แนวคิดสำคัญ:
 * - Mod วาด HTML/CSS ไม่ได้ แต่วาด element ของ Claude Code ได้: Box (มีขอบสี), Text, Button, Input
 * - เปิดแผงแบบ dialog ด้วย $.ui.open({ focus, closeOnEscape, holdToasts })
 * - ปุ่มมี onPress, ช่องกรอกมี onSubmit -> นี่คือการ "จัดการ event" เมื่อผู้ใช้กด
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question' | 'loading'
type AlertKind = 'alert' | 'confirm' | 'prompt'
type AlertResult = 'confirm' | 'cancel' | 'timeout'

interface SweetAlert {
  id: number
  kind: AlertKind
  type: AlertType
  title: string
  message: string
  time: number
  autoCloseMs?: number // ปิดอัตโนมัติหลังกี่ ms (ไม่ใส่ = รอให้กด)
  confirmText: string
  cancelText?: string // มีค่า = แสดงปุ่มยกเลิก
  result?: AlertResult
  value?: string // ค่าที่กรอก (เฉพาะ prompt)
}

type AlertOptions = Partial<Pick<SweetAlert, 'autoCloseMs' | 'confirmText' | 'cancelText'>>

const PANE = 'sweet-alert-th'

// ==========================================================================
// บทที่ 1: หน้าตาของแต่ละประเภท (ไอคอน + สี + หัวข้อเริ่มต้น)
// ==========================================================================
const STYLE: Record<AlertType, { icon: string; color: string; title: string }> = {
  success: { icon: '✅', color: '#2ee6a6', title: 'สำเร็จ!' },
  error: { icon: '❌', color: '#ff7b72', title: 'เกิดข้อผิดพลาด!' },
  warning: { icon: '⚠️', color: '#ffca28', title: 'คำเตือน!' },
  info: { icon: 'ℹ️', color: '#4fc3f7', title: 'ข้อมูล' },
  question: { icon: '❓', color: '#a371f7', title: 'คำถาม' },
  loading: { icon: '⏳', color: '#8b949e', title: 'กำลังโหลด...' },
}
const TYPES = Object.keys(STYLE) as AlertType[]
const TOAST_TYPES: AlertType[] = ['success', 'error', 'warning', 'info']

// ==========================================================================
// บทที่ 2: state - alert ที่แสดงอยู่, คิวที่รอ, และประวัติ
// ==========================================================================
let current: SweetAlert | undefined
let queue: SweetAlert[] = []
let history: SweetAlert[] = []
let nextId = 0
let autoCloseTimer: Timer | undefined
let isPanePlaced = true // false = เปิดแผงไม่ได้ (เช่นรันแบบ claude -p) -> ตอบด้วย /alert answer แทน

async function createAlert($: EngineInterface, kind: AlertKind, type: AlertType, title: string, message: string, options: AlertOptions = {}): Promise<SweetAlert> {
  const alert: SweetAlert = {
    id: nextId++,
    kind,
    type,
    title,
    message,
    time: await $.clock.now(),
    confirmText: options.confirmText ?? 'ตกลง',
    cancelText: options.cancelText,
    autoCloseMs: options.autoCloseMs,
  }
  history = [...history, alert].slice(-50) // เก็บแค่ 50 อันหลังสุด
  queue.push(alert)
  if (!current) await showNext($)
  return alert
}

// ==========================================================================
// บทที่ 3: ระบบคิว - หยิบ alert ถัดไปมาแสดง
// ==========================================================================
async function showNext($: EngineInterface): Promise<void> {
  autoCloseTimer?.cancel()
  autoCloseTimer = undefined
  current = queue.shift()

  if (!current) {
    await $.ui.close({ id: PANE })
    return
  }

  // dialog: รับคีย์บอร์ด, Esc ปิดได้, toast รอจนกว่า dialog จะปิด
  const opened = await $.ui.open({ id: PANE, title: '🎨 Sweet Alert', focus: true, closeOnEscape: true, holdToasts: true })
  isPanePlaced = opened.isPlaced
  $.ui.invalidate('ui.render')

  const shown = current
  if (shown.autoCloseMs) {
    // timer ทำงานแบบ sync จึงห่อ async ด้วย void
    autoCloseTimer = $.clock.after(shown.autoCloseMs, () => void resolveAlert($, shown, 'timeout'))
  }
}

// ==========================================================================
// บทที่ 4: จัดการ event เมื่อผู้ใช้ตอบ (กดปุ่ม, กรอกข้อมูล, Esc, หมดเวลา)
// ==========================================================================
async function resolveAlert($: EngineInterface, alert: SweetAlert, result: AlertResult, value?: string): Promise<void> {
  if (alert !== current || alert.result) return // ตอบไปแล้ว หรือไม่ใช่อันที่แสดงอยู่
  alert.result = result
  alert.value = value

  // ผลลัพธ์ของ confirm / prompt -> แจ้งผลด้วย toast หรือ alert ต่อ
  if (alert.kind === 'confirm') {
    $.ui.toast(result === 'confirm' ? `✅ ยืนยันแล้ว: ${alert.message}` : `❌ ยกเลิก: ${alert.message}`)
  }
  if (alert.kind === 'prompt' && result === 'confirm') {
    queue.unshift({ ...alert, id: nextId++, kind: 'alert', type: 'success', title: 'ได้รับข้อมูลแล้ว!', message: `ค่าที่กรอก: ${value || '(ว่าง)'}`, result: undefined, value: undefined, cancelText: undefined, confirmText: 'ตกลง', autoCloseMs: 3000 })
  }

  await showNext($)
}

function describe(a: SweetAlert): string {
  const status = a.result === 'confirm' ? (a.kind === 'prompt' ? `✅ ได้ค่า "${a.value ?? ''}"` : '✅ ยืนยัน') : a.result === 'cancel' ? '❌ ยกเลิก' : a.result === 'timeout' ? '⌛ ปิดเอง' : '⏳ รอ'
  return `${STYLE[a.type].icon} [${a.id}] ${a.title} - ${a.message.slice(0, 50)} ${status}`
}

// แยก "หัวข้อ | ข้อความ" (ถ้าไม่มี | ใช้หัวข้อเริ่มต้นของประเภทนั้น)
function splitTitle(type: AlertType, text: string): [string, string] {
  if (!text.includes('|')) return [STYLE[type].title, text || STYLE[type].title]
  const [title = '', ...rest] = text.split('|')
  return [title.trim(), rest.join('|').trim()]
}

const HELP = `🎨 Sweet Alert TH (Mod 11)
========================================
/alert <type> <ข้อความ>
/alert <type> <หัวข้อ> | <ข้อความ>
   type: success, error, warning, info, question, loading
/alert demo       ดูตัวอย่างทุกแบบ (แสดงต่อกันตามคิว)
/alert history    ประวัติและผลการตอบ
/alert answer <yes|no|ข้อความ>  ตอบ alert ที่ค้างอยู่ด้วยคำสั่ง
/alert clear      ล้างทั้งหมด

/confirm <คำถาม>         ถามยืนยัน ใช่/ยกเลิก
/prompt <คำถาม>          ให้กรอกข้อมูล
/toast <type> <ข้อความ>  แจ้งเตือนเล็กๆ มุมจอ

ใน dialog: Tab เลื่อนปุ่ม, Enter กด, Esc ปิด (= ยกเลิก)`

function pendingNote(): string {
  return isPanePlaced ? '' : '\n(เปิด dialog ไม่ได้ในหน้าจอนี้: ตอบด้วย /alert answer yes|no|ข้อความ)'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    current = undefined
    queue = []
    history = []
    await $.command.register({ name: 'alert', description: 'แสดง Sweet Alert (/alert help)', argumentHint: '<type> [หัวข้อ |] ข้อความ' })
    await $.command.register({ name: 'confirm', description: 'ถามยืนยัน ใช่/ยกเลิก ใน dialog', argumentHint: '<คำถาม>' })
    await $.command.register({ name: 'prompt', description: 'ให้กรอกข้อมูลใน dialog', argumentHint: '<คำถาม>' })
    await $.command.register({ name: 'toast', description: 'แจ้งเตือนเล็กๆ มุมจอ', argumentHint: '<type> <ข้อความ>' })
    return next(e)
  })

  // tool สำคัญล้มเหลว -> toast เตือน (ไม่สแปมกับ tool อ่านไฟล์)
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError && (e.tool === 'Bash' || e.tool === 'Edit' || e.tool === 'Write')) {
      $.ui.toast(`❌ ${e.tool} ล้มเหลว: ${(ran.text ?? '').split('\n')[0]?.slice(0, 80) ?? ''}`)
    }
    return ran
  })

  // ผู้ใช้กด Esc หรือปุ่มปิดของแผง = ยกเลิก alert ที่แสดงอยู่ และทิ้งคิวที่เหลือ
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person' && current) {
      const closing = current
      queue = []
      closing.result = 'cancel'
      current = undefined
      autoCloseTimer?.cancel()
      if (closing.kind === 'confirm') $.ui.toast(`❌ ยกเลิก: ${closing.message}`)
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: วาด dialog - Box ขอบสี + ไอคอน + หัวข้อ + ข้อความ + ปุ่ม/ช่องกรอก
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const alert = current
    if (!alert) return <Text dimColor>ไม่มี alert</Text>

    const style = STYLE[alert.type]
    // mobile ไม่มี Input -> เช็คก่อนใช้
    const Input = 'Input' in elements ? elements.Input : undefined
    const isPrompt = alert.kind === 'prompt'

    return (
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor={style.color} paddingX={2} paddingY={1}>
        <Text>{style.icon}</Text>
        <Text bold color={style.color}>
          {alert.title}
        </Text>
        <Text>{alert.message}</Text>
        {isPrompt && Input && (
          <Input key="value" placeholder="พิมพ์แล้วกด Enter" autoFocus onSubmit={value => void resolveAlert($, alert, 'confirm', value)} />
        )}
        {isPrompt && !Input && <Text dimColor>หน้าจอนี้กรอกข้อมูลไม่ได้ ใช้ /alert answer ข้อความ</Text>}
        <Box gap={2}>
          {alert.cancelText && <Button key="cancel" label={alert.cancelText} hotkey="n" onPress={() => void resolveAlert($, alert, 'cancel')} />}
          {!isPrompt && <Button key="confirm" label={alert.confirmText} hotkey="y" variant="primary" autoFocus onPress={() => void resolveAlert($, alert, 'confirm')} />}
        </Box>
        {alert.autoCloseMs !== undefined && <Text dimColor>ปิดอัตโนมัติใน {alert.autoCloseMs / 1000} วินาที</Text>}
        {queue.length > 0 && <Text dimColor>รออยู่ในคิวอีก {queue.length} อัน</Text>}
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 6: คำสั่ง /alert
  // ==========================================================================
  on('command.run', { command: 'alert' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = 'help', ...restWords] = args.split(/\s+/)
    const rest = restWords.join(' ')

    if (sub === 'help') return { text: HELP }

    if (sub === 'history') {
      return { text: history.length ? [`🎨 ประวัติ Sweet Alert (${history.length})`, ...[...history].reverse().slice(0, 15).map(describe)].join('\n') : 'ยังไม่มี alert ลอง /alert demo' }
    }

    if (sub === 'clear') {
      queue = []
      history = []
      if (current) {
        current = undefined
        await showNext($) // คิวว่าง -> ปิดแผง
      }
      return { text: '🗑️ ล้าง alert ทั้งหมดแล้ว' }
    }

    if (sub === 'answer') {
      // alert ธรรมดาที่ขวางหน้าคิวอยู่ ให้กดตกลงไปก่อน จะได้ตอบคำถามที่รออยู่จริงๆ
      while (current?.kind === 'alert') await resolveAlert($, current, 'confirm')
      if (!current) return { text: 'ไม่มีคำถามที่รอคำตอบ' }
      const alert = current
      if (alert.kind === 'prompt') await resolveAlert($, alert, rest ? 'confirm' : 'cancel', rest)
      else await resolveAlert($, alert, /^(no|n|ไม่)$/i.test(rest) ? 'cancel' : 'confirm')
      return { text: describe(alert) }
    }

    if (sub === 'demo') {
      await createAlert($, 'alert', 'success', 'สำเร็จ!', 'ไฟล์ถูกบันทึกเรียบร้อยแล้ว', { autoCloseMs: 2500 })
      await createAlert($, 'alert', 'error', 'เกิดข้อผิดพลาด!', 'ไม่สามารถเชื่อมต่อ database ได้', { autoCloseMs: 2500 })
      await createAlert($, 'alert', 'warning', 'คำเตือน!', 'ไฟล์นี้มีขนาดใหญ่กว่า 10MB', { autoCloseMs: 2500 })
      await createAlert($, 'alert', 'info', 'ข้อมูล', 'มี 5 ไฟล์ที่ถูกแก้ไขใน session นี้', { autoCloseMs: 2500 })
      await createAlert($, 'confirm', 'question', 'ยืนยันไหม?', 'คุณชอบ Mod นี้ไหม?', { confirmText: 'ชอบ!', cancelText: 'เฉยๆ' })
      return { text: `🎨 เริ่ม demo 5 แบบ (แสดงต่อกันตามคิว)${pendingNote()}` }
    }

    if (TYPES.includes(sub as AlertType)) {
      const type = sub as AlertType
      const [title, message] = splitTitle(type, rest)
      const kind: AlertKind = type === 'question' ? 'confirm' : 'alert'
      await createAlert($, kind, type, title, message, {
        autoCloseMs: type === 'loading' || type === 'question' ? undefined : 5000,
        cancelText: type === 'question' ? 'ยกเลิก' : undefined,
      })
      return { text: `${STYLE[type].icon} ${title}: ${message}${pendingNote()}` }
    }

    return { text: `❌ ไม่รู้จัก "${sub}" ใช้ได้: ${TYPES.join(', ')}\n/alert help เพื่อดูวิธีใช้` }
  })

  on('command.run', { command: 'confirm' }, async ($, e) => {
    const message = e.args.trim() || 'คุณแน่ใจไหม?'
    await createAlert($, 'confirm', 'question', 'ยืนยัน?', message, { confirmText: 'ใช่, ทำเลย', cancelText: 'ยกเลิก' })
    return { text: `❓ ${message}${pendingNote()}` }
  })

  on('command.run', { command: 'prompt' }, async ($, e) => {
    const message = e.args.trim() || 'กรุณากรอกข้อมูล:'
    await createAlert($, 'prompt', 'question', 'กรอกข้อมูล', message, { confirmText: 'ส่ง', cancelText: 'ยกเลิก' })
    return { text: `📝 ${message}${pendingNote()}` }
  })

  // ==========================================================================
  // บทที่ 7: /toast - ใช้ $.ui.toast ของ Claude Code ตรงๆ
  // ==========================================================================
  on('command.run', { command: 'toast' }, async ($, e) => {
    const [first = '', ...restWords] = e.args.trim().split(/\s+/)
    const hasType = TOAST_TYPES.includes(first as AlertType)
    const type: AlertType = hasType ? (first as AlertType) : 'info'
    const message = hasType ? restWords.join(' ') : e.args.trim()
    if (!message) return { text: 'วิธีใช้: /toast success บันทึกแล้ว! (type: success, error, warning, info)' }

    $.ui.toast(`${STYLE[type].icon} ${message}`, { timeoutMs: 3000 })
    return { text: `🍞 ${STYLE[type].icon} ${message}` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ทำ Progress Alert: เก็บเปอร์เซ็นต์ใน alert แล้วอัปเดตด้วย $.ui.invalidate ทุกครั้งที่เปลี่ยน
 * 2. เพิ่มเสียง: $.audio.play({ asset }) ด้วยไฟล์เสียงในโฟลเดอร์ของ Mod
 * 3. ทำเป็นด่านยืนยันก่อนทำอะไรอันตราย: ดัก tool.call ของ Bash ที่มี "git push"
 *    แล้วใช้ $.ui.ask("จะ push จริงไหม?", ["ใช่", "ไม่"]) ก่อนเรียก next(e)
 * 4. ส่ง alert สำคัญเป็น notification ของระบบด้วย $.ui.notify(...)
 */
