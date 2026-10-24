/**
 * ============================================================================
 * MOD 44: Kawaii TH - มาสคอตน่ารักที่เปลี่ยนหน้าตามอารมณ์ของ Claude (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Tamagotchi และ kaomoji ญี่ปุ่น (◕‿◕)
 *
 * หน้าที่ของ Mod นี้:
 * 1. มาสคอตเหนือช่องพิมพ์ เปลี่ยนสีหน้าตามสถานะจริงของ Claude:
 *    กำลังคิด / ใช้เครื่องมือ / เจอ error / เสร็จแล้ว / รอคุณตอบ / ว่าง
 * 2. เลือกตัวละครได้ 6 ตัว (แมว หมี กระต่าย เพนกวิน ผี ก้อนวุ้น)
 * 3. คลัง kaomoji 50 แบบ แบ่งหมวด ส่งเข้าช่องพิมพ์ได้
 *
 * หมายเหตุ: spinner น่ารักอยู่ใน Mod 35 แล้ว ตัวนี้เน้นมาสคอตตามสถานะ
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

type Mood = 'idle' | 'thinking' | 'tool' | 'error' | 'done' | 'waiting'

// ==========================================================================
// บทที่ 1: ตัวละคร - แต่ละตัวมีหน้า 2 เฟรมต่ออารมณ์ (สลับเฟรม = กระพริบ/ขยับ)
// ==========================================================================
interface Mascot {
  name: string
  color: string
  faces: Record<Mood, [string, string]>
}

const MASCOTS = {
  cat: {
    name: 'แมวเหมียว',
    color: '#ff8fab',
    faces: {
      idle: ['ฅ^•ﻌ•^ฅ', 'ฅ^-ﻌ-^ฅ'],
      thinking: ['(=ↀωↀ=)?', '(=ↀωↀ=)…'],
      tool: ['ฅ(=•ω•=)ฅ🔧', 'ฅ(=•ω•=)ฅ🔨'],
      error: ['(=TωT=)', '(=;ω;=)'],
      done: ['(=^▽^=)✨', '(=^ω^=)🎉'],
      waiting: ['(=･ω･=)ﾉ?', '(=･ω･=)ﾉ!'],
    },
  },
  bear: {
    name: 'หมีน้อย',
    color: '#c08552',
    faces: {
      idle: ['ʕ•ᴥ•ʔ', 'ʕ-ᴥ-ʔ'],
      thinking: ['ʕ•ᴥ•ʔ💭', 'ʕ·ᴥ·ʔ💭'],
      tool: ['ʕ•̀ᴥ•́ʔ✧🔧', 'ʕ•̀ᴥ•́ʔ✧⚙️'],
      error: ['ʕ´•ᴥ•`ʔ', 'ʕ;ᴥ;ʔ'],
      done: ['ʕ•ᴥ•ʔ🍯', 'ʕ^ᴥ^ʔ🍯'],
      waiting: ['ʕ•ᴥ•ʔﾉ', 'ʕ•ᴥ•ʔﾉ゛'],
    },
  },
  bunny: {
    name: 'กระต่าย',
    color: '#b39ddb',
    faces: {
      idle: ['(\\_/)\n( •.•)', '(\\_/)\n( -.-)'],
      thinking: ['(\\_/)\n( •.•)?', '(\\_/)\n( °.°)?'],
      tool: ['(\\_/)\n( •.•)>🥕', '(\\_/)\n( •.•)>🔧'],
      error: ['(\\_/)\n( T.T)', '(\\_/)\n( ;.;)'],
      done: ['(\\_/)\n( ^.^)✨', '(\\_/)\n(≧.≦)🎉'],
      waiting: ['(\\_/)\n( •.•)ﾉ', '(\\_/)\n( •.•)/'],
    },
  },
  penguin: {
    name: 'เพนกวิน',
    color: '#4fc3f7',
    faces: {
      idle: ['<(\'v\')>', '<(-v-)>'],
      thinking: ['<(\'v\')>?', '<(°v°)>?'],
      tool: ['<(\'v\')>🔧', '<(\'v\')>💻'],
      error: ['<(;v;)>', '<(TvT)>'],
      done: ['\\(^v^)/', '<(^v^)>🐟'],
      waiting: ['<(\'v\')>ﾉ', '<(\'v\')>/'],
    },
  },
  ghost: {
    name: 'ผีน้อย',
    color: '#b0bec5',
    faces: {
      idle: ['👻 (ᵔᴥᵔ)', '👻 (ᵕᴥᵕ)'],
      thinking: ['👻 (・_・ヾ', '👻 (・_・;)'],
      tool: ['👻 ᕦ(ò_óˇ)ᕤ', '👻 ᕙ(ò_óˇ)ᕗ'],
      error: ['👻 (×_×)', '👻 (x_x)'],
      done: ['👻 ヽ(・∀・)ﾉ', '👻 \\(•◡•)/'],
      waiting: ['👻 (・ω・)ﾉ', '👻 (・ω・)/'],
    },
  },
  blob: {
    name: 'ก้อนวุ้น',
    color: '#81c784',
    faces: {
      idle: ['(｡•ᴗ•｡)', '(｡-ᴗ-｡)'],
      thinking: ['(｡•ˇ‸ˇ•｡)', '(｡•́︿•̀｡)?'],
      tool: ['(ง •̀_•́)ง', '(ว •̀_•́)ว'],
      error: ['(｡•́︿•̀｡)', '(｡╯︵╰｡)'],
      done: ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(ﾉ´ヮ`)ﾉ*: ･ﾟ'],
      waiting: ['(｡•ᴗ•｡)ﾉ', '(｡•ᴗ•｡)/'],
    },
  },
} satisfies Record<string, Mascot>

function findMascot(key: string): Mascot | undefined {
  return (MASCOTS as Record<string, Mascot>)[key]
}

const MOOD_TEXT: Record<Mood, string> = {
  idle: 'ว่างอยู่ คุยกันได้นะ',
  thinking: 'กำลังคิด…',
  tool: 'กำลังทำงาน',
  error: 'อุ๊ย มีอะไรผิดพลาด',
  done: 'เสร็จแล้ว!',
  waiting: 'รอคุณอยู่นะ',
}

// ==========================================================================
// บทที่ 2: คลัง kaomoji 50 แบบ
// ==========================================================================
const KAOMOJI: Record<string, string[]> = {
  ดีใจ: ['(◕‿◕)', '(＾▽＾)', '(≧▽≦)', 'ヽ(・∀・)ﾉ', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '٩(◕‿◕｡)۶', '(*^‿^*)', '\\(^o^)/', '(✿◠‿◠)', '(っ˘ω˘ς)'],
  รัก: ['(♡˙︶˙♡)', '(´｡• ᵕ •｡`) ♡', '(◍•ᴗ•◍)❤', '♡(ᐢ ᴥ ᐢし)', '(っ´▽`)っ♡', '(˘³˘)♥', '(*˘︶˘*).｡.:*♡', '(ɔˆ ³(ˆ⌣ˆc)', '♡＾▽＾♡', '(灬º‿º灬)♡'],
  เศร้า: ['(╥﹏╥)', '(｡•́︿•̀｡)', '(ಥ﹏ಥ)', '(T_T)', '(´；ω；`)', '(っ˘̩╭╮˘̩)っ', '(｡╯︵╰｡)', '(ノ_<。)', '(-_-;)', '(；へ：)'],
  สู้ๆ: ['(ง •̀_•́)ง', 'ᕦ(ò_óˇ)ᕤ', '(๑•̀ㅂ•́)و✧', '(ง°ل͜°)ง', '٩(ˊᗜˋ*)و', 'o(`ω´ )o', '(•̀ᴗ•́)و ̑̑', '(ᗒᗣᗕ)՞', '୧(๑•̀ᗝ•́)૭', '(ﾒ` ﾛ ´)'],
  สัตว์: ['ฅ^•ﻌ•^ฅ', 'ʕ•ᴥ•ʔ', '(=^･ω･^=)', 'U・ᴥ・U', "<('v')>", '(・θ・)', '(•ㅅ•)', '∪･ω･∪', '(◕ᴥ◕)', '/ᐠ｡ꞈ｡ᐟ\\'],
}

let mood: Mood = 'idle'
let mascot = 'cat'
let enabled = true
let toolName = ''
let frame = 0
let animator: Timer | undefined
let settle: Timer | undefined

// ==========================================================================
// บทที่ 3: เปลี่ยนอารมณ์ - ขยับเฟรมเฉพาะตอนกำลังทำงาน ว่างแล้วหยุด timer
// ==========================================================================
function setMood($: EngineInterface, next: Mood): void {
  mood = next
  settle?.cancel()
  settle = undefined
  const busy = next === 'thinking' || next === 'tool'
  if (busy && !animator) animator = $.clock.every(700, () => {
    frame++
    $.ui.invalidate('ui.render')
  })
  if (!busy) {
    animator?.cancel()
    animator = undefined
  }
  // done/error ค้างไว้สักพัก แล้วกลับเป็นว่าง
  if (next === 'done' || next === 'error') settle = $.clock.after(8_000, () => setMood($, 'idle'))
  $.ui.invalidate('ui.render')
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('kawaii', { mascot, enabled })
}

const HELP = `🌸 Kawaii TH (Mod 44)
========================================
/kawaii                 ดูมาสคอตและสถานะ
/kawaii pick <ตัว>      เปลี่ยนตัว: ${Object.entries(MASCOTS).map(([k, m]) => `${k}=${m.name}`).join(' ')}
/kawaii preview         ดูทุกอารมณ์ของตัวปัจจุบัน
/kawaii gallery [หมวด]  คลัง kaomoji 50 แบบ (${Object.keys(KAOMOJI).join(' ')})
/kawaii use <หมวด> <เลข>  ส่ง kaomoji ลงช่องพิมพ์
/kawaii on|off          แสดง/ซ่อนมาสคอต`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('kawaii')) as { mascot?: string; enabled?: boolean } | undefined
    mascot = saved?.mascot && findMascot(saved.mascot) ? saved.mascot : 'cat'
    enabled = saved?.enabled ?? true
    mood = 'idle'
    await $.command.register({ name: 'kawaii', description: 'มาสคอตน่ารักที่เปลี่ยนหน้าตามสถานะ Claude + คลัง kaomoji (/kawaii help)', argumentHint: 'pick|preview|gallery|use|on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: ฟังสถานะจริงของ Claude (เฉพาะงานหลัก ไม่นับ subagent)
  // ==========================================================================
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) setMood($, 'thinking')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    toolName = e.tool
    if (mood !== 'error') setMood($, 'tool')
    const r = await next(e)
    if (r.isError) setMood($, 'error')
    else if (mood === 'tool') setMood($, 'thinking')
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) setMood($, e.reason === 'error' ? 'error' : e.reason === 'aborted' ? 'idle' : 'done')
    return r
  })

  // Claude Code แจ้งว่ารออนุญาต/รอคำตอบ
  on('classic.Notification', async ($, e, next) => {
    setMood($, 'waiting')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (mood === 'waiting') setMood($, 'thinking')
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: วาดมาสคอตเหนือช่องพิมพ์
  // ==========================================================================
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!enabled || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const m = findMascot(mascot) ?? MASCOTS.cat
    const face = m.faces[mood][frame % 2 === 0 ? 0 : 1].split('\n')
    const label = mood === 'tool' && toolName ? `${MOOD_TEXT.tool}: ${toolName}` : MOOD_TEXT[mood]
    return (
      <Box flexDirection="row" gap={1}>
        <Box flexDirection="column">
          {face.map(l => (
            <Text color={m.color}>{l}</Text>
          ))}
        </Box>
        <Text color={mood === 'error' ? '#e57373' : undefined} dimColor={mood === 'idle'}>
          {label}
        </Text>
      </Box>
    )
  })

  on('command.run', { command: 'kawaii' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const m = findMascot(mascot) ?? MASCOTS.cat
    switch (sub) {
      case '':
        return { text: `${m.faces[mood][0]}  ${m.name} · ${MOOD_TEXT[mood]}${enabled ? '' : ' (ซ่อนอยู่)'}\n\n${HELP}` }
      case 'pick': {
        const key = rest[0] ?? ''
        const picked = findMascot(key)
        if (!picked) return { text: `ไม่มีตัว "${key}"\n${HELP}` }
        mascot = key
        enabled = true
        await save($)
        $.ui.invalidate('ui.render')
        return { text: `${picked.faces.done[0]}  สวัสดี! ฉันคือ${picked.name}` }
      }
      case 'preview':
        return { text: [`🌸 ${m.name}`, ...(Object.keys(MOOD_TEXT) as Mood[]).map(k => `${MOOD_TEXT[k].padEnd(22)} ${m.faces[k][0].replace('\n', ' ')}`)].join('\n') }
      case 'gallery': {
        const cats = rest[0] ? [rest[0]] : Object.keys(KAOMOJI)
        const out = cats.filter(c => KAOMOJI[c]).map(c => `【${c}】\n${(KAOMOJI[c] ?? []).map((k, i) => `${String(i + 1).padStart(2)}. ${k}`).join('\n')}`)
        return { text: out.length ? `🌸 kaomoji ${cats.length === 1 ? '' : '50 แบบ'}\n\n${out.join('\n\n')}\n\nส่งลงช่องพิมพ์: /kawaii use ดีใจ 3` : `ไม่มีหมวด "${rest[0]}" (${Object.keys(KAOMOJI).join(' ')})` }
      }
      case 'use': {
        const k = KAOMOJI[rest[0] ?? '']?.[Number(rest[1]) - 1]
        if (!k) return { text: 'วิธีใช้: /kawaii use ดีใจ 3  (ดูเลขจาก /kawaii gallery)' }
        await $.prompt.fill({ text: k })
        return { text: `ใส่ ${k} ลงช่องพิมพ์แล้ว` }
      }
      case 'on':
      case 'off':
        enabled = sub === 'on'
        await save($)
        $.ui.invalidate('ui.render')
        return { text: enabled ? `${m.faces.idle[0]} กลับมาแล้ว!` : 'ซ่อนมาสคอตแล้ว (/kawaii on เพื่อเรียกกลับ)' }
      default:
        return { text: HELP }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ให้มาสคอต "หิว" ถ้าไม่ได้คุยกันนาน และ "อิ่ม" ทุกครั้งที่งานสำเร็จ แบบ Tamagotchi
 * 2. ใช้หน้าตาต่างกันตามเครื่องมือ: Read = อ่านหนังสือ, Bash = พิมพ์คีย์บอร์ด
 * 3. ออกแบบตัวละครของคุณเองแล้วเพิ่มลงใน MASCOTS
 */
