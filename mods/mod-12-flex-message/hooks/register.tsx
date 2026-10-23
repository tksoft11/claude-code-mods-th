/**
 * ============================================================================
 * MOD 12: Flex Message TH - สร้าง LINE Flex Message จากคำสั่งภาษาไทย (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: LINE Flex Message (https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
 *
 * ปกติ Flex Message ต้องเขียน JSON ยาวๆ เอง Mod นี้สร้างให้จากคำสั่งสั้นๆ
 *
 * หน้าที่ของ Mod นี้:
 * 1. Template ไทย 6 แบบ: สินค้า, ใบเสร็จ, โปรไฟล์, เมนูอาหาร, บัตรสมาชิก, carousel
 * 2. ดูตัวอย่างในแผงด้านข้าง (วาดจาก JSON จริง กดปุ่มดูได้ว่า LINE จะส่งข้อความอะไร)
 * 3. /flex json ได้ JSON พร้อมส่ง LINE Messaging API, /flex export บันทึกเป็นไฟล์
 * 4. จำ Flex ที่สร้างไว้ข้าม session ด้วย $.store
 */

import type { EngineInterface, Register } from 'claude-code'

// ==========================================================================
// บทที่ 1: โครงสร้างของ Flex Message (ตามสเปคของ LINE)
// ==========================================================================
// bubble = การ์ด 1 ใบ มีส่วน header / hero (รูปใหญ่) / body / footer
// carousel = bubble หลายใบเลื่อนดูได้
// ข้างในเป็น component: box (กล่อง), text, button, image, separator
type FlexAction = { type: 'message' | 'uri'; label: string; text?: string; uri?: string }

interface FlexNode {
  type: string
  layout?: 'vertical' | 'horizontal' | 'baseline'
  contents?: FlexNode[]
  text?: string
  color?: string
  size?: string
  weight?: 'regular' | 'bold'
  decoration?: 'line-through'
  align?: 'start' | 'center' | 'end'
  wrap?: boolean
  flex?: number
  margin?: string
  spacing?: string
  backgroundColor?: string
  paddingAll?: string
  cornerRadius?: string
  width?: string
  height?: string
  url?: string
  aspectRatio?: string
  aspectMode?: 'cover' | 'fit'
  style?: 'primary' | 'secondary' | 'link'
  action?: FlexAction
}

interface FlexBubble {
  type: 'bubble'
  header?: FlexNode
  hero?: FlexNode
  body?: FlexNode
  footer?: FlexNode
}

interface FlexCarousel {
  type: 'carousel'
  contents: FlexBubble[]
}

interface SavedFlex {
  id: number
  name: string
  altText: string // ข้อความที่แสดงในแจ้งเตือนของ LINE (บังคับต้องมี)
  flex: FlexBubble | FlexCarousel
  createdAt: number
}

const LINE_GREEN = '#06c755'

// ฟังก์ชันช่วยสร้าง component สั้นๆ
const text = (value: string, extra: Partial<FlexNode> = {}): FlexNode => ({ type: 'text', text: value, ...extra })
const box = (layout: FlexNode['layout'], contents: FlexNode[], extra: Partial<FlexNode> = {}): FlexNode => ({ type: 'box', layout, contents, ...extra })
const button = (label: string, message: string, extra: Partial<FlexNode> = {}): FlexNode => ({
  type: 'button',
  action: { type: 'message', label, text: message },
  ...extra,
})
const baht = (n: number) => `฿${n.toLocaleString('en-US')}`

// ==========================================================================
// บทที่ 2: Template ไทย - แต่ละอันคือฟังก์ชันที่คืน bubble
// ==========================================================================
type Item = { name: string; price: number }

function productBubble(name: string, price: number, fullPrice?: number, imageUrl?: string): FlexBubble {
  const priceRow = [text(baht(price), { weight: 'bold', size: 'xl', color: LINE_GREEN, flex: 0 })]
  if (fullPrice && fullPrice > price) {
    priceRow.push(text(baht(fullPrice), { size: 'sm', color: '#aaaaaa', decoration: 'line-through', margin: 'md', flex: 0 }))
  }
  return {
    type: 'bubble',
    // hero (รูป) ใส่เฉพาะเมื่อมี URL รูปจริง เพราะ LINE บังคับต้องเป็น https
    ...(imageUrl ? { hero: { type: 'image', url: imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' as const } } : {}),
    body: box('vertical', [text(name, { weight: 'bold', size: 'xl', wrap: true }), box('baseline', priceRow, { margin: 'md' })]),
    footer: box('horizontal', [button('ใส่ตะกร้า', `ใส่ ${name} ลงตะกร้า`, { style: 'secondary' }), button('ซื้อเลย', `ซื้อ ${name}`, { style: 'primary', color: LINE_GREEN })], { spacing: 'sm' }),
  }
}

function receiptBubble(shop: string, items: Item[]): FlexBubble {
  const total = items.reduce((sum, item) => sum + item.price, 0)
  return {
    type: 'bubble',
    header: box('vertical', [text(shop, { weight: 'bold', size: 'xl', color: '#ffffff' }), text('ใบเสร็จรับเงิน', { size: 'sm', color: '#ffffff' })], {
      backgroundColor: LINE_GREEN,
      paddingAll: '20px',
    }),
    body: box('vertical', [
      ...items.map(item => box('horizontal', [text(item.name, { size: 'sm', color: '#555555', flex: 4 }), text(baht(item.price), { size: 'sm', align: 'end', flex: 2 })], { margin: 'md' })),
      { type: 'separator', margin: 'xl' },
      box('horizontal', [text('รวมทั้งหมด', { size: 'sm', weight: 'bold' }), text(baht(total), { size: 'sm', weight: 'bold', align: 'end' })], { margin: 'xl' }),
    ]),
    footer: box('vertical', [button('ดูรายละเอียด', `ดูรายละเอียดใบเสร็จ ${shop}`, { style: 'primary', color: LINE_GREEN })]),
  }
}

function profileBubble(name: string, role: string): FlexBubble {
  return {
    type: 'bubble',
    body: box('vertical', [text(`👤 ${name}`, { weight: 'bold', size: 'lg' }), text(role, { size: 'sm', color: '#888888', wrap: true })]),
    footer: box('horizontal', [button('ติดต่อ', `ขอติดต่อ ${name}`, { style: 'primary', color: LINE_GREEN })]),
  }
}

function menuBubble(restaurant: string, dishes: Item[]): FlexBubble {
  return {
    type: 'bubble',
    header: box('vertical', [text(`🍜 ${restaurant}`, { weight: 'bold', size: 'lg', color: '#ffffff' })], { backgroundColor: '#ff6b35', paddingAll: '15px' }),
    // กดแต่ละแถวเพื่อสั่งได้: ใส่ action ที่ box ของแถวนั้น
    body: box(
      'vertical',
      dishes.map(dish =>
        box('horizontal', [text(dish.name, { size: 'sm', flex: 3 }), text(baht(dish.price), { size: 'sm', align: 'end', flex: 1, weight: 'bold', color: '#ff6b35' })], {
          margin: 'md',
          action: { type: 'message', label: dish.name.slice(0, 20), text: `สั่ง ${dish.name}` },
        }),
      ),
    ),
    footer: box('vertical', [button('ดูเมนูทั้งหมด', `ดูเมนูทั้งหมดของ ${restaurant}`, { style: 'primary', color: '#ff6b35' })]),
  }
}

// ระดับสมาชิกตามแต้ม -> คำนวณ progress ไประดับถัดไป
const TIERS = [
  { name: 'Silver', min: 0 },
  { name: 'Gold', min: 1000 },
  { name: 'Platinum', min: 5000 },
]

function memberBubble(name: string, points: number, level?: string): FlexBubble {
  const index = TIERS.findLastIndex(t => points >= t.min)
  const tier = TIERS[Math.max(0, index)] ?? { name: 'Silver', min: 0 }
  const nextTier = TIERS[index + 1]
  const percent = nextTier ? Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100) : 100

  return {
    type: 'bubble',
    header: box('vertical', [text('บัตรสมาชิก', { size: 'xs', color: '#ffffff' }), text(level || tier.name, { weight: 'bold', size: 'xl', color: '#ffd700', margin: 'md' })], {
      backgroundColor: '#1a1a2e',
      paddingAll: '20px',
    }),
    body: box('vertical', [
      text(name, { weight: 'bold', size: 'md' }),
      box('horizontal', [text('คะแนนสะสม', { size: 'xs', color: '#aaaaaa' }), text(`${points.toLocaleString('en-US')} แต้ม`, { size: 'sm', weight: 'bold', align: 'end' })], { margin: 'xl' }),
      // progress bar = box สีเทา ข้างในมี box สีเข้มกว้างตามเปอร์เซ็นต์
      box('vertical', [box('vertical', [], { backgroundColor: '#1a1a2e', height: '6px', width: `${percent}%`, cornerRadius: '3px' })], {
        backgroundColor: '#eeeeee',
        height: '6px',
        cornerRadius: '3px',
        margin: 'md',
      }),
      text(nextTier ? `อีก ${(nextTier.min - points).toLocaleString('en-US')} แต้มถึง ${nextTier.name}` : 'ระดับสูงสุดแล้ว 🎉', { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
    ]),
    footer: box('horizontal', [button('ใช้คะแนน', 'ใช้คะแนน', { style: 'primary', color: '#1a1a2e' }), button('ประวัติ', 'ดูประวัติแต้ม', { style: 'secondary' })], { spacing: 'sm' }),
  }
}

// ==========================================================================
// บทที่ 3: แปลงข้อความที่พิมพ์เป็นข้อมูล
// ==========================================================================
// "ส้มตำ:60,ลาบ:70" -> [{ name: 'ส้มตำ', price: 60 }, { name: 'ลาบ', price: 70 }]
function parseItems(raw: string): Item[] {
  return raw
    .split(',')
    .map(part => {
      const [name = '', price = '0'] = part.split(':')
      return { name: name.trim(), price: Number(price.replace(/[^\d.]/g, '')) || 0 }
    })
    .filter(item => item.name)
}

// แยกคำที่อยู่ก่อนรายการ "a:1,b:2" ออกมาเป็นชื่อร้าน
function splitNameAndItems(words: string[]): [string, string] {
  const at = words.findIndex(w => w.includes(':'))
  if (at < 0) return [words.join(' '), '']
  return [words.slice(0, at).join(' '), words.slice(at).join(' ')]
}

// ==========================================================================
// บทที่ 4: เก็บ Flex ที่สร้างไว้ใน $.store (จำข้าม session)
// ==========================================================================
let saved: SavedFlex[] = []
let nextId = 0
let previewId: number | undefined // Flex ที่กำลังแสดงในแผง
let carouselIndex = 0
let projectRoot = ''
const PANE = 'flex-message-th'

async function persist($: EngineInterface): Promise<void> {
  await $.store.set('flexes', { saved, nextId })
}

async function saveFlex($: EngineInterface, name: string, altText: string, flex: FlexBubble | FlexCarousel): Promise<SavedFlex> {
  const item: SavedFlex = { id: nextId++, name, altText: altText.slice(0, 400), flex, createdAt: await $.clock.now() }
  saved = [...saved, item].slice(-30) // เก็บแค่ 30 อันล่าสุด
  await persist($)
  return item
}

function findFlex(arg: string): SavedFlex | undefined {
  return saved.find(f => f.id === Number(arg))
}

// สิ่งที่ส่งเข้า LINE Messaging API จริง (ใส่ใน messages: [...])
function toLineMessage(f: SavedFlex) {
  return { type: 'flex', altText: f.altText, contents: f.flex }
}

function bubblesOf(f: SavedFlex): FlexBubble[] {
  return f.flex.type === 'carousel' ? f.flex.contents : [f.flex]
}

// ==========================================================================
// บทที่ 5: ตัวอย่างแบบข้อความ (ใช้ตอนเปิดแผงไม่ได้ เช่นรัน claude -p)
// ==========================================================================
function nodeToLines(node: FlexNode | undefined, indent = ''): string[] {
  if (!node) return []
  if (node.type === 'text') return [`${indent}${node.text ?? ''}`]
  if (node.type === 'button') return [`${indent}[ ${node.action?.label ?? ''} ]`]
  if (node.type === 'image') return [`${indent}🖼️ ${node.url ?? ''}`]
  if (node.type === 'separator') return [`${indent}────────────`]
  if (node.type !== 'box') return []
  const children = node.contents ?? []
  // แถวแนวนอนรวมเป็นบรรทัดเดียว
  if (node.layout !== 'vertical') return [indent + children.flatMap(c => nodeToLines(c)).join('  ')]
  return children.flatMap(c => nodeToLines(c, indent))
}

function bubbleToText(b: FlexBubble): string {
  return [b.header, b.hero, b.body, b.footer].flatMap(part => nodeToLines(part, '  ')).join('\n')
}

// ==========================================================================
// บทที่ 6: วาด Flex ในแผงด้วย element ของ Claude Code (แปลงทีละ node แบบ recursive)
// ==========================================================================
// สีแบบ 8 หลัก (#ffffffcc) ตัด alpha ออก ให้ทุกหน้าจอวาดได้
function solid(color: string | undefined): string | undefined {
  return color && /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    const stored = (await $.store.get('flexes')) as { saved?: SavedFlex[]; nextId?: number } | undefined
    saved = stored?.saved ?? []
    nextId = stored?.nextId ?? 0
    await $.command.register({ name: 'flex', description: 'สร้าง LINE Flex Message (/flex help)', argumentHint: '<template> ...' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = previewId === undefined ? undefined : findFlex(String(previewId))
    if (!current) return <Text dimColor>ยังไม่ได้เลือก Flex (/flex show &lt;id&gt;)</Text>

    const bubbles = bubblesOf(current)
    const index = Math.min(carouselIndex, bubbles.length - 1)
    const bubble = bubbles[index]
    if (!bubble) return <Text dimColor>Flex นี้ว่างเปล่า</Text>

    // แปลง node ของ Flex เป็น element; path ใช้เป็น key ของปุ่มให้ไม่ซ้ำกัน
    const draw = (node: FlexNode | undefined, path: string): JSX.Element | null => {
      if (!node) return null
      switch (node.type) {
        case 'text':
          return (
            <Text color={solid(node.color)} bold={node.weight === 'bold'} strikethrough={node.decoration === 'line-through'} wrap="wrap">
              {node.text ?? ''}
            </Text>
          )
        case 'button': {
          const action = node.action
          return (
            <Button
              key={`btn-${path}`}
              label={action?.label ?? 'ปุ่ม'}
              variant={node.style === 'primary' ? 'primary' : undefined}
              onPress={() => $.ui.toast(`💬 LINE จะส่ง: ${action?.text ?? action?.uri ?? ''}`)}
            />
          )
        }
        case 'image':
          return <Text dimColor>🖼️ รูป {node.aspectRatio ?? ''}</Text>
        case 'separator':
          return <Text dimColor>────────────────</Text>
        case 'box': {
          const isRow = node.layout === 'horizontal' || node.layout === 'baseline'
          const children = (node.contents ?? []).map((child, i) => draw(child, `${path}-${i}`))
          // progress bar (box ว่างที่มีความกว้าง) วาดเป็นแถบตัวอักษร
          if ((node.contents ?? []).length === 0 && node.width) {
            const filled = Math.round((parseInt(node.width, 10) || 0) / 10)
            return <Text color={solid(node.backgroundColor)}>{'█'.repeat(filled) + '░'.repeat(10 - filled)}</Text>
          }
          return (
            <Box flexDirection={isRow ? 'row' : 'column'} gap={isRow ? 1 : 0} justifyContent={isRow ? 'space-between' : undefined} backgroundColor={solid(node.backgroundColor)} paddingX={node.backgroundColor ? 1 : 0}>
              {children}
            </Box>
          )
        }
        default:
          return null
      }
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          #{current.id} {current.name}
          {bubbles.length > 1 ? ` · ใบที่ ${index + 1}/${bubbles.length}` : ''}
        </Text>
        <Box flexDirection="column" borderStyle="round" borderColor={LINE_GREEN}>
          {draw(bubble.header, 'h')}
          {draw(bubble.hero, 'i')}
          {draw(bubble.body, 'b')}
          {draw(bubble.footer, 'f')}
        </Box>
        {bubbles.length > 1 && (
          <Box gap={2}>
            <Button key="prev" label="◀ ก่อนหน้า" onPress={() => {
              carouselIndex = Math.max(0, index - 1)
              $.ui.invalidate('ui.render')
            }} />
            <Button key="next" label="ถัดไป ▶" onPress={() => {
              carouselIndex = Math.min(bubbles.length - 1, index + 1)
              $.ui.invalidate('ui.render')
            }} />
          </Box>
        )}
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 7: คำสั่ง /flex
  // ==========================================================================
  on('command.run', { command: 'flex' }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const [sub = 'help', ...rest] = words

    // สร้างแล้วเปิดแผงให้ดูทันที (ถ้าเปิดไม่ได้ แสดงเป็นข้อความแทน)
    const created = async (f: SavedFlex) => {
      previewId = f.id
      carouselIndex = 0
      const opened = await $.ui.open({ id: PANE, title: '💚 Flex Preview' })
      $.ui.invalidate('ui.render')
      const preview = opened.isPlaced ? '' : `\n${bubblesOf(f).map(bubbleToText).join('\n  ──── ใบถัดไป ────\n')}`
      return { text: `💚 สร้าง Flex #${f.id} ${f.name} แล้ว (/flex json ${f.id} เพื่อเอา JSON)${preview}` }
    }

    switch (sub) {
      case 'product': {
        // /flex product เสื้อยืดลายไทย 299 [ราคาเดิม] [https://รูป]
        const url = rest.find(w => /^https:\/\//.test(w))
        const numbers = rest.filter(w => /^\d+(\.\d+)?$/.test(w)).map(Number)
        const name = rest.filter(w => w !== url && !/^\d+(\.\d+)?$/.test(w)).join(' ')
        if (!name || numbers[0] === undefined) return { text: 'วิธีใช้: /flex product <ชื่อ> <ราคา> [ราคาเดิม] [https://รูป]' }
        return created(await saveFlex($, `สินค้า ${name}`, `${name} ราคา ${baht(numbers[0])}`, productBubble(name, numbers[0], numbers[1], url)))
      }
      case 'receipt': {
        // /flex receipt ร้านส้มตำ ส้มตำ:60,ลาบ:70  หรือ  /flex receipt ร้านส้มตำ 350
        const [shop, rawItems] = splitNameAndItems(rest)
        let items = parseItems(rawItems)
        if (items.length === 0) {
          const total = Number(rest.at(-1))
          if (!total) return { text: 'วิธีใช้: /flex receipt <ร้าน> <รายการ:ราคา,...>  หรือ  /flex receipt <ร้าน> <ยอดรวม>' }
          items = [{ name: 'ยอดชำระ', price: total }]
          const shopName = rest.slice(0, -1).join(' ')
          return created(await saveFlex($, `ใบเสร็จ ${shopName}`, `ใบเสร็จ ${shopName} ${baht(total)}`, receiptBubble(shopName, items)))
        }
        const total = items.reduce((s, i) => s + i.price, 0)
        return created(await saveFlex($, `ใบเสร็จ ${shop}`, `ใบเสร็จ ${shop} ${baht(total)}`, receiptBubble(shop, items)))
      }
      case 'profile': {
        // /flex profile สมชาย ใจดี | นักพัฒนา Full-Stack
        const joined = rest.join(' ')
        const [name = '', role = ''] = joined.includes('|') ? joined.split('|').map(s => s.trim()) : [rest[0] ?? '', rest.slice(1).join(' ')]
        if (!name) return { text: 'วิธีใช้: /flex profile <ชื่อ> | <ตำแหน่ง>' }
        return created(await saveFlex($, `โปรไฟล์ ${name}`, `โปรไฟล์ ${name}`, profileBubble(name, role)))
      }
      case 'menu': {
        // /flex menu ร้านป้าแดง ส้มตำ:60,ลาบ:70,ข้าวเหนียว:20
        const [restaurant, rawItems] = splitNameAndItems(rest)
        const dishes = parseItems(rawItems)
        if (!restaurant || dishes.length === 0) return { text: 'วิธีใช้: /flex menu <ร้าน> <เมนู:ราคา,เมนู:ราคา>' }
        return created(await saveFlex($, `เมนู ${restaurant}`, `เมนูร้าน ${restaurant}`, menuBubble(restaurant, dishes)))
      }
      case 'member': {
        // /flex member สมชาย 1250 [Gold]
        const at = rest.findIndex(w => /^\d+$/.test(w))
        if (at <= 0) return { text: 'วิธีใช้: /flex member <ชื่อ> <แต้ม> [ระดับ]' }
        const name = rest.slice(0, at).join(' ')
        const points = Number(rest[at])
        return created(await saveFlex($, `สมาชิก ${name}`, `บัตรสมาชิก ${name} ${points} แต้ม`, memberBubble(name, points, rest.slice(at + 1).join(' ') || undefined)))
      }
      case 'carousel': {
        // /flex carousel เสื้อยืด:299,กางเกง:459,หมวก:199
        const items = parseItems(rest.join(' '))
        if (items.length < 2) return { text: 'วิธีใช้: /flex carousel <ชื่อ:ราคา,ชื่อ:ราคา,...> (อย่างน้อย 2 ชิ้น สูงสุด 12)' }
        const flex: FlexCarousel = { type: 'carousel', contents: items.slice(0, 12).map(i => productBubble(i.name, i.price)) }
        return created(await saveFlex($, `Carousel ${items.length} ชิ้น`, `สินค้า ${items.map(i => i.name).join(', ')}`, flex))
      }
      case 'demo': {
        await saveFlex($, 'สินค้า เสื้อยืดลายไทย', 'เสื้อยืดลายไทย ราคา ฿299', productBubble('เสื้อยืดลายไทย', 299, 399))
        await saveFlex($, 'ใบเสร็จ ร้านส้มตำป้าแดง', 'ใบเสร็จ ร้านส้มตำป้าแดง ฿150', receiptBubble('ร้านส้มตำป้าแดง', parseItems('ส้มตำไทย:60,ลาบหมู:70,ข้าวเหนียว:20')))
        await saveFlex($, 'โปรไฟล์ สมชาย ใจดี', 'โปรไฟล์ สมชาย ใจดี', profileBubble('สมชาย ใจดี', 'นักพัฒนา Full-Stack'))
        await saveFlex($, 'เมนู ร้านป้าแดง', 'เมนูร้านป้าแดง', menuBubble('ร้านป้าแดง', parseItems('ส้มตำ:60,ลาบ:70,ข้าวเหนียว:20,ไก่ย่าง:120')))
        await saveFlex($, 'สมาชิก สมชาย', 'บัตรสมาชิก สมชาย 1250 แต้ม', memberBubble('สมชาย', 1250))
        const last = await saveFlex($, 'Carousel 3 ชิ้น', 'สินค้า เสื้อยืด, กางเกง, หมวก', {
          type: 'carousel',
          contents: parseItems('เสื้อยืด:299,กางเกง:459,หมวก:199').map(i => productBubble(i.name, i.price)),
        })
        const result = await created(last)
        return { text: `🎨 สร้างตัวอย่าง 6 แบบแล้ว (#${last.id - 5} ถึง #${last.id}) ดูรายการด้วย /flex list\n${result.text}` }
      }
      case 'list': {
        if (saved.length === 0) return { text: 'ยังไม่มี Flex ลอง /flex demo' }
        return { text: ['💚 Flex ที่สร้างไว้', ...saved.map(f => `  #${f.id} ${f.name} (${f.flex.type})`)].join('\n') }
      }
      case 'show': {
        const f = findFlex(rest[0] ?? '')
        if (!f) return { text: `❌ ไม่พบ Flex #${rest[0] ?? ''} (ดูรายการด้วย /flex list)` }
        return created(f)
      }
      case 'json': {
        const f = findFlex(rest[0] ?? '')
        if (!f) return { text: `❌ ไม่พบ Flex #${rest[0] ?? ''}` }
        return { text: `JSON ของ Flex #${f.id} (ใส่ใน messages: [...] ของ LINE Messaging API)\n\`\`\`json\n${JSON.stringify(toLineMessage(f), null, 2)}\n\`\`\`` }
      }
      case 'export': {
        const f = findFlex(rest[0] ?? '')
        if (!f) return { text: `❌ ไม่พบ Flex #${rest[0] ?? ''}` }
        const sep = projectRoot.includes('\\') ? '\\' : '/'
        const path = `${projectRoot}${sep}flex-${f.id}.json`
        await $.fs.write(path, JSON.stringify(toLineMessage(f), null, 2) + '\n')
        return { text: `💾 บันทึกแล้ว: ${path}` }
      }
      case 'delete': {
        const f = findFlex(rest[0] ?? '')
        if (!f) return { text: `❌ ไม่พบ Flex #${rest[0] ?? ''}` }
        saved = saved.filter(x => x !== f)
        await persist($)
        if (previewId === f.id) {
          previewId = undefined
          $.ui.invalidate('ui.render')
        }
        return { text: `🗑️ ลบ Flex #${f.id} แล้ว` }
      }
      case 'clear':
        saved = []
        previewId = undefined
        await persist($)
        $.ui.invalidate('ui.render')
        return { text: '🗑️ ลบ Flex ทั้งหมดแล้ว' }
      default:
        return {
          text: `💚 Flex Message TH (Mod 12)
========================================
สร้าง:
  /flex product <ชื่อ> <ราคา> [ราคาเดิม] [https://รูป]
  /flex receipt <ร้าน> <รายการ:ราคา,...>   หรือ   <ร้าน> <ยอดรวม>
  /flex profile <ชื่อ> | <ตำแหน่ง>
  /flex menu <ร้าน> <เมนู:ราคา,เมนู:ราคา>
  /flex member <ชื่อ> <แต้ม> [ระดับ]
  /flex carousel <ชื่อ:ราคา,ชื่อ:ราคา,...>
  /flex demo                 สร้างตัวอย่างครบ 6 แบบ

จัดการ:
  /flex list | show <id> | json <id> | export <id> | delete <id> | clear`,
        }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งเข้า LINE จริง: เพิ่ม userConfig (sensitive) สำหรับ Channel Access Token แล้วใช้
 *    $.http.fetch("https://api.line.me/v2/bot/message/push", { method: "POST",
 *      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 *      body: JSON.stringify({ to: userId, messages: [toLineMessage(f)] }) })
 * 2. ให้ Claude สร้าง Flex จากคำบรรยาย: $.prompt.submit("สร้าง Flex เมนูร้านกาแฟ ...") แล้วตรวจ JSON ที่ได้
 * 3. ตรวจ JSON กับ Flex Message Simulator ของ LINE ก่อนส่งจริง
 */
