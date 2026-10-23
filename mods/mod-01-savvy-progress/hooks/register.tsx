/**
 * ============================================================================
 * MOD 01: Savvy Progress TH - แถบ Progress แบบละเอียด (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: https://github.com/JohnnyVizz/claude-savvy
 *
 * หน้าที่ของ Mod นี้:
 * 1. แสดงเวลาที่ใช้ไปตั้งแต่เริ่ม session
 * 2. นับจำนวนครั้งที่เรียก tool และบอกว่ากำลังรัน tool อะไร
 * 3. รวม token ที่ใช้ และคิดเป็นเงินบาทโดยประมาณ
 * 4. วาดแถบเหนือช่องพิมพ์ (AbovePrompt) + มีคำสั่ง /progress
 *
 * แนวคิดสำคัญของ Claude Code Mod:
 * - on("ชื่อ event", hook) ใช้ดัก event; hook ได้ ($, e, next)
 * - $ คือ engine ของ Claude Code (เรียกแบบ $.noun.method เช่น $.ui.toast)
 * - e คือข้อมูลของ event, next(e) คือ "ทำงานต่อตามปกติ"
 * - ตัวแปรนอก register() จำค่าข้าม event ได้ (แต่จะเริ่มใหม่เมื่อ reload mod)
 * - เปลี่ยนค่าที่วาดบนจอแล้ว ต้องเรียก $.ui.invalidate("ui.render") ให้จอวาดใหม่
 */

import type { EngineInterface, Register, TurnUsage } from 'claude-code'

type ProgressStats = {
  startedAt: number // เวลาเริ่ม session (ms)
  toolCalls: number // เรียก tool ไปกี่ครั้ง
  currentTool: string // tool ที่กำลังรันอยู่ ("" = ว่าง)
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUSD: number
}

// ราคาโดยประมาณ (USD ต่อ 1 ล้าน token) - ตรวจราคาล่าสุดที่ anthropic.com/pricing แล้วแก้ได้เลย
const PRICE = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
const THB_PER_USD = 36.5 // อัตราแลกเปลี่ยน ปรับตามจริง

const EMPTY: ProgressStats = {
  startedAt: 0,
  toolCalls: 0,
  currentTool: '',
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUSD: 0,
}

// state ของ Mod: ตัวแปรนอก register() จำค่าข้าม event ได้
let stats: ProgressStats = { ...EMPTY }
let isHidden = false

// แก้ค่าแล้วบอก engine ให้วาดแถบใหม่ (วาดได้สูงสุด ~10 ครั้ง/วินาที engine รวมให้เอง)
function patchStats($: EngineInterface, fn: (s: ProgressStats) => ProgressStats): void {
  stats = fn(stats)
  $.ui.invalidate('ui.render')
}

// ฟังก์ชันช่วย: แปลง ms เป็น 1:05:23 หรือ 5:23
function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// ฟังก์ชันช่วย: คิดเงินจาก usage ของหนึ่ง turn
function costOf(usage: TurnUsage): number {
  return (
    (usage.input_tokens / 1e6) * PRICE.input +
    (usage.output_tokens / 1e6) * PRICE.output +
    (usage.cache_creation_input_tokens / 1e6) * PRICE.cacheWrite +
    (usage.cache_read_input_tokens / 1e6) * PRICE.cacheRead
  )
}

function totalTokens(s: ProgressStats): number {
  return s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens
}

function buildReport(s: ProgressStats, now: number): string {
  const thb = s.costUSD * THB_PER_USD
  return [
    '📊 Savvy Progress TH',
    '----------------------------------------',
    `⏱️ เวลาที่ใช้: ${formatElapsed(now - s.startedAt)}`,
    `🔧 เรียก tool: ${s.toolCalls} ครั้ง`,
    `🛠️ ตอนนี้: ${s.currentTool || 'ว่าง'}`,
    `🪙 token รวม: ${totalTokens(s).toLocaleString('en-US')}`,
    `   ├─ input ${s.inputTokens.toLocaleString('en-US')} | output ${s.outputTokens.toLocaleString('en-US')}`,
    `   └─ cache อ่าน ${s.cacheReadTokens.toLocaleString('en-US')} | cache เขียน ${s.cacheWriteTokens.toLocaleString('en-US')}`,
    `💰 ค่าใช้จ่ายโดยประมาณ: $${s.costUSD.toFixed(4)} (~${thb.toFixed(2)}฿)`,
  ].join('\n')
}

export const register: Register = on => {
  // ==========================================================================
  // บทที่ 1: session.start - เริ่มนับใหม่ + ลงทะเบียนคำสั่ง /progress
  // ==========================================================================
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    patchStats($, () => ({ ...EMPTY, startedAt: now }))

    // คำสั่ง slash ต้องลงทะเบียนก่อน แล้วค่อยตอบใน command.run (บทที่ 5)
    await $.command.register({
      name: 'progress',
      description: 'ดูความคืบหน้า: เวลา, จำนวน tool, token และค่าใช้จ่ายเป็นบาท',
      argumentHint: '[show|hide]',
    })

    return next(e) // สำคัญ: ต้อง next ไม่งั้น session จะไม่เริ่มต่อ
  })

  // ==========================================================================
  // บทที่ 2: tool.call - รู้ว่ากำลังรัน tool อะไร
  // ==========================================================================
  // ก่อน next = tool ยังไม่รัน, หลัง await next = tool รันเสร็จแล้ว
  on('tool.call', async ($, e, next) => {
    patchStats($, s => ({ ...s, toolCalls: s.toolCalls + 1, currentTool: e.tool }))
    $.ui.status(`⏳ กำลังรัน: ${e.tool}`)

    const ran = await next(e)

    patchStats($, s => ({ ...s, currentTool: '' }))
    $.ui.status(undefined) // undefined = ลบข้อความใน status line

    return ran // ส่งผลลัพธ์ของ tool ต่อไปตามเดิม
  })

  // ==========================================================================
  // บทที่ 3: turn.complete - Claude ตอบจบหนึ่งรอบ ได้ usage มาบวกเพิ่ม
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage) {
      patchStats($, s => ({
        ...s,
        inputTokens: s.inputTokens + usage.input_tokens,
        outputTokens: s.outputTokens + usage.output_tokens,
        cacheReadTokens: s.cacheReadTokens + usage.cache_read_input_tokens,
        cacheWriteTokens: s.cacheWriteTokens + usage.cache_creation_input_tokens,
        costUSD: s.costUSD + costOf(usage),
      }))
    }
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ui.render - วาดแถบเหนือช่องพิมพ์ (AbovePrompt)
  // ==========================================================================
  // engine เรียก hook นี้ทุกครั้งที่ต้องวาดแถบ (รวมถึงหลัง $.ui.invalidate)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = stats
    if (e.props.hasSurvey || s.startedAt === 0 || isHidden) {
      return next(e) // ไม่วาดอะไร ให้ engine วาดของมันเอง
    }

    const { Box, Text } = $.ui.resolve(e) // element ของจอนี้ (terminal/desktop/...)
    const now = await $.clock.now()
    const thb = s.costUSD * THB_PER_USD

    return (
      <Box>
        <Text dimColor>
          ⏱️ {formatElapsed(now - s.startedAt)} | 🔧 {s.toolCalls} | 🪙{' '}
          {totalTokens(s).toLocaleString('en-US')} | 💰 {thb.toFixed(2)}฿
          {s.currentTool ? ` | 🛠️ ${s.currentTool}` : ''}
        </Text>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: command.run - ตอบคำสั่ง /progress ของเราเอง
  // ==========================================================================
  // ไม่เรียก next เพราะเราตอบเองทั้งหมด; { text } จะแสดงเป็นผลลัพธ์ของคำสั่ง
  on('command.run', { command: 'progress' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide') {
      isHidden = true
      $.ui.invalidate('ui.render')
      return { text: '🙈 ซ่อนแถบ progress แล้ว (/progress show เพื่อแสดงอีกครั้ง)' }
    }
    if (arg === 'show') {
      isHidden = false
      $.ui.invalidate('ui.render')
      return { text: '👀 แสดงแถบ progress แล้ว' }
    }
    return { text: buildReport(stats, await $.clock.now()) }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เก็บยอดรวมข้าม session ด้วย $.store.set("total", ...) แล้วโชว์ "เดือนนี้ใช้ไปกี่บาท"
 * 2. ถ้า turn ไหนนานเกิน 2 นาที ให้ $.ui.toast("งานนี้ใช้เวลานานนะ")
 * 3. เปลี่ยน PRICE ให้ตรงกับ model ที่ใช้ (usage.model บอกชื่อ model ของ turn นั้น)
 */
