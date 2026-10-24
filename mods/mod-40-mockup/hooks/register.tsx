/**
 * ============================================================================
 * MOD 40: Mockup TH - สร้าง mockup จริงจากโลโก้ของคุณ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ร้านสกรีนเสื้อ แก้ว ถุงผ้า ที่ต้องส่ง mockup ให้ลูกค้าดูก่อนสั่ง
 *
 * หน้าที่ของ Mod นี้:
 * 1. ใส่โลโก้ (ไฟล์ PNG/JPG/SVG) หรือข้อความ แล้วสร้าง mockup เป็นไฟล์ SVG ที่เปิดดูหรือส่งต่อได้ทันที
 * 2. สินค้า 8 แบบ: เสื้อยืด, แก้วมัค, แก้วเก็บความเย็น, ถุงผ้า, กล่อง, ถุงกาแฟ, มือถือ, แล็ปท็อป
 * 3. เลือกสีสินค้าได้, สร้างทุกแบบรวมในหน้าเดียว (contact sheet)
 * 4. ทำใบสั่งงาน: ตั้งชื่อร้าน ราคาที่ร้านแจ้ง เพิ่มรายการ แล้วส่งออกเป็นไฟล์ไว้ส่งให้ร้าน
 *
 * หมายเหตุ: Mod ไม่ได้สั่งซื้อหรือจ่ายเงินให้ร้านไหน ราคาใส่เองตามที่ร้านแจ้ง (ไม่มีราคาเดาให้)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Logo {
  kind: 'image' | 'text'
  data: string // data URI ของรูป หรือข้อความ
  name: string
}
interface OrderLine {
  product: string
  qty: number
  detail: string
}
interface Shop {
  name: string
  contact: string
  prices: Record<string, number>
}

// ==========================================================================
// บทที่ 1: แบบสินค้า - วาดด้วย SVG path + กำหนดกรอบที่วางโลโก้
// ==========================================================================
interface Product {
  name: string
  w: number
  h: number
  color: string // สีเริ่มต้น
  shape: (c: string) => string
  logo: { x: number; y: number; w: number; h: number }
}

const shade = 'rgba(0,0,0,0.12)'
const PRODUCTS: Record<string, Product> = {
  shirt: {
    name: 'เสื้อยืด', w: 400, h: 420, color: '#ffffff',
    shape: c => `<path d="M130 40 L95 55 L30 110 L70 165 L105 140 L105 390 L295 390 L295 140 L330 165 L370 110 L305 55 L270 40 Q200 80 130 40 Z" fill="${c}" stroke="${shade}" stroke-width="3"/><path d="M160 46 Q200 75 240 46" fill="none" stroke="${shade}" stroke-width="3"/>`,
    logo: { x: 150, y: 130, w: 100, h: 100 },
  },
  mug: {
    name: 'แก้วมัค', w: 400, h: 340, color: '#ffffff',
    shape: c => `<rect x="80" y="60" width="200" height="230" rx="18" fill="${c}" stroke="${shade}" stroke-width="3"/><path d="M280 110 Q350 110 350 175 Q350 240 280 240" fill="none" stroke="${shade}" stroke-width="22"/><ellipse cx="180" cy="62" rx="100" ry="14" fill="${shade}"/>`,
    logo: { x: 120, y: 120, w: 120, h: 120 },
  },
  tumbler: {
    name: 'แก้วเก็บความเย็น', w: 300, h: 460, color: '#1f2933',
    shape: c => `<rect x="85" y="40" width="130" height="30" rx="8" fill="#555"/><path d="M80 70 L220 70 L200 420 Q150 435 100 420 Z" fill="${c}" stroke="${shade}" stroke-width="3"/>`,
    logo: { x: 105, y: 170, w: 90, h: 90 },
  },
  tote: {
    name: 'ถุงผ้า', w: 400, h: 460, color: '#f3ead8',
    shape: c => `<path d="M140 130 Q140 40 200 40 Q260 40 260 130" fill="none" stroke="#c9b58f" stroke-width="12"/><rect x="70" y="130" width="260" height="300" fill="${c}" stroke="${shade}" stroke-width="3"/>`,
    logo: { x: 130, y: 210, w: 140, h: 140 },
  },
  box: {
    name: 'กล่องคราฟท์', w: 420, h: 360, color: '#c8a26b',
    shape: c => `<path d="M70 120 L210 60 L350 120 L210 180 Z" fill="${c}" stroke="${shade}" stroke-width="3"/><path d="M70 120 L70 270 L210 330 L210 180 Z" fill="${c}" stroke="${shade}" stroke-width="3" opacity="0.85"/><path d="M350 120 L350 270 L210 330 L210 180 Z" fill="${c}" stroke="${shade}" stroke-width="3" opacity="0.7"/>`,
    logo: { x: 160, y: 85, w: 100, h: 70 },
  },
  coffee: {
    name: 'ถุงกาแฟ', w: 320, h: 460, color: '#1b1b1b',
    shape: c => `<path d="M70 60 L250 60 L265 420 L55 420 Z" fill="${c}" stroke="${shade}" stroke-width="3"/><rect x="70" y="60" width="180" height="26" fill="#333"/><circle cx="160" cy="130" r="10" fill="#444"/>`,
    logo: { x: 100, y: 190, w: 120, h: 120 },
  },
  phone: {
    name: 'มือถือ', w: 280, h: 540, color: '#111111',
    shape: c => `<rect x="30" y="20" width="220" height="480" rx="34" fill="${c}"/><rect x="42" y="34" width="196" height="452" rx="24" fill="#ffffff"/><rect x="110" y="44" width="60" height="16" rx="8" fill="${c}"/>`,
    logo: { x: 80, y: 180, w: 120, h: 120 },
  },
  laptop: {
    name: 'แล็ปท็อป', w: 520, h: 360, color: '#9aa3ad',
    shape: c => `<rect x="80" y="30" width="360" height="240" rx="14" fill="#222"/><rect x="94" y="44" width="332" height="212" fill="#ffffff"/><path d="M40 280 L480 280 L460 310 L60 310 Z" fill="${c}"/>`,
    logo: { x: 200, y: 90, w: 120, h: 120 },
  },
}

let logo: Logo | undefined
let order: OrderLine[] = []
let shop: Shop = { name: '', contact: '', prices: {} }
let projectRoot = ''

async function save($: EngineInterface): Promise<void> {
  await $.store.set('mockup', { logo, order, shop })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ==========================================================================
// บทที่ 2: ประกอบ SVG - วางโลโก้ในกรอบของสินค้า (รูป = <image>, ข้อความ = <text>)
// ==========================================================================
function logoSvg(l: Logo, box: Product['logo'], onDark: boolean): string {
  if (l.kind === 'image') return `<image href="${l.data}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid meet"/>`
  const size = Math.max(12, Math.min(40, Math.floor((box.w * 1.6) / Math.max(1, [...l.data].length))))
  return `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" font-size="${size}" font-family="Sarabun, 'Noto Sans Thai', sans-serif" font-weight="700" fill="${onDark ? '#ffffff' : '#111111'}" text-anchor="middle" dominant-baseline="middle">${esc(l.data)}</text>`
}

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x ?? '0', 16))
  return (r ?? 0) * 0.299 + (g ?? 0) * 0.587 + (b ?? 0) * 0.114 < 128
}

function productSvg(key: string, color?: string): string {
  const p = PRODUCTS[key]
  if (!p || !logo) return ''
  const c = color ?? p.color
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}"><rect width="100%" height="100%" fill="#eef0f3"/>${p.shape(c)}${logoSvg(logo, p.logo, isDark(c) && key !== 'phone' && key !== 'laptop')}</svg>`
}

// contact sheet: ทุกสินค้าในหน้าเดียว เรียงเป็นตาราง 4 คอลัมน์
function sheetSvg(): string {
  const keys = Object.keys(PRODUCTS)
  const cell = 300
  const cols = 4
  const rows = Math.ceil(keys.length / cols)
  const items = keys
    .map((k, i) => {
      const p = PRODUCTS[k]!
      const scale = Math.min((cell - 20) / p.w, (cell - 50) / p.h)
      const x = (i % cols) * cell
      const y = Math.floor(i / cols) * cell
      const inner = productSvg(k).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<rect width="100%" height="100%" fill="#eef0f3"\/>/, '')
      return `<g transform="translate(${x + 10},${y + 10}) scale(${scale.toFixed(3)})">${inner}</g><text x="${x + cell / 2}" y="${y + cell - 12}" font-size="16" font-family="sans-serif" text-anchor="middle" fill="#333">${esc(p.name)}</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}"><rect width="100%" height="100%" fill="#eef0f3"/>${items}</svg>`
}

// ==========================================================================
// บทที่ 3: ใบสั่งงาน - ใช้ราคาที่ผู้ใช้ใส่เองเท่านั้น
// ==========================================================================
function orderText(now: number): string {
  const lines = order.map((o, i) => {
    const price = shop.prices[o.product]
    return `${i + 1}. ${PRODUCTS[o.product]?.name ?? o.product} × ${o.qty}${o.detail ? ` (${o.detail})` : ''}${price ? ` = ฿${(price * o.qty).toLocaleString('en-US')}` : ' (ยังไม่ใส่ราคา)'}`
  })
  const total = order.reduce((s, o) => s + (shop.prices[o.product] ?? 0) * o.qty, 0)
  const unpriced = order.filter(o => !shop.prices[o.product]).length
  return [
    `# ใบสั่งงานสกรีน${shop.name ? ` - ถึง ${shop.name}` : ''}`,
    `วันที่ ${new Date(now).toLocaleDateString('th-TH')}${shop.contact ? ` · ติดต่อร้าน: ${shop.contact}` : ''}`,
    `โลโก้: ${logo ? logo.name : '(ยังไม่ได้ใส่)'}`,
    '',
    ...lines,
    '',
    total ? `รวมโดยประมาณ ฿${total.toLocaleString('en-US')}${unpriced ? ` (ยังไม่รวม ${unpriced} รายการที่ยังไม่มีราคา)` : ''} ตามราคาที่ร้านแจ้ง ยืนยันกับร้านอีกครั้ง` : 'ราคา: รอร้านแจ้ง',
    'ไฟล์ mockup แนบ: mockup-*.svg',
  ].join('\n')
}

const HELP = `🎨 Mockup TH (Mod 40)
========================================
ใส่โลโก้:
  /mockup logo <ไฟล์ .png .jpg .svg>     เช่น /mockup logo logo.png
  /mockup text <ข้อความ>                 ใช้ข้อความแทนโลโก้
สร้าง:
  /mockup make <สินค้า> [สี]   สินค้า: ${Object.entries(PRODUCTS).map(([k, p]) => `${k}=${p.name}`).join(' ')}
     สี: ชื่อสีหรือ hex เช่น black, #ff6b35
  /mockup all                สร้างทุกแบบในหน้าเดียว (mockup-all.svg)
ใบสั่งงาน:
  /mockup shop <ชื่อร้าน> [ช่องทางติดต่อ]
  /mockup price <สินค้า> <ราคาต่อชิ้น>   ตามที่ร้านแจ้ง
  /mockup order <สินค้า> <จำนวน> [รายละเอียด เช่น ไซส์ สี]
  /mockup order | order clear | order export
  /mockup reset confirm      ล้างข้อมูลทั้งหมด`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd.replace(/[\\/]$/, '')
    const saved = (await $.store.get('mockup')) as { logo?: Logo; order?: OrderLine[]; shop?: Shop } | undefined
    logo = saved?.logo
    order = saved?.order ?? []
    shop = saved?.shop ?? { name: '', contact: '', prices: {} }
    await $.command.register({ name: 'mockup', description: 'สร้าง mockup จากโลโก้: เสื้อ แก้ว ถุงผ้า กล่อง มือถือ แล็ปท็อป + ใบสั่งงาน (/mockup help)', argumentHint: 'logo|text|make|all|shop|price|order' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /mockup
  // ==========================================================================
  on('command.run', { command: 'mockup' }, async ($, e) => {
    const [sub = 'help', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const sep = projectRoot.includes('\\') ? '\\' : '/'
    const now = await $.clock.now()
    switch (sub) {
      case 'logo': {
        const file = rest.join(' ')
        const ext = /\.(png|jpe?g|svg|webp)$/i.exec(file)?.[1]?.toLowerCase()
        if (!file || !ext) return { text: 'วิธีใช้: /mockup logo logo.png (รองรับ png jpg svg webp)' }
        const path = /^([A-Za-z]:|[\\/])/.test(file) ? file : `${projectRoot}${sep}${file}`
        const st = await $.fs.stat(path).catch(() => undefined)
        if (!st) return { text: `❌ ไม่พบไฟล์ ${file}` }
        if (st.size > 2 * 1024 * 1024) return { text: '❌ ไฟล์ใหญ่เกิน 2 MB ย่อรูปก่อน' }
        const { base64 } = await $.fs.read(path, { as: 'bytes' })
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
        logo = { kind: 'image', data: `data:${mime};base64,${base64}`, name: file.split(/[\\/]/).pop() ?? file }
        await save($)
        return { text: `🖼️ ใช้โลโก้ ${logo.name} แล้ว ลอง /mockup all` }
      }
      case 'text': {
        const text = rest.join(' ')
        if (!text) return { text: 'วิธีใช้: /mockup text ร้านกาแฟบ้านฉัน' }
        logo = { kind: 'text', data: text.slice(0, 40), name: `ข้อความ "${text.slice(0, 40)}"` }
        await save($)
        return { text: `🔤 ใช้ข้อความ "${logo.data}" เป็นโลโก้แล้ว ลอง /mockup all` }
      }
      case 'make': {
        if (!logo) return { text: 'ใส่โลโก้ก่อน: /mockup logo logo.png หรือ /mockup text ชื่อร้าน' }
        const [key = '', color] = rest
        if (!PRODUCTS[key]) return { text: `สินค้าที่มี: ${Object.keys(PRODUCTS).join(', ')}` }
        if (color && !/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(color)) return { text: '❌ สีต้องเป็นชื่อสีภาษาอังกฤษหรือ hex เช่น black, #ff6b35' }
        const path = `${projectRoot}${sep}mockup-${key}${color ? `-${color.replace('#', '')}` : ''}.svg`
        await $.fs.write(path, productSvg(key, color))
        return { text: `✅ สร้าง ${PRODUCTS[key]?.name} แล้ว: ${path}\nเปิดใน browser เพื่อดู หรือส่งไฟล์ให้ลูกค้า/ร้านได้เลย` }
      }
      case 'all': {
        if (!logo) return { text: 'ใส่โลโก้ก่อน: /mockup logo logo.png หรือ /mockup text ชื่อร้าน' }
        const path = `${projectRoot}${sep}mockup-all.svg`
        await $.fs.write(path, sheetSvg())
        return { text: `✅ สร้าง mockup ${Object.keys(PRODUCTS).length} แบบในหน้าเดียว: ${path}` }
      }
      case 'shop': {
        const [name = '', ...contact] = rest
        if (!name) return { text: shop.name ? `🏪 ${shop.name}${shop.contact ? ` · ${shop.contact}` : ''}` : 'วิธีใช้: /mockup shop ชื่อร้าน [ไลน์/เบอร์]' }
        shop = { ...shop, name, contact: contact.join(' ') }
        await save($)
        return { text: `🏪 ส่งใบสั่งงานถึง ${name}` }
      }
      case 'price': {
        const [key = '', priceText] = rest
        const price = Number(priceText)
        if (!PRODUCTS[key] || !(price > 0)) return { text: 'วิธีใช้: /mockup price shirt 220  (ราคาต่อชิ้นที่ร้านแจ้ง)' }
        shop.prices[key] = price
        await save($)
        return { text: `💵 ${PRODUCTS[key]?.name} ชิ้นละ ฿${price}` }
      }
      case 'order': {
        const [first = '', qtyText, ...detail] = rest
        if (first === 'clear') {
          order = []
          await save($)
          return { text: '🧹 ล้างใบสั่งงานแล้ว' }
        }
        if (first === 'export') {
          const path = `${projectRoot}${sep}order-${new Date(now).toISOString().slice(0, 10)}.md`
          await $.fs.write(path, orderText(now) + '\n')
          return { text: `💾 บันทึกใบสั่งงาน: ${path}\nส่งไฟล์นี้พร้อม mockup ให้ร้านได้เลย` }
        }
        if (first && PRODUCTS[first]) {
          const qty = Number(qtyText)
          if (!Number.isInteger(qty) || qty < 1) return { text: 'วิธีใช้: /mockup order shirt 50 ไซส์ M 30 L 20 สีขาว' }
          order.push({ product: first, qty, detail: detail.join(' ') })
          await save($)
        }
        return { text: order.length ? orderText(now) : 'ใบสั่งงานว่าง /mockup order shirt 50 ไซส์ M' }
      }
      case 'reset':
        if (rest[0] !== 'confirm') return { text: '⚠️ จะลบโลโก้ ร้าน ราคา และใบสั่งงานทั้งหมด ยืนยันด้วย /mockup reset confirm' }
        logo = undefined
        order = []
        shop = { name: '', contact: '', prices: {} }
        await save($)
        return { text: '🧹 ล้างข้อมูลทั้งหมดแล้ว' }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. แปลง SVG เป็น PNG ด้วย $.process.run เรียกโปรแกรมอย่าง Inkscape หรือ ImageMagick
 * 2. ส่ง mockup ให้ลูกค้าผ่าน LINE Flex Message (Mod 12) พร้อม QR มัดจำ (Mod 14)
 * 3. เพิ่มสินค้าใหม่: ใส่ shape และกรอบโลโก้ใน PRODUCTS เช่น หมวก เคสโทรศัพท์
 */
