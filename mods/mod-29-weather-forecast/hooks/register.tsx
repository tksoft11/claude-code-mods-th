/**
 * ============================================================================
 * MOD 29: Weather Forecast TH - พยากรณ์อากาศจริงจาก Open-Meteo (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: แอปพยากรณ์อากาศบนมือถือ
 *
 * หน้าที่ของ Mod นี้:
 * 1. อากาศตอนนี้: อุณหภูมิ, รู้สึกเหมือน, ความชื้น, ลม, UV, PM2.5 และ AQI
 * 2. รายชั่วโมง 12 ชม. และรายวัน 7 วัน พร้อมโอกาสฝนตก
 * 3. ค้นเมืองได้ทั้งภาษาไทยและอังกฤษ ตั้งเมืองหลัก และเมืองโปรด
 * 4. เตือนเมื่อฝนน่าจะตกใน 2 ชม. ข้างหน้า (เช็คทุก 30 นาทีขณะเปิด Claude Code)
 * 5. แผงด้านข้างแสดงอากาศเมืองหลัก
 *
 * แหล่งข้อมูล: Open-Meteo (https://open-meteo.com) ฟรี ไม่ต้องใช้ key สำหรับใช้งานส่วนตัว
 */

import type { EngineInterface, Register, Timer } from 'claude-code'

interface Place {
  name: string
  admin?: string
  lat: number
  lon: number
}
interface Weather {
  place: Place
  current: Record<string, number>
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; uv_index_max: number[] }
  air?: { pm2_5?: number; us_aqi?: number }
  fetchedAt: number
}

const PANE = 'weather-forecast-th'
let home: Place | undefined
let favorites: Place[] = []
let lastHome: Weather | undefined
let alertTimer: Timer | undefined
let alertedFor = '' // กันเตือนซ้ำช่วงเดียวกัน

// ==========================================================================
// บทที่ 1: รหัสสภาพอากาศ (WMO) -> ข้อความไทย + emoji
// ==========================================================================
function describe(code: number): string {
  if (code === 0) return '☀️ แจ่มใส'
  if (code <= 2) return '🌤️ มีเมฆบางส่วน'
  if (code === 3) return '☁️ เมฆมาก'
  if (code <= 48) return '🌫️ หมอก'
  if (code <= 57) return '🌦️ ฝนปรอยๆ'
  if (code <= 67) return '🌧️ ฝนตก'
  if (code <= 77) return '🌨️ หิมะ'
  if (code <= 82) return '🌧️ ฝนซู่'
  if (code <= 86) return '🌨️ หิมะตกหนัก'
  return '⛈️ พายุฝนฟ้าคะนอง'
}

function aqiText(aqi?: number): string {
  if (aqi === undefined) return '-'
  if (aqi <= 50) return `🟢 ${aqi} ดี`
  if (aqi <= 100) return `🟡 ${aqi} ปานกลาง`
  if (aqi <= 150) return `🟠 ${aqi} เริ่มมีผลต่อกลุ่มเสี่ยง`
  if (aqi <= 200) return `🔴 ${aqi} มีผลต่อสุขภาพ`
  return `🟣 ${aqi} อันตราย`
}

function uvText(uv: number): string {
  return uv < 3 ? `${uv.toFixed(0)} ต่ำ` : uv < 6 ? `${uv.toFixed(0)} ปานกลาง` : uv < 8 ? `${uv.toFixed(0)} สูง ☂️` : `${uv.toFixed(0)} สูงมาก ⚠️`
}

// ==========================================================================
// บทที่ 2: เรียก Open-Meteo - ค้นเมือง (geocoding), พยากรณ์, คุณภาพอากาศ
// ==========================================================================
async function getJson($: EngineInterface, url: string): Promise<Record<string, unknown>> {
  const res = await $.http.fetch(url, { headers: { 'User-Agent': 'claude-code-weather-th' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as Record<string, unknown>
}

async function findPlace($: EngineInterface, query: string): Promise<Place | undefined> {
  const body = await getJson($, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=th`)
  const r = (body.results as { name: string; admin1?: string; latitude: number; longitude: number }[] | undefined)?.[0]
  return r ? { name: r.name, admin: r.admin1, lat: r.latitude, lon: r.longitude } : undefined
}

async function forecast($: EngineInterface, place: Place): Promise<Weather> {
  const q = `latitude=${place.lat}&longitude=${place.lon}&timezone=auto`
  const [wx, air] = await Promise.all([
    getJson($, `https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&forecast_days=7`),
    getJson($, `https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5,us_aqi`).catch(() => undefined),
  ])
  return {
    place,
    current: wx.current as Record<string, number>,
    hourly: wx.hourly as Weather['hourly'],
    daily: wx.daily as Weather['daily'],
    air: air?.current as Weather['air'],
    fetchedAt: await $.clock.now(),
  }
}

// ชั่วโมงถัดจากตอนนี้ (เวลาใน hourly เป็นเวลาท้องถิ่นของเมืองนั้น เช่น "2026-10-24T14:00")
function upcomingHours(w: Weather, count: number): number[] {
  const nowIso = String(w.current.time ?? '')
  const start = Math.max(0, w.hourly.time.findIndex(t => t >= nowIso.slice(0, 13)))
  return Array.from({ length: count }, (_, i) => start + i).filter(i => i < w.hourly.time.length)
}

// ==========================================================================
// บทที่ 3: จัดรูปแบบ
// ==========================================================================
function placeName(p: Place): string {
  return p.admin && p.admin !== p.name ? `${p.name}, ${p.admin}` : p.name
}

function nowText(w: Weather): string {
  const c = w.current
  const rainSoon = upcomingHours(w, 3).map(i => w.hourly.precipitation_probability[i] ?? 0)
  return [
    `📍 ${placeName(w.place)}`,
    `${describe(c.weather_code ?? 0)}  ${c.temperature_2m?.toFixed(1)}°C (รู้สึกเหมือน ${c.apparent_temperature?.toFixed(1)}°C)`,
    `💧 ความชื้น ${c.relative_humidity_2m}% | 🌬️ ลม ${c.wind_speed_10m} กม./ชม. | 🔆 UV ${uvText(c.uv_index ?? 0)}`,
    `😷 PM2.5 ${w.air?.pm2_5?.toFixed(0) ?? '-'} µg/m³ | AQI ${aqiText(w.air?.us_aqi)}`,
    `☔ โอกาสฝน 3 ชม. ข้างหน้า: ${rainSoon.map(p => `${p}%`).join(' → ')}`,
  ].join('\n')
}

function hourlyText(w: Weather): string {
  return [`🕐 รายชั่วโมง ${placeName(w.place)}`, ...upcomingHours(w, 12).map(i => `  ${(w.hourly.time[i] ?? '').slice(11, 16)}  ${describe(w.hourly.weather_code[i] ?? 0).padEnd(16)} ${w.hourly.temperature_2m[i]?.toFixed(0)}°C  ☔${w.hourly.precipitation_probability[i] ?? 0}%`)].join('\n')
}

const DAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
function dailyText(w: Weather): string {
  return [
    `📅 7 วัน ${placeName(w.place)}`,
    ...w.daily.time.map((t, i) => {
      const d = new Date(`${t}T12:00`)
      return `  ${DAY_TH[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}  ${describe(w.daily.weather_code[i] ?? 0).padEnd(16)} ${w.daily.temperature_2m_min[i]?.toFixed(0)}-${w.daily.temperature_2m_max[i]?.toFixed(0)}°C  ☔${w.daily.precipitation_probability_max[i] ?? 0}%  UV ${w.daily.uv_index_max[i]?.toFixed(0)}`
    }),
  ].join('\n')
}

// ==========================================================================
// บทที่ 4: เตือนฝน - เช็คทุก 30 นาที ถ้า 2 ชม. ข้างหน้าโอกาสฝน >= 70%
// ==========================================================================
async function checkRain($: EngineInterface): Promise<void> {
  if (!home) return
  const w = await forecast($, home)
  lastHome = w
  $.ui.invalidate('ui.render')
  const next2 = upcomingHours(w, 2)
  const max = Math.max(...next2.map(i => w.hourly.precipitation_probability[i] ?? 0))
  const slot = w.hourly.time[next2[0] ?? 0] ?? ''
  if (max >= 70 && alertedFor !== slot) {
    alertedFor = slot
    $.ui.toast(`🌧️ ${home.name}: โอกาสฝนตก ${max}% ใน 2 ชม. ข้างหน้า พกร่มด้วย`)
  }
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('weather', { home, favorites, alerts: Boolean(alertTimer) })
}

const HELP = `🌦️ Weather Forecast TH (Mod 29)
========================================
/weather [เมือง]          อากาศตอนนี้ (ไม่ใส่ = เมืองหลัก)
/weather hourly [เมือง]   รายชั่วโมง 12 ชม.
/weather week [เมือง]     7 วัน
/weather home <เมือง>     ตั้งเมืองหลัก
/weather fav add|remove <เมือง> | fav   เมืองโปรด
/weather alert on|off     เตือนเมื่อฝนน่าจะตกที่เมืองหลัก
เมืองพิมพ์ไทยหรืออังกฤษก็ได้ เช่น เชียงใหม่, Hat Yai, Tokyo`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('weather')) as { home?: Place; favorites?: Place[]; alerts?: boolean } | undefined
    home = saved?.home
    favorites = saved?.favorites ?? []
    alertTimer?.cancel()
    alertTimer = saved?.alerts ? $.clock.every(30 * 60_000, () => void checkRain($).catch(() => undefined)) : undefined
    await $.command.register({ name: 'weather', description: 'พยากรณ์อากาศ ฝน UV PM2.5 (/weather help)', argumentHint: '[เมือง]|hourly|week|home|alert' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 5: แผงอากาศเมืองหลัก
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const w = lastHome
    if (!w) return <Text dimColor>ตั้งเมืองหลักด้วย /weather home กรุงเทพ</Text>
    return (
      <Box flexDirection="column">
        <Text bold>📍 {w.place.name}</Text>
        <Text>
          {describe(w.current.weather_code ?? 0)} {w.current.temperature_2m?.toFixed(0)}°C
        </Text>
        <Text dimColor>
          💧{w.current.relative_humidity_2m}% · PM2.5 {w.air?.pm2_5?.toFixed(0) ?? '-'}
        </Text>
        {upcomingHours(w, 6).map(i => (
          <Text>
            {(w.hourly.time[i] ?? '').slice(11, 16)} {w.hourly.temperature_2m[i]?.toFixed(0)}° ☔{w.hourly.precipitation_probability[i] ?? 0}%
          </Text>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'weather' }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const [sub = ''] = words

    // หาเมืองจากข้อความ ไม่ใส่ = เมืองหลัก
    const resolvePlace = async (text: string): Promise<Place | string> => {
      if (!text) return home ?? 'ยังไม่ได้ตั้งเมืองหลัก ใช้ /weather home กรุงเทพ หรือ /weather <เมือง>'
      return (await findPlace($, text)) ?? `❌ ไม่พบเมือง "${text}"`
    }

    try {
      switch (sub) {
        case 'help':
          return { text: HELP }
        case 'hourly':
        case 'week': {
          const p = await resolvePlace(words.slice(1).join(' '))
          if (typeof p === 'string') return { text: p }
          const w = await forecast($, p)
          return { text: sub === 'hourly' ? hourlyText(w) : dailyText(w) }
        }
        case 'home': {
          const p = await resolvePlace(words.slice(1).join(' '))
          if (typeof p === 'string') return { text: p }
          home = p
          await save($)
          lastHome = await forecast($, p)
          await $.ui.open({ id: PANE, title: '🌦️ Weather' })
          $.ui.invalidate('ui.render')
          return { text: `🏠 ตั้ง ${placeName(p)} เป็นเมืองหลักแล้ว\n\n${nowText(lastHome)}` }
        }
        case 'fav': {
          const [, action, ...rest] = words
          if (action === 'add' || action === 'remove') {
            const p = await resolvePlace(rest.join(' '))
            if (typeof p === 'string') return { text: p }
            favorites = action === 'add' ? [...favorites.filter(f => f.name !== p.name), p] : favorites.filter(f => f.name !== p.name)
            await save($)
            return { text: `⭐ เมืองโปรด: ${favorites.map(f => f.name).join(', ') || '-'}` }
          }
          if (favorites.length === 0) return { text: 'ยังไม่มีเมืองโปรด /weather fav add เชียงใหม่' }
          const all = await Promise.all(favorites.map(f => forecast($, f).catch(() => undefined)))
          return { text: ['⭐ เมืองโปรด', ...all.map((w, i) => (w ? `  ${w.place.name.padEnd(14)} ${describe(w.current.weather_code ?? 0)} ${w.current.temperature_2m?.toFixed(0)}°C  PM2.5 ${w.air?.pm2_5?.toFixed(0) ?? '-'}` : `  ${favorites[i]?.name}: ดึงข้อมูลไม่ได้`))].join('\n') }
        }
        case 'alert': {
          alertTimer?.cancel()
          alertTimer = undefined
          if (words[1] === 'on') {
            if (!home) return { text: 'ตั้งเมืองหลักก่อน /weather home กรุงเทพ' }
            alertTimer = $.clock.every(30 * 60_000, () => void checkRain($).catch(() => undefined))
            await save($)
            await checkRain($)
            return { text: `🔔 จะเตือนเมื่อฝนน่าจะตกที่ ${home.name} (เช็คทุก 30 นาทีขณะเปิด Claude Code)` }
          }
          await save($)
          return { text: '🔕 ปิดการเตือนฝนแล้ว' }
        }
        default: {
          const p = await resolvePlace(words.join(' '))
          if (typeof p === 'string') return { text: p }
          const w = await forecast($, p)
          if (home && p.name === home.name) {
            lastHome = w
            $.ui.invalidate('ui.render')
          }
          return { text: `${nowText(w)}\n\nแหล่งข้อมูล: Open-Meteo` }
        }
      }
    } catch (err) {
      return { text: `❌ ดึงข้อมูลอากาศไม่ได้: ${err instanceof Error ? err.message : String(err)}` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ส่งพยากรณ์ตอนเช้าไปมือถือทุกวัน 7 โมง (ต่อกับ Mod 22 และ Mod 24)
 * 2. เตือน PM2.5 เกิน 50 ให้ใส่หน้ากาก
 * 3. วาดกราฟอุณหภูมิรายชั่วโมงเป็นแท่ง (ดูตัวอย่างใน Mod 16)
 */
