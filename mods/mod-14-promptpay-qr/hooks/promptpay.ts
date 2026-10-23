/**
 * ============================================================================
 * สร้าง Payload ของ PromptPay QR ตามมาตรฐาน EMVCo (Thai QR Payment)
 * ============================================================================
 * ใช้วิธีเดียวกับ library promptpay-qr (https://github.com/dtinth/promptpay-qr)
 *
 * Payload คือชุดของ "TLV" = Tag (2 หลัก) + Length (2 หลัก) + Value
 * เช่น "5802TH" = tag 58 (ประเทศ), ยาว 02, ค่า "TH"
 */

export type TargetKind = 'phone' | 'id' | 'wallet'

// ==========================================================================
// บทที่ 1: TLV - หัวใจของ EMVCo
// ==========================================================================
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value
}

// ==========================================================================
// บทที่ 2: CRC16-CCITT (FALSE) - checksum 4 หลักท้าย payload
// ==========================================================================
// ถ้า CRC ผิด แอปธนาคารจะไม่ยอมสแกน
export function crc16(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// ==========================================================================
// บทที่ 3: แปลงเบอร์ / บัตรประชาชน / e-Wallet ให้อยู่ในรูปที่ PromptPay ต้องการ
// ==========================================================================
export function digitsOnly(text: string): string {
  return text.replace(/[^0-9]/g, '')
}

// เดาว่าเป็นอะไรจากจำนวนหลัก: 13 = บัตรประชาชน, 15 = e-Wallet, อื่นๆ = เบอร์โทร
export function kindOf(target: string): TargetKind {
  const n = digitsOnly(target).length
  return n === 13 ? 'id' : n === 15 ? 'wallet' : 'phone'
}

// เบอร์โทร: 0812345678 -> 0066812345678 (ตัด 0 หน้า ใส่รหัสประเทศ 66 แล้วเติม 0 ให้ครบ 13 หลัก)
export function formatTarget(target: string): string {
  const digits = digitsOnly(target)
  if (digits.length >= 13) return digits
  return ('0000000000000' + digits.replace(/^0/, '66')).slice(-13)
}

// บัตรประชาชนไทย: หลักที่ 13 คือ check digit
export function isValidThaiId(id: string): boolean {
  const digits = digitsOnly(id)
  if (digits.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

export function isValidPhone(phone: string): boolean {
  return /^0[689]\d{8}$/.test(digitsOnly(phone)) || /^0[2-7]\d{7}$/.test(digitsOnly(phone))
}

// ==========================================================================
// บทที่ 4: ประกอบ Payload
// ==========================================================================
const PROMPTPAY_AID = 'A000000677010111' // รหัสของ PromptPay (ธุรกรรมแบบ credit transfer)
const TAG_OF: Record<TargetKind, string> = { phone: '01', id: '02', wallet: '03' }

export function buildPayload(target: string, amount?: number): string {
  const kind = kindOf(target)
  const value = kind === 'phone' ? formatTarget(target) : digitsOnly(target)
  const parts = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('01', amount ? '12' : '11'), // 11 = QR ใช้ซ้ำได้ (ลูกค้าใส่ยอดเอง), 12 = QR ครั้งเดียว (ล็อคยอด)
    tlv('29', tlv('00', PROMPTPAY_AID) + tlv(TAG_OF[kind], value)), // ข้อมูลผู้รับเงิน
    tlv('58', 'TH'), // ประเทศ
    tlv('53', '764'), // สกุลเงินบาท (ISO 4217)
  ]
  if (amount) parts.push(tlv('54', amount.toFixed(2)))
  const withoutCrc = parts.join('') + '6304' // tag 63 ยาว 04 = CRC ต่อท้าย
  return withoutCrc + crc16(withoutCrc)
}
