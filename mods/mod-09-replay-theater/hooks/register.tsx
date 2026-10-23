/**
 * ============================================================================
 * MOD 09: Replay Theater TH - ดูย้อนหลังว่า Claude ทำอะไรไปบ้างแบบหนัง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ตัวอย่าง replay ของ Anthropic
 *
 * หน้าที่ของ Mod นี้:
 * 1. บันทึกทุกอย่างเป็น "ฉาก": prompt ของคุณ, tool ที่เรียก, ผลลัพธ์, คำตอบของ Claude
 * 2. /replay ดูทั้งหมด หรือกรองดู (last, scene, errors, tools)
 * 3. /replay play เล่นทีละฉากในแผงด้านข้าง เหมือนดูหนัง
 * 4. /replay export ส่งออกเป็นไฟล์ HTML เปิดดูใน browser ได้
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

type SceneType = 'prompt' | 'tool_call' | 'tool_result' | 'error' | 'answer'

type TheaterScene = {
  id: number
  time: number // เวลา (ms)
  type: SceneType
  title: string
  content: string
  durationMs?: number // เฉพาะผลของ tool
}

type Playback = {
  index: number // ฉากที่กำลังเล่น (ลำดับใน scenes)
  isPlaying: boolean
}

const PANE = 'replay-theater-th'
const MAX_SCENES = 200

const ICON: Record<SceneType, string> = { prompt: '🗣️', tool_call: '🔧', tool_result: '✅', error: '❌', answer: '💬' }

let sceneIdCounter = 0
let isRecording = true
let projectRoot = ''
let playTimer: Timer | undefined
let scenes: TheaterScene[] = [] // ทุกฉาก (เริ่มใหม่เมื่อ reload mod)
let playback: Playback = { index: 0, isPlaying: false }

// เปลี่ยน playback แล้วสั่งให้แผงวาดใหม่
function setPlayback($: EngineInterface, value: Playback): void {
  playback = value
  $.ui.invalidate('ui.render')
}

// ==========================================================================
// บทที่ 1: เก็บ Timeline แบบฉากหนัง
// ==========================================================================
async function addScene($: EngineInterface, type: SceneType, title: string, content: string, durationMs?: number): Promise<void> {
  if (!isRecording) return
  const scene: TheaterScene = { id: sceneIdCounter++, time: await $.clock.now(), type, title, content: content.slice(0, 500), durationMs }
  scenes = [...scenes, scene].slice(-MAX_SCENES) // เก็บแค่ 200 ฉากล่าสุด
  $.ui.invalidate('ui.render')
}

function timeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return sec < 60 ? `${sec}วิที่แล้ว` : sec < 3600 ? `${Math.floor(sec / 60)}นาทีที่แล้ว` : `${Math.floor(sec / 3600)}ชม.ที่แล้ว`
}

function sceneLine(s: TheaterScene, now: number): string {
  const took = s.durationMs !== undefined ? ` (${s.durationMs}ms)` : ''
  return `[ฉากที่ ${s.id}] ${ICON[s.type]} ${s.title} - ${timeAgo(now - s.time)}${took}`
}

// สรุป input ของ tool สั้นๆ เช่น "อ่านไฟล์: src/App.tsx"
function describeInput(e: Record<string, unknown>): string {
  for (const [key, label] of [['file_path', 'ไฟล์'], ['command', 'คำสั่ง'], ['url', 'URL'], ['pattern', 'ค้นหา'], ['description', 'งาน']] as const) {
    const value = e[key]
    if (typeof value === 'string' && value) return `${label}: ${value}`
  }
  return ''
}

// ==========================================================================
// บทที่ 4: ส่งออกเป็น HTML (escape ข้อความก่อนใส่ HTML เสมอ!)
// ==========================================================================
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildTheaterHTML(scenes: TheaterScene[]): string {
  const colors: Record<SceneType, string> = { prompt: '#1565c0', tool_call: '#6a1b9a', tool_result: '#2e7d32', error: '#c62828', answer: '#ef6c00' }
  const items = scenes
    .map(
      s => `<div class="scene" style="border-left-color:${colors[s.type]}">
  <div class="head">[ฉากที่ ${s.id}] ${ICON[s.type]} ${escapeHtml(s.title)} <span>${new Date(s.time).toLocaleTimeString('th-TH')}${s.durationMs !== undefined ? ` · ${s.durationMs}ms` : ''}</span></div>
  ${s.content ? `<pre>${escapeHtml(s.content)}</pre>` : ''}
</div>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Replay Theater</title>
<style>
  body { font-family: system-ui, sans-serif; background: #111; color: #eee; max-width: 900px; margin: 0 auto; padding: 16px; }
  .scene { border-left: 4px solid; background: #1c1c1c; margin: 8px 0; padding: 8px 12px; border-radius: 4px; }
  .head span { color: #888; font-size: 0.85em; margin-left: 8px; }
  pre { white-space: pre-wrap; word-break: break-word; color: #bbb; margin: 6px 0 0; }
</style></head>
<body><h1>🎬 Replay Theater</h1><p>${scenes.length} ฉาก</p>
${items}
</body></html>
`
}

// ==========================================================================
// บทที่ 3: เล่นทีละฉากด้วย timer ($.clock.every)
// ==========================================================================
function stopPlaying(): void {
  playTimer?.cancel()
  playTimer = undefined
}

function startPlaying($: EngineInterface, ms: number): void {
  stopPlaying()
  setPlayback($, { index: 0, isPlaying: true })
  playTimer = $.clock.every(ms, () => {
    const index = playback.index + 1
    if (index >= scenes.length) {
      stopPlaying()
      setPlayback($, { index: Math.max(0, scenes.length - 1), isPlaying: false })
    } else {
      setPlayback($, { index, isPlaying: true })
    }
  })
}

const HELP = [
  '/replay              ดูทั้งหมด',
  '/replay last 5       ดู 5 ฉากหลังสุด',
  '/replay scene 10     ดูฉากที่ 10 แบบละเอียด',
  '/replay errors       ดูเฉพาะที่พัง',
  '/replay tools        สรุปว่าใช้ tool อะไรไปเท่าไหร่',
  '/replay play 1000    เล่นในแผง ฉากละ 1 วินาที (/replay stop เพื่อหยุด)',
  '/replay export       ส่งออกเป็น HTML',
  '/replay pause | resume | clear',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd
    isRecording = true
    await $.command.register({ name: 'replay', description: 'ดูย้อนหลังว่า Claude ทำอะไรไปบ้าง (/replay help)', argumentHint: '[last|scene|errors|tools|play|export|...]' })
    await addScene($, 'prompt', 'เริ่มบันทึกแล้ว 🎬', '')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 2: ดักทุก event ที่อยากบันทึก
  // ==========================================================================
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta) await addScene($, 'prompt', e.command ? `คำสั่ง /${e.command.name}` : 'คุณพิมพ์', e.text)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = describeInput(e as unknown as Record<string, unknown>)
    await addScene($, 'tool_call', `เรียก ${e.tool}`, input)

    const startedAt = await $.clock.now()
    const ran = await next(e)
    const took = (await $.clock.now()) - startedAt

    if (ran.deny !== undefined) await addScene($, 'error', `${e.tool} ถูกปฏิเสธ`, ran.deny, took)
    else if (ran.isError) await addScene($, 'error', `${e.tool} ล้มเหลว`, ran.text ?? '', took)
    else await addScene($, 'tool_result', `${e.tool} สำเร็จ`, (ran.text ?? '').slice(0, 300), took)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.answer) await addScene($, 'answer', 'Claude ตอบ', e.answer)
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: แผงสำหรับเล่น (Pane) - วาดฉากที่ playback.index ชี้อยู่
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const scene = scenes[playback.index]

    if (!scene) return <Text dimColor>ยังไม่มีฉาก</Text>
    return (
      <Box flexDirection="column">
        <Text bold>
          {ICON[scene.type]} ฉากที่ {scene.id} ({playback.index + 1}/{scenes.length}) {playback.isPlaying ? '▶️' : '⏹️'}
        </Text>
        <Text>{scene.title}</Text>
        {scene.content && <Text dimColor>{scene.content}</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'replay' }, async ($, e) => {
    const [sub = '', value = ''] = e.args.trim().split(/\s+/)
    const now = await $.clock.now()

    switch (sub) {
      case 'help':
        return { text: HELP }
      case 'last': {
        const n = Math.max(1, Number(value) || 5)
        return { text: scenes.slice(-n).map(s => sceneLine(s, now)).join('\n') || 'ยังไม่มีฉาก' }
      }
      case 'scene': {
        const s = scenes.find(x => x.id === Number(value))
        if (!s) return { text: `❌ ไม่มีฉากที่ ${value}` }
        return { text: `${sceneLine(s, now)}\nType: ${s.type}\n${s.content}` }
      }
      case 'errors': {
        const errors = scenes.filter(s => s.type === 'error')
        return { text: errors.length ? errors.map(s => `${sceneLine(s, now)}\n  ${s.content.slice(0, 200)}`).join('\n') : '🎉 ไม่มี error เลย' }
      }
      case 'tools': {
        const count = new Map<string, number>()
        for (const s of scenes) if (s.type === 'tool_call') count.set(s.title, (count.get(s.title) ?? 0) + 1)
        const rows = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => `🔧 ${t.replace('เรียก ', '').padEnd(14)} ${c} ครั้ง`)
        return { text: rows.length ? rows.join('\n') : 'ยังไม่ได้เรียก tool' }
      }
      case 'play': {
        if (scenes.length === 0) return { text: 'ยังไม่มีฉากให้เล่น' }
        const ms = Math.max(200, Number(value) || 1000)
        const opened = await $.ui.open({ id: PANE, title: '🎬 Replay Theater' })
        if (!opened.isPlaced) return { text: `เปิดแผงไม่ได้ (${opened.reason})` }
        startPlaying($, ms)
        return { text: `▶️ เล่น ${scenes.length} ฉาก ฉากละ ${ms}ms (/replay stop เพื่อหยุด)` }
      }
      case 'stop':
        stopPlaying()
        setPlayback($, { index: 0, isPlaying: false })
        return { text: '⏹️ หยุดเล่นแล้ว' }
      case 'export': {
        const d = new Date(now) // ใช้เวลาเครื่อง เช่น 2026-10-23-153000
        const pad = (x: number) => String(x).padStart(2, '0')
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
        const sep = projectRoot.includes('\\') ? '\\' : '/'
        const path = `${projectRoot}${sep}replay-${date}.html`
        await $.fs.write(path, buildTheaterHTML(scenes))
        return { text: `💾 ส่งออกแล้ว: ${path} (เปิดใน browser ได้เลย)` }
      }
      case 'pause':
        isRecording = false
        return { text: '⏸️ หยุดบันทึกชั่วคราว (/replay resume เพื่อบันทึกต่อ)' }
      case 'resume':
        isRecording = true
        return { text: '⏺️ บันทึกต่อแล้ว' }
      case 'clear':
        stopPlaying()
        scenes = []
        setPlayback($, { index: 0, isPlaying: false })
        return { text: '🧹 ล้างฉากทั้งหมดแล้ว' }
      default: {
        const header = `🎬 Replay Theater - ${scenes.length} ฉาก${isRecording ? '' : ' (หยุดบันทึกอยู่)'}\n========================================`
        return { text: [header, ...scenes.slice(-40).map(s => sceneLine(s, now)), '', '/replay help = ดูคำสั่งทั้งหมด'].join('\n') }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เพิ่มปุ่ม ⏮️ ⏯️ ⏭️ ในแผง (Button + onPress) เพื่อเลื่อนฉากเอง
 * 2. เก็บฉากลง $.store เพื่อดูย้อนหลังข้าม session
 * 3. ใช้ทำคอร์สสอน: export HTML แล้วแชร์ให้ผู้เรียนดูว่า AI ทำงานทีละขั้นยังไง
 */
