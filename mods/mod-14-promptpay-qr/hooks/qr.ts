/**
 * ============================================================================
 * ตัวสร้าง QR Code แบบเขียนเอง (ใช้ใน Mod 14)
 * ============================================================================
 * Mod รันในที่ที่ไม่มี npm จึงเขียนตัวสร้าง QR เอง ตามมาตรฐาน ISO/IEC 18004
 * รองรับ: byte mode, ระดับแก้ผิด M (กู้ได้ ~15%), เวอร์ชัน 1-10 (สูงสุด ~213 ตัวอักษร)
 * แนวทางอ้างอิงจาก QR Code generator library ของ Project Nayuki (MIT)
 *
 * ผลลัพธ์คือ boolean[][] : true = ช่องสีดำ
 */

// ==========================================================================
// บทที่ 1: ตารางของระดับแก้ผิด M (index = เวอร์ชัน)
// ==========================================================================
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MAX_VERSION = 10

// จำนวนช่องที่ใช้เก็บข้อมูลได้จริง (หักส่วนที่เป็นลวดลายคงที่ออก)
function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - (ECC_PER_BLOCK[ver] ?? 0) * (NUM_BLOCKS[ver] ?? 1)
}

// ==========================================================================
// บทที่ 2: Reed-Solomon (ตัวแก้ผิดของ QR) ใน GF(256)
// ==========================================================================
function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j] ?? 0, root)
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0)
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0)
    result.push(0)
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMul(coef, factor)
    })
  }
  return result
}

// ==========================================================================
// บทที่ 3: แปลงข้อความเป็น codeword (mode, ความยาว, ข้อมูล, pad) + เติม ECC
// ==========================================================================
function encodeCodewords(bytes: number[], ver: number): number[] {
  const bits: number[] = []
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  const capacity = dataCodewords(ver) * 8
  put(0b0100, 4) // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16)
  bytes.forEach(b => put(b, 8))
  put(0, Math.min(4, capacity - bits.length)) // terminator
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0))

  // แบ่งเป็น block แล้วเติม ECC ของแต่ละ block
  const numBlocks = NUM_BLOCKS[ver] ?? 1
  const eccLen = ECC_PER_BLOCK[ver] ?? 0
  const rawCodewords = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (rawCodewords % numBlocks)
  const shortLen = Math.floor(rawCodewords / numBlocks)
  const divisor = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(-1) // ช่องว่างให้ block สั้นยาวเท่า block ยาว
    blocks.push([...dat, ...ecc])
  }

  // สลับลำดับ (interleave): หยิบ byte ที่ i ของทุก block
  const result: number[] = []
  for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i] ?? 0)
    })
  }
  return result
}

// ==========================================================================
// บทที่ 4: วาดลวดลายคงที่ (finder, timing, alignment, format, version)
// ==========================================================================
class Matrix {
  readonly ver: number
  readonly size: number
  readonly dark: boolean[][]
  readonly fixed: boolean[][]

  constructor(ver: number) {
    this.ver = ver
    this.size = ver * 4 + 17
    this.dark = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false))
    this.fixed = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false))
  }

  set(x: number, y: number, isDark: boolean, isFixed = true): void {
    const row = this.dark[y]
    const fixedRow = this.fixed[y]
    if (!row || !fixedRow || x < 0 || x >= this.size) return
    row[x] = isDark
    if (isFixed) fixedRow[x] = true
  }
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return []
  const count = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2
  const result = [6]
  for (let pos = ver * 4 + 17 - 7; result.length < count; pos -= step) result.splice(1, 0, pos)
  return result
}

function drawFormat(m: Matrix, mask: number): void {
  const data = (0 << 3) | mask // ระดับ M = 00
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const bit = (i: number) => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) m.set(8, i, bit(i))
  m.set(8, 7, bit(6))
  m.set(8, 8, bit(7))
  m.set(7, 8, bit(8))
  for (let i = 9; i < 15; i++) m.set(14 - i, 8, bit(i))
  for (let i = 0; i < 8; i++) m.set(m.size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) m.set(8, m.size - 15 + i, bit(i))
  m.set(8, m.size - 8, true) // ช่องดำบังคับ
}

function drawFixedPatterns(m: Matrix): void {
  for (let i = 0; i < m.size; i++) {
    m.set(6, i, i % 2 === 0)
    m.set(i, 6, i % 2 === 0)
  }
  // finder 3 มุม
  for (const [cx, cy] of [[3, 3], [m.size - 4, 3], [3, m.size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < m.size && y >= 0 && y < m.size) m.set(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  // alignment (เว้นตำแหน่งที่ทับ finder)
  const pos = alignmentPositions(m.ver)
  const last = pos.length - 1
  pos.forEach((y, i) =>
    pos.forEach((x, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }),
  )
  drawFormat(m, 0) // จองตำแหน่งไว้ก่อน วาดจริงตอนเลือก mask
  if (m.ver >= 7) {
    let rem = m.ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (m.ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const isDark = ((bits >>> i) & 1) === 1
      const a = m.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      m.set(a, b, isDark)
      m.set(b, a, isDark)
    }
  }
}

// วางข้อมูลแบบซิกแซกจากมุมขวาล่าง ทีละ 2 คอลัมน์
function drawData(m: Matrix, codewords: number[]): void {
  let i = 0
  for (let right = m.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < m.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? m.size - 1 - vert : vert
        if (!m.fixed[y]?.[x] && i < codewords.length * 8) {
          m.set(x, y, (((codewords[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1) === 1, false)
          i++
        }
      }
    }
  }
}

// ==========================================================================
// บทที่ 5: mask - กลับสีบางช่องให้ลายไม่ซ้ำจนกล้องอ่านยาก แล้วเลือกอันที่ดีที่สุด
// ==========================================================================
const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function applyMask(m: Matrix, mask: number): void {
  const fn = MASKS[mask] ?? MASKS[0]!
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.fixed[y]?.[x] && fn(x, y)) m.set(x, y, !m.dark[y]?.[x], false)
    }
  }
}

// คะแนนโทษตามมาตรฐาน (น้อย = ดี): แถวสีเดียวยาว, บล็อก 2x2, ลายคล้าย finder, สัดส่วนดำ/ขาว
function penalty(m: Matrix): number {
  const n = m.size
  const at = (x: number, y: number) => m.dark[y]?.[x] === true
  let score = 0
  const lines: boolean[][] = []
  for (let i = 0; i < n; i++) {
    lines.push(Array.from({ length: n }, (_, k) => at(k, i)))
    lines.push(Array.from({ length: n }, (_, k) => at(i, k)))
  }
  for (const line of lines) {
    let run = 1
    for (let k = 1; k <= n; k++) {
      if (k < n && line[k] === line[k - 1]) run++
      else {
        if (run >= 5) score += run - 2
        run = 1
      }
    }
    const text = line.map(d => (d ? '1' : '0')).join('')
    score += 40 * (text.match(/(?=(00001011101|10111010000))/g)?.length ?? 0)
  }
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = at(x, y)
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3
    }
  }
  const darkCount = m.dark.flat().filter(Boolean).length
  score += Math.floor(Math.abs(darkCount * 20 - n * n * 10) / (n * n)) * 10
  return score
}

// ==========================================================================
// บทที่ 6: รวมทุกขั้น - เลือกเวอร์ชันเล็กสุดที่พอ แล้วลองทุก mask
// ==========================================================================
export function encodeQR(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  while (ver <= MAX_VERSION && dataCodewords(ver) * 8 < 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8) ver++
  if (ver > MAX_VERSION) throw new Error(`ข้อความยาวเกินไป (${bytes.length} bytes)`)

  const codewords = encodeCodewords(bytes, ver)
  let best: Matrix | undefined
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const m = new Matrix(ver)
    drawFixedPatterns(m)
    drawData(m, codewords)
    applyMask(m, mask)
    drawFormat(m, mask)
    const score = penalty(m)
    if (score < bestScore) {
      best = m
      bestScore = score
    }
  }
  return best?.dark ?? []
}

// ==========================================================================
// บทที่ 7: แปลง QR เป็นข้อความ (ครึ่งบล็อก 2 แถวต่อบรรทัด) และ SVG
// ==========================================================================
// ใช้ ▀ ▄ █ วาดสีดำบนพื้นขาว 1 ตัวอักษร = กว้าง 1 ช่อง สูง 2 ช่อง จึงได้สัดส่วนจัตุรัส
export function qrToLines(modules: boolean[][], quiet = 2): string[] {
  const n = modules.length
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && modules[y]?.[x] === true
  const lines: string[] = []
  for (let y = -quiet; y < n + quiet; y += 2) {
    let line = ''
    for (let x = -quiet; x < n + quiet; x++) {
      const top = at(x, y)
      const bottom = at(x, y + 1)
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    lines.push(line)
  }
  return lines
}

export function qrToSvg(modules: boolean[][], scale = 10, quiet = 4): string {
  const n = modules.length
  const size = (n + quiet * 2) * scale
  let path = ''
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${(x + quiet) * scale},${(y + quiet) * scale}h${scale}v${scale}h-${scale}z`
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`
}
