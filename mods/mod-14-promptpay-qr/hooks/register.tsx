/**
 * ============================================================================
 * MOD 14: PromptPay QR TH - สร้าง QR พร้อมเพย์ที่สแกนจ่ายได้จริง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: promptpay-qr (https://github.com/dtinth/promptpay-qr) และมาตรฐาน Thai QR Payment
 *
 * หน้าที่ของ Mod นี้:
 * 1. /qr 0812345678 100 สร้าง QR พร้อมเพย์จากเบอร์โทร (หรือบัตรประชาชน / e-Wallet)
 * 2. แสดง QR ที่สแกนได้จริงในแผงด้านข้าง (ดำบนพื้นขาว)
 * 3. ส่งออกเป็น SVG เอาไปพิมพ์แปะหน้าร้านได้
 * 4. ตรวจเบอร์และเลขบัตรประชาชน (มี check digit) ก่อนสร้าง
 *
 * ไฟล์ในโฟลเดอร์ hooks:
 * - promptpay.ts : สร้าง payload ตามมาตรฐาน EMVCo + CRC16
 * - qr.ts        : แปลง payload เป็นภาพ QR (เขียนเองทั้งหมด เพราะ Mod ใช้ npm ไม่ได้)
 * - register.tsx : คำสั่ง /qr และการวาดแผง (ไฟล์นี้)
 */

import type { EngineInterface, Register } from 'claude-code'

import { buildPayload, digitsOnly, isValidPhone, isValidThaiId, kindOf } from './promptpay'
import type { TargetKind } from './promptpay'
import { encodeQR, qrToLines, qrToSvg } from './qr'

interface SavedQR {
  id: number
  kind: TargetKind
  target: string // ตัวเลขล้วน
  amount?: number
  name?: string
  payload: string
  createdAt: number
}

const PANE = 'promptpay-qr-th'
const PROMPTPAY_BLUE = '#1a3c6e'
const KIND_TH: Record<TargetKind, string> = { phone: '📱 เบอร์โทร', id: '🪪 บัตรประชาชน', wallet: '💳 e-Wallet' }

// ==========================================================================
// บทที่ 1: เก็บ QR ที่สร้างไว้ใน $.store (จำข้าม session)
// ==========================================================================
let saved: SavedQR[] = []
let nextId = 0
let showingId: number | undefined
let projectRoot = ''

async function persist($: EngineInterface): Promise<void> {
  await $.store.set('qrs', { saved, nextId })
}

// ซ่อนเลขบางส่วนเวลาแสดง (ไม่ให้คนที่มองจอเห็นเลขบัตรเต็มๆ)
function masked(q: SavedQR): string {
  if (q.kind === 'phone') return q.target.replace(/^(\d{3})(\d{3})(\d+)$/, '$1-$2-$3')
  return q.target.slice(0, 1) + 'x'.repeat(q.target.length - 5) + q.target.slice(-4)
}

const baht = (n: number) => `฿${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function describe(q: SavedQR): string {
  return `#${q.id} ${KIND_TH[q.kind]} ${masked(q)} ${q.amount ? baht(q.amount) : '(ไม่ระบุยอด)'}${q.name ? ` - ${q.name}` : ''}`
}

// ==========================================================================
// บทที่ 2: ตรวจข้อมูลก่อนสร้าง (เบอร์, เลขบัตร, ยอดเงิน)
// ==========================================================================
function checkTarget(kind: TargetKind, target: string): string | undefined {
  if (kind === 'id' && !isValidThaiId(target)) return 'เลขบัตรประชาชนไม่ถูกต้อง (check digit ไม่ตรง)'
  if (kind === 'wallet' && target.length !== 15) return 'เลข e-Wallet ต้องมี 15 หลัก'
  if (kind === 'phone' && !isValidPhone(target)) return 'เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)'
  return undefined
}

// รับ "100", "1,500.50" -> ตัวเลข; ไม่ใช่ตัวเลขบวกที่ทศนิยมไม่เกิน 2 ตำแหน่ง -> undefined
function parseAmount(text: string | undefined): number | undefined {
  if (!text) return undefined
  const clean = text.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined
  const value = Number(clean)
  return value > 0 && value <= 9_999_999 ? value : undefined
}

// ==========================================================================
// บทที่ 3: สร้าง QR แล้วเปิดแผงให้ดู
// ==========================================================================
async function create($: EngineInterface, kind: TargetKind, rawTarget: string, rest: string[]): Promise<{ text: string }> {
  const target = digitsOnly(rawTarget)
  const problem = checkTarget(kind, target)
  if (problem) return { text: `❌ ${problem}` }

  // คำแรกที่เป็นตัวเลข = ยอดเงิน, ที่เหลือ = ชื่อร้าน
  const amount = parseAmount(rest[0])
  if (rest[0] && amount === undefined && /^[\d.,]+$/.test(rest[0])) return { text: `❌ ยอดเงิน "${rest[0]}" ไม่ถูกต้อง (ทศนิยมได้ไม่เกิน 2 ตำแหน่ง)` }
  const name = (amount === undefined ? rest : rest.slice(1)).join(' ') || undefined

  const q: SavedQR = { id: nextId++, kind, target, amount, name, payload: buildPayload(target, amount), createdAt: await $.clock.now() }
  saved = [...saved, q].slice(-30)
  await persist($)
  return show($, q, '✅ สร้าง QR แล้ว')
}

async function show($: EngineInterface, q: SavedQR, title: string): Promise<{ text: string }> {
  showingId = q.id
  const opened = await $.ui.open({ id: PANE, title: '💸 PromptPay QR' })
  $.ui.invalidate('ui.render')
  const note = opened.isPlaced ? 'ดู QR ในแผงด้านข้าง' : `เปิดแผงไม่ได้ ใช้ /qr export ${q.id} เพื่อได้ไฟล์ SVG`
  return { text: `${title}: ${describe(q)}\n${note} | /qr export ${q.id} = ไฟล์ SVG สำหรับพิมพ์` }
}

function findQR(arg: string | undefined): SavedQR | undefined {
  return saved.find(q => q.id === Number(arg))
}

const HELP = `💸 PromptPay QR TH (Mod 14)
========================================
สร้าง:
  /qr <เบอร์โทร> [ยอด] [ชื่อร้าน]        เช่น /qr 0812345678 100 ร้านส้มตำ
  /qr id <เลขบัตร 13 หลัก> [ยอด] [ชื่อ]
  /qr wallet <เลข 15 หลัก> [ยอด] [ชื่อ]
  ไม่ใส่ยอด = ลูกค้ากรอกยอดเองตอนสแกน

จัดการ:
  /qr list | show <id> | payload <id> | export <id> | delete <id> | clear
  /qr validate <เบอร์หรือเลขบัตร>
  /qr demo`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    const stored = (await $.store.get('qrs')) as { saved?: SavedQR[]; nextId?: number } | undefined
    saved = stored?.saved ?? []
    nextId = stored?.nextId ?? 0
    await $.command.register({ name: 'qr', description: 'สร้าง QR พร้อมเพย์ (/qr help)', argumentHint: '<เบอร์> [ยอด] [ชื่อร้าน]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: วาด QR ในแผง - ดำบนพื้นขาวเสมอ (ไม่ขึ้นกับธีมของ terminal) ไม่งั้นกล้องอ่านไม่ออก
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const q = showingId === undefined ? undefined : findQR(String(showingId))
    if (!q) return <Text dimColor>ยังไม่มี QR สร้างด้วย /qr 0812345678 100</Text>

    const lines = qrToLines(encodeQR(q.payload), 2)
    return (
      <Box flexDirection="column" alignItems="center">
        <Box backgroundColor={PROMPTPAY_BLUE} paddingX={2}>
          <Text color="#ffffff" bold>
            PromptPay พร้อมเพย์
          </Text>
        </Box>
        <Box flexDirection="column" backgroundColor="#ffffff" paddingX={1}>
          {lines.map(line => (
            <Text color="#000000" backgroundColor="#ffffff">
              {line}
            </Text>
          ))}
        </Box>
        {q.name && <Text bold>{q.name}</Text>}
        <Text>
          {KIND_TH[q.kind]} {masked(q)}
        </Text>
        <Text bold color="#06c755">
          {q.amount ? baht(q.amount) : 'ลูกค้ากรอกยอดเอง'}
        </Text>
        <Text dimColor>#{q.id} · /qr export {q.id} เพื่อพิมพ์</Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /qr
  // ==========================================================================
  on('command.run', { command: 'qr' }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const [sub = 'help', ...rest] = words

    switch (sub) {
      case 'help':
        return { text: HELP }
      case 'id':
        return rest[0] ? create($, 'id', rest[0], rest.slice(1)) : { text: 'วิธีใช้: /qr id <เลขบัตร 13 หลัก> [ยอด] [ชื่อ]' }
      case 'wallet':
        return rest[0] ? create($, 'wallet', rest[0], rest.slice(1)) : { text: 'วิธีใช้: /qr wallet <เลข 15 หลัก> [ยอด] [ชื่อ]' }
      case 'list':
        return { text: saved.length ? ['💸 QR ที่สร้างไว้', ...saved.map(q => `  ${describe(q)}`)].join('\n') : 'ยังไม่มี QR ลอง /qr demo' }
      case 'show': {
        const q = findQR(rest[0])
        return q ? show($, q, '💸 แสดง QR') : { text: `❌ ไม่พบ QR #${rest[0] ?? ''}` }
      }
      case 'payload': {
        const q = findQR(rest[0])
        return q ? { text: `Payload ของ QR #${q.id} (เอาไปสร้าง QR ด้วยโปรแกรมอื่นได้)\n${q.payload}` } : { text: `❌ ไม่พบ QR #${rest[0] ?? ''}` }
      }
      case 'export': {
        const q = findQR(rest[0])
        if (!q) return { text: `❌ ไม่พบ QR #${rest[0] ?? ''}` }
        const sep = projectRoot.includes('\\') ? '\\' : '/'
        const base = `${projectRoot}${sep}promptpay-${q.id}`
        await $.fs.write(`${base}.svg`, qrToSvg(encodeQR(q.payload)))
        await $.fs.write(`${base}.txt`, `${describe(q)}\nPayload: ${q.payload}\n`)
        return { text: `💾 บันทึกแล้ว:\n  ${base}.svg (เปิดใน browser แล้วพิมพ์ได้)\n  ${base}.txt` }
      }
      case 'validate': {
        const target = digitsOnly(rest[0] ?? '')
        if (!target) return { text: 'วิธีใช้: /qr validate <เบอร์หรือเลขบัตร>' }
        const kind = kindOf(target)
        const problem = checkTarget(kind, target)
        return { text: problem ? `❌ ${KIND_TH[kind]}: ${problem}` : `✅ ${KIND_TH[kind]} ถูกต้อง` }
      }
      case 'delete': {
        const q = findQR(rest[0])
        if (!q) return { text: `❌ ไม่พบ QR #${rest[0] ?? ''}` }
        saved = saved.filter(x => x !== q)
        await persist($)
        if (showingId === q.id) showingId = undefined
        $.ui.invalidate('ui.render')
        return { text: `🗑️ ลบ QR #${q.id} แล้ว` }
      }
      case 'clear':
        saved = []
        showingId = undefined
        await persist($)
        $.ui.invalidate('ui.render')
        return { text: '🗑️ ลบ QR ทั้งหมดแล้ว' }
      case 'demo': {
        // เบอร์ 0812345678 เป็นเบอร์ตัวอย่าง: สแกนได้ แต่อย่าโอนเงินจริง
        await create($, 'phone', '0812345678', [])
        return create($, 'phone', '0812345678', ['100', 'ร้านตัวอย่าง (ห้ามโอนจริง)'])
      }
      default:
        // ไม่มี subcommand = เป็นเบอร์/เลขบัตรเลย: /qr 0812345678 100 ร้านส้มตำ
        if (/^[\d-]+$/.test(sub)) return create($, kindOf(sub), sub, rest)
        return { text: `❌ ไม่รู้จัก "${sub}"\n\n${HELP}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ทำระบบ POS: ดัก prompt "คิดเงิน 3 รายการ" ให้ Claude รวมยอด แล้วเรียก create() สร้าง QR ทันที
 * 2. ใส่ชื่อร้านลง payload ด้วย tag 59 (Merchant Name) ตามมาตรฐาน EMVCo
 * 3. ส่ง QR (SVG) เข้า LINE ผ่าน Flex Message ของ Mod 12
 */
