/**
 * ============================================================================
 * MOD 36: Drum TH - กลองชุดในแผงข้าง Claude Code (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: drum machine แบบ Roland TR-808 และแอปกลองบนมือถือ
 *
 * หน้าที่ของ Mod นี้:
 * 1. แผงกลอง 8 ชิ้น กดด้วยปุ่มคีย์บอร์ด (k = กระเดื่อง, s = สแนร์, h = ไฮแฮท ...)
 * 2. อัดจังหวะที่ตี แล้วเล่นซ้ำได้
 * 3. Beat สำเร็จรูป (rock, pop, funk, hiphop, ลูกทุ่ง) แบบ step sequencer 16 ช่อง ปรับ BPM ได้
 * 4. เสียงกลองในโฟลเดอร์ sounds/ สังเคราะห์ขึ้นเอง (ไม่ใช้ไฟล์ของใคร)
 *
 * เรื่องเสียง: $.audio.play เล่นได้บน macOS แต่ terminal ของ Windows/Linux ไม่มีเครื่องเล่น
 * Mod นี้จึงเล่นผ่าน PowerShell บน Windows (ช้ากว่าเล็กน้อยทุกครั้งที่ตี) และ aplay/paplay บน Linux
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Pad {
  id: string
  key: string // ปุ่มบนคีย์บอร์ด (ตัวพิมพ์เล็ก 1 ตัว)
  name: string
  icon: string
}
interface Hit {
  pad: string
  at: number // มิลลิวินาทีนับจากเริ่มอัด
}

const PANE = 'drum-th'
const PADS: Pad[] = [
  { id: 'kick', key: 'k', name: 'กระเดื่อง', icon: '🥁' },
  { id: 'snare', key: 's', name: 'สแนร์', icon: '🪘' },
  { id: 'hihat', key: 'h', name: 'ไฮแฮท', icon: '🔔' },
  { id: 'openhat', key: 'o', name: 'ไฮแฮทเปิด', icon: '🛎️' },
  { id: 'tom-high', key: 't', name: 'ทอมสูง', icon: '🟠' },
  { id: 'tom-low', key: 'l', name: 'ทอมต่ำ', icon: '🟤' },
  { id: 'clap', key: 'c', name: 'ปรบมือ', icon: '👏' },
  { id: 'crash', key: 'x', name: 'แฉ', icon: '💥' },
]

// ==========================================================================
// บทที่ 1: Beat สำเร็จรูป - 16 ช่องต่อห้อง, "x" = ตี
// ==========================================================================
const BEATS: Record<string, { bpm: number; steps: Record<string, string> }> = {
  rock: { bpm: 110, steps: { kick: 'x.......x.x.....', snare: '....x.......x...', hihat: 'x.x.x.x.x.x.x.x.' } },
  pop: { bpm: 100, steps: { kick: 'x.....x...x.....', snare: '....x.......x...', hihat: 'xxxxxxxxxxxxxxxx', clap: '............x...' } },
  funk: { bpm: 96, steps: { kick: 'x..x..x...x..x..', snare: '....x..x.x..x...', hihat: 'x.xxx.xxx.xxx.xx', openhat: '..............x.' } },
  hiphop: { bpm: 88, steps: { kick: 'x......x..x.....', snare: '....x.......x...', hihat: 'x.x.x.x.x.x.x.xx' } },
  ลูกทุ่ง: { bpm: 128, steps: { kick: 'x...x...x...x...', snare: '..x...x...x...x.', hihat: 'x.x.x.x.x.x.x.x.', 'tom-low': '..............xx' } },
}

let isWindows = false
let isMac = false
let useEngineAudio = false
let recording: { startedAt: number; hits: Hit[] } | undefined
let lastTake: Hit[] = []
let player: Timer | undefined
let playingName = ''
let step = 0
let hits = 0
let lastPad = ''

// ==========================================================================
// บทที่ 2: เล่นเสียง - เลือกวิธีตามระบบ (ส่ง path ผ่าน env กันคำสั่งแทรก)
// ==========================================================================
function play($: EngineInterface, padId: string): void {
  const asset = `sounds/${padId}.wav`
  if (useEngineAudio || isMac) {
    void $.audio.play({ asset }).catch(() => undefined)
    return
  }
  const file = `${$.plugin.root}${isWindows ? '\\sounds\\' : '/sounds/'}${padId}.wav`
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', '(New-Object Media.SoundPlayer $env:DR_FILE).PlaySync()']
    : ['sh', '-c', 'paplay "$DR_FILE" 2>/dev/null || aplay -q "$DR_FILE"']
  // ไม่ await: ให้ตีรัวๆ ได้ เสียงซ้อนกันได้
  void $.process.run(argv, { env: { DR_FILE: file }, timeoutMs: 10_000 }).catch(() => undefined)
}

async function hit($: EngineInterface, padId: string): Promise<void> {
  play($, padId)
  hits++
  lastPad = padId
  if (recording) recording.hits.push({ pad: padId, at: (await $.clock.now()) - recording.startedAt })
  $.ui.invalidate('ui.render')
}

// ==========================================================================
// บทที่ 3: เล่น beat แบบ step sequencer และเล่นซ้ำสิ่งที่อัดไว้
// ==========================================================================
function stopPlaying(): void {
  player?.cancel()
  player = undefined
  playingName = ''
}

function playBeat($: EngineInterface, name: string, bpm: number): void {
  const beat = BEATS[name]
  if (!beat) return
  stopPlaying()
  playingName = name
  step = 0
  const stepMs = Math.round(60_000 / bpm / 4) // 1 จังหวะ = 4 ช่อง (โน้ตเขบ็ตสองชั้น)
  player = $.clock.every(stepMs, () => {
    for (const [pad, pattern] of Object.entries(beat.steps)) if (pattern[step % 16] === 'x') play($, pad)
    step = (step + 1) % 16
    $.ui.invalidate('ui.render')
  })
}

function replay($: EngineInterface, take: Hit[], loop: boolean): void {
  stopPlaying()
  if (take.length === 0) return
  playingName = 'อัดไว้'
  const length = (take.at(-1)?.at ?? 0) + 500
  const once = () => {
    for (const h of take) $.clock.after(h.at, () => play($, h.pad))
  }
  once()
  // วนซ้ำ: เล่นใหม่ทุกครั้งที่ครบความยาวของที่อัด
  player = loop ? $.clock.every(length, once) : $.clock.after(length, stopPlaying)
}

// อัด/หยุดอัด (ต้องอยู่ระดับบนสุดของไฟล์ เพราะรับ $ ไป)
async function toggleRec($: EngineInterface): Promise<string> {
  if (recording) {
    lastTake = recording.hits
    recording = undefined
    await $.store.set('drum', { lastTake, useEngineAudio })
    $.ui.invalidate('ui.render')
    return `⏹️ อัดได้ ${lastTake.length} ครั้ง ยาว ${((lastTake.at(-1)?.at ?? 0) / 1000).toFixed(1)} วิ (/drum play เพื่อฟัง)`
  }
  stopPlaying()
  recording = { startedAt: await $.clock.now(), hits: [] }
  $.ui.invalidate('ui.render')
  return '🔴 เริ่มอัด ตีกลองได้เลย แล้ว /drum stop'
}

const HELP = `🥁 Drum TH (Mod 36)
========================================
/drum                     เปิดแผงกลอง (กดปุ่มบนคีย์บอร์ดได้เลย)
   ${PADS.map(p => `${p.key}=${p.name}`).join('  ')}
/drum rec | stop          อัด / หยุดอัด (หรือหยุดเล่น)
/drum play [loop]         เล่นสิ่งที่อัดไว้
/drum beat <ชื่อ> [bpm]   beat สำเร็จรูป: ${Object.keys(BEATS).join(', ')}
/drum hit <ชื่อเสียง...>   ตีจากคำสั่ง เช่น /drum hit kick snare
/drum sound engine|system เลือกวิธีเล่นเสียง (ถ้าไม่มีเสียง ลองสลับดู)`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    const saved = (await $.store.get('drum')) as { lastTake?: Hit[]; useEngineAudio?: boolean } | undefined
    lastTake = saved?.lastTake ?? []
    useEngineAudio = saved?.useEngineAudio ?? false
    await $.command.register({ name: 'drum', description: 'กลองชุดในแผง ตี อัด เล่นซ้ำ beat สำเร็จรูป (/drum help)', argumentHint: 'rec|stop|play|beat|hit' })
    return next(e)
  })

  on('ui.close', ($, e, next) => {
    if (e.id === PANE) stopPlaying()
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงกลอง - ปุ่มแต่ละชิ้นมี hotkey
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const status = recording ? `🔴 กำลังอัด (${recording.hits.length} ครั้ง)` : playingName ? `▶️ ${playingName}${BEATS[playingName] ? ` · ช่อง ${step + 1}/16` : ''}` : `ตีไปแล้ว ${hits} ครั้ง`
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>🥁 กลองชุด · {status}</Text>
        <Box flexWrap="wrap" gap={1}>
          {PADS.map(p => (
            <Button key={p.id} hotkey={p.key} label={`${p.icon} ${p.name}`} variant={lastPad === p.id ? 'primary' : undefined} onPress={() => void hit($, p.id)} />
          ))}
        </Box>
        <Box gap={1}>
          <Button key="rec" label={recording ? '⏹ หยุดอัด' : '⏺ อัด'} onPress={() => void toggleRec($)} />
          <Button key="replay" label="▶ เล่นที่อัด" onPress={() => replay($, lastTake, false)} />
          <Button key="stop" label="⏹ หยุด" onPress={() => { stopPlaying(); $.ui.invalidate('ui.render') }} />
        </Box>
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /drum
  // ==========================================================================
  on('command.run', { command: 'drum' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        const opened = await $.ui.open({ id: PANE, title: '🥁 Drum', focus: true, closeOnEscape: true })
        return { text: opened.isPlaced ? `🥁 เปิดแผงกลองแล้ว กด ${PADS.map(p => p.key).join(' ')} บนคีย์บอร์ดเพื่อตี` : `เปิดแผงไม่ได้ (${opened.reason}) ใช้ /drum hit kick snare แทน` }
      }
      case 'rec':
        return { text: recording ? 'กำลังอัดอยู่แล้ว (/drum stop)' : await toggleRec($) }
      case 'stop':
        if (recording) return { text: await toggleRec($) }
        stopPlaying()
        $.ui.invalidate('ui.render')
        return { text: '⏹️ หยุดแล้ว' }
      case 'play':
        if (lastTake.length === 0) return { text: 'ยังไม่มีสิ่งที่อัดไว้ (/drum rec)' }
        replay($, lastTake, rest[0] === 'loop')
        $.ui.invalidate('ui.render')
        return { text: `▶️ เล่น ${lastTake.length} ครั้ง${rest[0] === 'loop' ? ' วนซ้ำ (/drum stop เพื่อหยุด)' : ''}` }
      case 'beat': {
        const [name = '', bpmText] = rest
        const beat = BEATS[name]
        if (!beat) return { text: `beat ที่มี: ${Object.keys(BEATS).join(', ')}` }
        const bpm = Math.min(200, Math.max(50, Number(bpmText) || beat.bpm))
        playBeat($, name, bpm)
        await $.ui.open({ id: PANE, title: '🥁 Drum', focus: true, closeOnEscape: true })
        return { text: `🎶 เล่น ${name} ${bpm} BPM (/drum stop เพื่อหยุด)\n${Object.entries(beat.steps).map(([p, s]) => `  ${p.padEnd(8)} ${s}`).join('\n')}` }
      }
      case 'hit': {
        const pads = rest.filter(r => PADS.some(p => p.id === r || p.key === r)).map(r => PADS.find(p => p.id === r || p.key === r)?.id ?? r)
        if (pads.length === 0) return { text: `ชื่อเสียง: ${PADS.map(p => p.id).join(', ')}` }
        for (const p of pads) await hit($, p)
        return { text: `🥁 ${pads.join(' ')}` }
      }
      case 'sound':
        useEngineAudio = rest[0] === 'engine'
        await $.store.set('drum', { lastTake, useEngineAudio })
        return { text: useEngineAudio ? '🔊 เล่นผ่าน Claude Code ($.audio.play)' : '🔊 เล่นผ่านโปรแกรมของระบบ (PowerShell / aplay)' }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ทำ step sequencer ในแผง: ตาราง 16 ช่องกดเปิด/ปิดได้ แล้วบันทึกเป็น beat ใหม่
 * 2. ส่งออกจังหวะที่อัดเป็นไฟล์ MIDI
 * 3. ตีกลองฉลองเมื่อ test ผ่าน: ดัก tool.call ของ Bash ที่รัน npm test แล้ว exit 0
 */
