/**
 * ============================================================================
 * MOD 28: Media Playlist TH - จัด Playlist จาก YouTube, Spotify หรือไฟล์ในเครื่อง (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: Winamp และคิวเพลงของ Spotify
 *
 * หน้าที่ของ Mod นี้:
 * 1. สร้าง playlist หลายชุด เพิ่มเพลงเป็นลิงก์ YouTube/Spotify หรือไฟล์ในเครื่อง (.mp3 .mp4 ...)
 * 2. ใส่ลิงก์แล้วดึงชื่อเพลงให้เองผ่าน oEmbed ของ YouTube/Spotify
 * 3. กดเล่นแล้วเปิดด้วยแอป/เบราว์เซอร์ของเครื่อง, มีถัดไป ย้อนกลับ สุ่ม วนซ้ำ
 * 4. แผง "กำลังเล่น" พร้อมปุ่ม ⏮ ⏭ และส่งออกเป็นไฟล์ .m3u
 *
 * ข้อจำกัด: Mod ไม่ได้เล่นเสียงเอง และไม่รู้ว่าเพลงจบเมื่อไหร่ จึงกด "ถัดไป" เอง
 * (คุม Spotify จากในนี้ต้องใช้ Spotify Web API + OAuth ซึ่งเกินขอบเขตของ Mod นี้)
 */

import type { EngineInterface, Register } from 'claude-code'

interface Track {
  title: string
  target: string // URL หรือ path ของไฟล์
}
interface State {
  playlists: Record<string, Track[]>
  current?: string // ชื่อ playlist ที่เล่นอยู่
  index: number
  shuffle: boolean
  repeat: boolean
  order: number[] // ลำดับเล่น (สุ่มแล้วหรือเรียงปกติ)
}

const PANE = 'media-playlist-th'
let state: State = { playlists: {}, index: 0, shuffle: false, repeat: true, order: [] }
let isWindows = false
let isMac = false

async function save($: EngineInterface): Promise<void> {
  await $.store.set('playlist', state)
}

// ==========================================================================
// บทที่ 1: ดึงชื่อเพลงจากลิงก์ด้วย oEmbed (มาตรฐานที่เว็บใหญ่ๆ ให้ใช้ฟรี)
// ==========================================================================
async function titleOf($: EngineInterface, target: string): Promise<string> {
  const endpoint = /youtu\.?be/.test(target) ? 'https://www.youtube.com/oembed?format=json&url=' : /open\.spotify\.com/.test(target) ? 'https://open.spotify.com/oembed?url=' : undefined
  if (endpoint) {
    const res = await $.http.fetch(endpoint + encodeURIComponent(target)).catch(() => undefined)
    if (res?.ok) {
      const body = JSON.parse(res.text) as { title?: string; author_name?: string }
      if (body.title) return body.author_name && !body.title.includes(body.author_name) ? `${body.title} - ${body.author_name}` : body.title
    }
  }
  return target.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || target
}

// ==========================================================================
// บทที่ 2: เปิดด้วยแอปของเครื่อง (ส่ง target ผ่าน env กันคำสั่งแทรก)
// ==========================================================================
async function openTarget($: EngineInterface, target: string): Promise<void> {
  const argv = isWindows ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:MP_TARGET"] : isMac ? ['open', target] : ['xdg-open', target]
  const r = await $.process.run(argv, { env: { MP_TARGET: target }, timeoutMs: 20_000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
}

// ==========================================================================
// บทที่ 3: คิวเพลง - สุ่มแบบ Fisher-Yates และเลื่อนไปมา
// ==========================================================================
function makeOrder(length: number, shuffle: boolean): number[] {
  const order = Array.from({ length }, (_, i) => i)
  if (shuffle) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j] ?? 0, order[i] ?? 0]
    }
  }
  return order
}

function currentTracks(): Track[] {
  return state.current ? (state.playlists[state.current] ?? []) : []
}

function currentTrack(): Track | undefined {
  return currentTracks()[state.order[state.index] ?? -1]
}

async function playAt($: EngineInterface, index: number): Promise<string> {
  const tracks = currentTracks()
  if (tracks.length === 0) return 'playlist ว่าง'
  if (index >= tracks.length || index < 0) {
    if (!state.repeat) return '⏹️ จบ playlist แล้ว (/playlist repeat on เพื่อวนซ้ำ)'
    index = (index + tracks.length) % tracks.length
  }
  state.index = index
  const track = currentTrack()
  if (!track) return 'ไม่พบเพลง'
  await openTarget($, track.target)
  await save($)
  $.ui.invalidate('ui.render')
  return `▶️ ${index + 1}/${tracks.length}  ${track.title}`
}

const HELP = `🎵 Media Playlist TH (Mod 28)
========================================
/playlist new <ชื่อ>                      สร้าง playlist
/playlist add <ชื่อ> <ลิงก์หรือไฟล์> [ชื่อเพลง]   ลิงก์ YouTube/Spotify ดึงชื่อให้เอง
/playlist show [ชื่อ] | lists
/playlist play <ชื่อ> [ลำดับ]              เริ่มเล่น
/playlist next | prev | now
/playlist shuffle on|off | repeat on|off
/playlist remove <ชื่อ> <ลำดับ> | delete <ชื่อ> confirm
/playlist search <คำค้น>                  เปิดค้นบน YouTube
/playlist export <ชื่อ>                   ส่งออก .m3u`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    isMac = !isWindows && e.cwd.startsWith('/Users/')
    const saved = (await $.store.get('playlist')) as Partial<State> | undefined
    state = { playlists: {}, index: 0, shuffle: false, repeat: true, order: [], ...saved }
    await $.command.register({ name: 'playlist', description: 'Playlist จาก YouTube Spotify หรือไฟล์ในเครื่อง (/playlist help)', argumentHint: 'new|add|play|next|prev|shuffle' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: แผงกำลังเล่น + ปุ่มควบคุม
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const tracks = currentTracks()
    const now = currentTrack()
    if (!state.current || !now) return <Text dimColor>เริ่มเล่นด้วย /playlist play &lt;ชื่อ&gt;</Text>
    const upNext = state.order.slice(state.index + 1, state.index + 6).map(i => tracks[i]).filter((t): t is Track => Boolean(t))
    const move = (delta: number) => () => void playAt($, state.index + delta).then(msg => $.ui.toast(msg)).catch(err => $.ui.toast(`❌ ${String(err)}`))
    return (
      <Box flexDirection="column">
        <Text dimColor>
          🎵 {state.current} · {state.index + 1}/{tracks.length} {state.shuffle ? '🔀' : ''} {state.repeat ? '🔁' : ''}
        </Text>
        <Text bold wrap="truncate-end">
          ▶️ {now.title}
        </Text>
        <Box gap={1}>
          <Button key="prev" label="⏮" onPress={move(-1)} />
          <Button key="next" label="⏭" onPress={move(1)} />
        </Box>
        {upNext.length > 0 && <Text dimColor>ถัดไป</Text>}
        {upNext.map(t => (
          <Text dimColor wrap="truncate-end">
            · {t.title}
          </Text>
        ))}
      </Box>
    )
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /playlist
  // ==========================================================================
  on('command.run', { command: 'playlist' }, async ($, e) => {
    const [sub = 'help', name = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const list = state.playlists[name]

    try {
      switch (sub) {
        case 'new':
          if (!name) return { text: 'วิธีใช้: /playlist new ทำงาน' }
          if (list) return { text: `ℹ️ มี playlist "${name}" อยู่แล้ว` }
          state.playlists[name] = []
          await save($)
          return { text: `🎵 สร้าง playlist "${name}" แล้ว` }
        case 'add': {
          const [target, ...titleWords] = rest
          if (!list || !target) return { text: list ? 'วิธีใช้: /playlist add <ชื่อ> <ลิงก์หรือไฟล์> [ชื่อเพลง]' : `❌ ไม่มี playlist "${name}" (สร้างด้วย /playlist new ${name})` }
          const title = titleWords.join(' ') || (await titleOf($, target))
          list.push({ title, target })
          if (state.current === name) state.order = makeOrder(list.length, state.shuffle)
          await save($)
          return { text: `➕ ${list.length}. ${title}` }
        }
        case 'lists':
          return { text: Object.keys(state.playlists).length ? ['🎵 Playlist ทั้งหมด', ...Object.entries(state.playlists).map(([n, t]) => `  ${n} (${t.length} เพลง)`)].join('\n') : 'ยังไม่มี playlist สร้างด้วย /playlist new <ชื่อ>' }
        case 'show': {
          const showName = name || state.current || ''
          const tracks = state.playlists[showName]
          if (!tracks) return { text: `❌ ไม่มี playlist "${showName}"` }
          return { text: [`🎵 ${showName} (${tracks.length} เพลง)`, ...tracks.map((t, i) => `  ${i + 1}. ${t.title}`)].join('\n') }
        }
        case 'play': {
          if (!list || list.length === 0) return { text: list ? `playlist "${name}" ยังว่าง` : `❌ ไม่มี playlist "${name}"` }
          state.current = name
          state.order = makeOrder(list.length, state.shuffle)
          const start = Number(rest[0]) - 1
          await $.ui.open({ id: PANE, title: '🎵 Now Playing' })
          // เลือกเพลงที่ระบุ: หาตำแหน่งของเพลงนั้นในลำดับเล่น
          return { text: await playAt($, Number.isInteger(start) && start >= 0 ? Math.max(0, state.order.indexOf(start)) : 0) }
        }
        case 'next':
        case 'prev':
          if (!state.current) return { text: 'ยังไม่ได้เล่น /playlist play <ชื่อ>' }
          return { text: await playAt($, state.index + (sub === 'next' ? 1 : -1)) }
        case 'now': {
          const t = currentTrack()
          return { text: t ? `▶️ ${t.title}\n${t.target}` : 'ยังไม่ได้เล่น' }
        }
        case 'shuffle':
        case 'repeat': {
          const value = name === 'on'
          if (sub === 'shuffle') {
            state.shuffle = value
            // สุ่มใหม่โดยให้เพลงที่เล่นอยู่เป็นเพลงแรก
            const playing = state.order[state.index]
            state.order = makeOrder(currentTracks().length, value)
            if (playing !== undefined) state.order = [playing, ...state.order.filter(i => i !== playing)]
            state.index = 0
          } else {
            state.repeat = value
          }
          await save($)
          $.ui.invalidate('ui.render')
          return { text: `${sub === 'shuffle' ? '🔀 สุ่ม' : '🔁 วนซ้ำ'} ${value ? 'เปิด' : 'ปิด'}` }
        }
        case 'remove': {
          const n = Number(rest[0])
          if (!list || !Number.isInteger(n) || n < 1 || n > list.length) return { text: 'วิธีใช้: /playlist remove <ชื่อ> <ลำดับ>' }
          const [removed] = list.splice(n - 1, 1)
          if (state.current === name) {
            state.order = makeOrder(list.length, state.shuffle)
            state.index = 0
          }
          await save($)
          return { text: `🗑️ ลบ "${removed?.title}" แล้ว` }
        }
        case 'delete':
          if (!list) return { text: `❌ ไม่มี playlist "${name}"` }
          if (rest[0] !== 'confirm') return { text: `⚠️ จะลบ playlist "${name}" (${list.length} เพลง) ยืนยันด้วย /playlist delete ${name} confirm` }
          delete state.playlists[name]
          if (state.current === name) state.current = undefined
          await save($)
          $.ui.invalidate('ui.render')
          return { text: `🗑️ ลบ playlist "${name}" แล้ว` }
        case 'search': {
          const q = [name, ...rest].join(' ')
          if (!q) return { text: 'วิธีใช้: /playlist search เพลงใหม่ ล่าสุด' }
          await openTarget($, `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)
          return { text: `🔎 เปิดค้น "${q}" บน YouTube แล้ว เจอเพลงที่ชอบ copy ลิงก์มา /playlist add ได้เลย` }
        }
        case 'export': {
          if (!list) return { text: `❌ ไม่มี playlist "${name}"` }
          const root = (await $.session.cwd()).replace(/[\\/]$/, '')
          const path = `${root}${root.includes('\\') ? '\\' : '/'}${name.replace(/[\\/:*?"<>|]/g, '_')}.m3u`
          await $.fs.write(path, ['#EXTM3U', ...list.flatMap(t => [`#EXTINF:-1,${t.title}`, t.target])].join('\n') + '\n')
          return { text: `💾 ส่งออกแล้ว: ${path} (เปิดด้วย VLC หรือโปรแกรมเล่นเพลงได้)` }
        }
        default:
          return { text: HELP }
      }
    } catch (err) {
      return { text: `❌ ${sub} ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. นำเข้า playlist จากไฟล์ .m3u หรือโฟลเดอร์เพลงทั้งโฟลเดอร์ ($.fs.list)
 * 2. คุม Spotify จริงด้วย Spotify Web API (ต้องทำ OAuth และมี Premium)
 * 3. ตั้งเวลาเปิด playlist ตอนเช้า (ต่อกับ Mod 24)
 */
