/**
 * ============================================================================
 * MOD 02: Claude Skins TH - ธีมไทย 5 แบบ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/hellosverre/claude-skins
 *
 * หน้าที่ของ Mod นี้:
 * 1. มีธีมไทย 5 แบบ: สงกรานต์, ลอยกระทง, ดาร์กไทย, มินิมอล, ตลาดนัด
 * 2. เปลี่ยนธีมของ Claude Code (มืด/สว่าง) ผ่าน $.config.set("theme")
 * 3. วาดแถบสีของธีมเหนือช่องพิมพ์ ด้วยสี hex ของธีมนั้น
 * 4. จำธีมที่เลือกไว้ข้าม session ด้วย $.store
 *
 * หมายเหตุ: Mod ไม่มี DOM จึง inject CSS ไม่ได้ สีที่ Mod คุมได้คือ
 * สีของ element ที่ Mod วาดเอง (Text color="#hex") + ธีมหลักของ Claude Code
 */

import type { EngineInterface, Register } from 'claude-code'

// ==========================================================================
// บทที่ 1: นิยามธีมเป็น Object - แก้ตรงนี้เพื่อสร้างธีมของคุณเอง
// ==========================================================================
type Skin = {
  name: string
  base: 'dark' | 'light' // ธีมหลักของ Claude Code ที่จะสลับไป
  accent: string // สีหลัก (hex)
  soft: string // สีรอง (hex)
  tagline: string
}

const SKINS: Record<string, Skin> = {
  songkran: { name: '🇹🇭 สงกรานต์', base: 'light', accent: '#0288d1', soft: '#ffb300', tagline: 'ฟ้า-เหลืองทอง สดใส' },
  loykrathong: { name: '🌕 ลอยกระทง', base: 'dark', accent: '#ffd54f', soft: '#9575cd', tagline: 'ดำ-ม่วง-ทอง ค่ำคืน' },
  'dark-thai': { name: '🌙 ดาร์กไทย', base: 'dark', accent: '#4db6ac', soft: '#80cbc4', tagline: 'ดาร์กสบายตา เขียวมิ้นท์' },
  minimal: { name: '🤍 มินิมอล', base: 'light', accent: '#424242', soft: '#9e9e9e', tagline: 'ขาวคลีน โฟกัสงาน' },
  taladnat: { name: '🛍️ ตลาดนัด', base: 'dark', accent: '#ff1744', soft: '#ffea00', tagline: 'สีจัดจ้านแบบป้ายตลาด' },
}

const DEFAULT_SKIN = 'dark-thai'
const STORE_KEY = 'skin' // key ใน $.store (เก็บข้าม session)

let currentSkin = DEFAULT_SKIN // id ของธีมที่เลือกอยู่ ("" = ซ่อนแถบธีม)

// เปลี่ยนธีมที่แสดงแล้วสั่งให้แถบวาดใหม่
function setSkin($: EngineInterface, id: string): void {
  currentSkin = id
  $.ui.invalidate('ui.render')
}

// ==========================================================================
// บทที่ 2: เปลี่ยนธีมหลักของ Claude Code
// ==========================================================================
// $.config.set ทำเหมือนผู้ใช้เปลี่ยนใน /config เอง อาจได้ { deny } กลับมา
// (เช่น องค์กรล็อกค่าไว้) จึงต้องเช็คก่อนบอกว่าสำเร็จ
async function applyBaseTheme($: EngineInterface, base: 'dark' | 'light'): Promise<string> {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  if (!row) return 'ไม่พบการตั้งค่า theme ใน /config'
  if (row.value === base) return ''
  if (row.options && !row.options.includes(base)) return `ธีม "${base}" ไม่มีใน /config`

  const result = await $.config.set({ key: 'theme', value: base })
  return 'deny' in result && result.deny ? `เปลี่ยนธีมหลักไม่ได้: ${result.deny}` : ''
}

// เลือกธีม: เปลี่ยนแถบ + เก็บใน $.store (จำข้าม session)
async function chooseSkin($: EngineInterface, id: string): Promise<string> {
  const skin = SKINS[id]
  if (!skin) return `❌ ไม่มีธีม "${id}" ลองพิมพ์ /skin เพื่อดูรายการ`

  setSkin($, id)
  await $.store.set(STORE_KEY, id)
  const warning = await applyBaseTheme($, skin.base)

  return `🎨 เปลี่ยนเป็นธีม ${skin.name} (${skin.tagline})${warning ? `\n⚠️ ${warning}` : ''}`
}

function listSkins(current: string): string {
  const lines = Object.entries(SKINS).map(
    ([id, s]) => `${id === current ? '👉' : '  '} ${s.name.padEnd(14)} /skin ${id.padEnd(12)} ${s.tagline}`,
  )
  return ['🎨 ธีมไทยทั้งหมด (Mod 02)', '----------------------------------------', ...lines, '', '/skin off = ซ่อนแถบธีม | /skin-random = สุ่มธีม'].join('\n')
}

export const register: Register = on => {
  // ==========================================================================
  // บทที่ 3: session.start - โหลดธีมที่เคยเลือก + ลงทะเบียนคำสั่ง
  // ==========================================================================
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    const id = typeof saved === 'string' && (saved === '' || SKINS[saved]) ? saved : DEFAULT_SKIN
    setSkin($, id)

    await $.command.register({ name: 'skin', description: 'เปลี่ยนธีมไทย (ไม่ใส่ชื่อ = ดูรายการ)', argumentHint: '[ชื่อธีม|off]' })
    await $.command.register({ name: 'skin-random', description: 'สุ่มธีมไทย' })

    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่งแบบมี argument - /skin loykrathong
  // ==========================================================================
  on('command.run', { command: 'skin' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() // e.args = ข้อความหลังชื่อคำสั่ง
    if (arg === '' || arg === 'list') return { text: listSkins(currentSkin) }
    if (arg === 'off') {
      setSkin($, '')
      await $.store.set(STORE_KEY, '')
      return { text: '🙈 ซ่อนแถบธีมแล้ว (/skin <ชื่อ> เพื่อเปิดอีกครั้ง)' }
    }
    return { text: await chooseSkin($, arg) }
  })

  on('command.run', { command: 'skin-random' }, async $ => {
    const ids = Object.keys(SKINS)
    const id = ids[Math.floor(Math.random() * ids.length)] ?? DEFAULT_SKIN
    return { text: `🎲 สุ่มได้...\n${await chooseSkin($, id)}` }
  })

  // ==========================================================================
  // บทที่ 5: วาดแถบธีมเหนือช่องพิมพ์ด้วยสี hex ของธีม
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const skin = currentSkin ? SKINS[currentSkin] : undefined
    if (e.props.hasSurvey || !skin) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={skin.accent} bold>
          {skin.name}
        </Text>
        <Text color={skin.soft}> · {skin.tagline}</Text>
      </Box>
    )
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. สร้างธีมของคุณเอง: ก็อป 'dark-thai' ใน SKINS แล้วตั้งชื่อใหม่ เช่น 'my-brand'
 *    เปลี่ยน accent/soft เป็นสีแบรนด์ (แดงธงชาติ #ed1c24, น้ำเงิน #241d4f, ทอง #ffd700)
 *    บันทึกไฟล์ แล้ว /reload-plugins และ /skin my-brand
 * 2. เปลี่ยนธีมอัตโนมัติตามเวลา: กลางวันใช้ธีมสว่าง กลางคืนใช้ธีมมืด ด้วย $.clock.every
 * 3. แสดงแถบธีมเฉพาะตอนเริ่ม session แล้วซ่อนเองหลัง 1 นาที ด้วย $.clock.after
 */
