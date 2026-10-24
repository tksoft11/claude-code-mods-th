/**
 * ============================================================================
 * MOD 98: Narrator TH - นักพากย์: Claude เล่าเป็นเสียงว่าทำอะไรเสร็จ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: narrator และ sportscaster ใน awesome-claude-code-mods
 *
 * หน้าที่ของ Mod นี้:
 * 1. งานที่ใช้เวลานาน (ค่าเริ่มต้น 20 วินาทีขึ้นไป) เสร็จเมื่อไหร่
 *    ให้ Haiku สรุปเป็นประโยคพูดสั้นๆ แล้วอ่านออกเสียง ลุกไปชงกาแฟได้ ไม่ต้องจ้องจอ
 * 2. พูดไทยหรืออังกฤษก็ได้ (/narrator lang th|en)
 * 3. ใช้เสียงสังเคราะห์ของเครื่อง: $.audio.speak (macOS: say)
 *    Windows ใช้ System.Speech ของ PowerShell เลือกเสียงตามภาษาให้เอง
 *
 * เสียงภาษาไทยบน Windows: Settings > Time & language > Speech > Add voices > ไทย
 */

import type { EngineInterface, Register } from 'claude-code'

interface Settings {
  on: boolean
  lang: 'th' | 'en'
  minSec: number
}

let settings: Settings = { on: true, lang: 'th', minSec: 20 }
let isWindows = false
let turnStart = 0
let lastLine = ''

const PROMPT: Record<Settings['lang'], string> = {
  th: 'สรุปเป็นประโยคพูดภาษาไทย 1 ประโยค ไม่เกิน 25 คำ ว่า agent เพิ่งทำอะไรเสร็จ และมีอะไรต้องให้ผู้ใช้ทำต่อไหม ใช้ภาษาพูดเป็นกันเอง ไม่มีสัญลักษณ์ ไม่มี path ไฟล์ยาว ไม่มีโค้ด',
  en: 'Summarize in ONE spoken English sentence (max 25 words) what the agent just finished and whether the user needs to do anything. Casual spoken style, no symbols, no long file paths, no code.',
}

// ==========================================================================
// บทที่ 1: พูดออกเสียง (ลอง $.audio.speak ก่อน แล้วค่อยใช้ PowerShell บน Windows)
// ==========================================================================
async function windowsSpeak($: EngineInterface, text: string): Promise<void> {
  const script = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $env:NAR_LANG } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Speak($env:NAR_TEXT)"
  await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], { env: { NAR_TEXT: text, NAR_LANG: settings.lang === 'th' ? 'th-TH' : 'en-US' }, timeoutMs: 60_000 })
}

async function speak($: EngineInterface, text: string): Promise<void> {
  lastLine = text
  if (isWindows) return windowsSpeak($, text)
  await $.audio.speak(text).catch(() => $.ui.toast(`🎙 ${text}`, { timeoutMs: 10_000 }))
}

async function hasThaiVoice($: EngineInterface): Promise<boolean> {
  const r = await $.process
    .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Culture.Name }"], { timeoutMs: 20_000 })
    .catch(() => undefined)
  return /th-TH/i.test(r?.stdout ?? '')
}

// ==========================================================================
// บทที่ 2: สรุปงานเป็นประโยคพูด
// ==========================================================================
async function narrate($: EngineInterface, answer: string): Promise<void> {
  const r = await $.model.complete({ model: 'haiku', system: PROMPT[settings.lang], prompt: answer.slice(0, 4000), maxTokens: 120 }).catch(() => undefined)
  if (!r?.isAnswered) return
  const line = r.text.replace(/[`*_#>|[\]]/g, '').replace(/\s+/g, ' ').trim()
  if (line) await speak($, line).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    settings = { ...settings, ...((await $.store.get('settings')) as Partial<Settings> | undefined) }
    const cwd = await $.session.cwd()
    isWindows = /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')
    await $.command.register({ name: 'narrator', description: 'นักพากย์: อ่านออกเสียงว่า Claude ทำอะไรเสร็จ (/narrator help)', argumentHint: 'on|off | lang th|en | min <วินาที> | test' })
    // บอกครั้งเดียว ถ้า Windows ไม่มีเสียงไทย
    if (settings.on && isWindows && settings.lang === 'th' && !(await $.store.get('warnedVoice')) && !(await hasThaiVoice($))) {
      await $.store.set('warnedVoice', true)
      $.ui.toast('🎙 Narrator: เครื่องนี้ยังไม่มีเสียงภาษาไทย ติดตั้งที่ Settings > Time & language > Speech > Add voices > ไทย หรือ /narrator lang en', { timeoutMs: 20_000 })
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turnStart = await $.clock.now()
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: งานนานเสร็จแล้ว = พากย์
  // ==========================================================================
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!settings.on || e.agentId || e.reason !== 'answer' || !turnStart) return r
    const sec = ((await $.clock.now()) - turnStart) / 1000
    if (sec >= settings.minSec && e.answer.trim()) void narrate($, e.answer)
    return r
  })

  on('command.run', { command: 'narrator' }, async ($, e) => {
    const [sub = '', arg] = e.args.trim().split(/\s+/)
    const save = (): Promise<void> => $.store.set('settings', settings)
    switch (sub) {
      case 'on':
      case 'off':
        settings = { ...settings, on: sub === 'on' }
        await save()
        return { text: `🎙 นักพากย์: ${settings.on ? 'เปิด' : 'ปิด'}` }
      case 'lang':
        if (arg !== 'th' && arg !== 'en') return { text: 'วิธีใช้: /narrator lang th|en' }
        settings = { ...settings, lang: arg }
        await save()
        return { text: `🎙 พากย์เป็น${arg === 'th' ? 'ภาษาไทย' : 'ภาษาอังกฤษ'}` }
      case 'min': {
        const n = Number(arg)
        if (!(n >= 0 && n <= 3600)) return { text: `วิธีใช้: /narrator min 20  (พากย์เฉพาะงานที่นานเกินกี่วินาที ตอนนี้ ${settings.minSec})` }
        settings = { ...settings, minSec: n }
        await save()
        return { text: `🎙 พากย์งานที่ใช้เวลา ${n} วินาทีขึ้นไป` }
      }
      case 'test': {
        const line = settings.lang === 'th' ? 'สวัสดีครับ นักพากย์พร้อมทำงานแล้ว' : 'Hello, the narrator is ready.'
        await speak($, line).catch(err => $.ui.toast(`พูดไม่ได้: ${String(err)}`))
        return { text: `🎙 ทดสอบ: ${line}` }
      }
      case 'again':
        if (!lastLine) return { text: 'ยังไม่มีอะไรให้พูดซ้ำ' }
        await speak($, lastLine).catch(() => undefined)
        return { text: `🎙 ${lastLine}` }
      default:
        return { text: `🎙 Narrator TH (Mod 98): ${settings.on ? 'เปิด' : 'ปิด'} · ${settings.lang} · งานนานเกิน ${settings.minSec} วินาที\n/narrator on|off      เปิด/ปิด\n/narrator lang th|en  ภาษา\n/narrator min 20      พากย์เฉพาะงานที่นานเกินกี่วินาที\n/narrator test        ทดสอบเสียง\n/narrator again       พูดประโยคล่าสุดซ้ำ` }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. พากย์ตอน Claude รอให้อนุญาต (permission) ด้วย ลุกไปไหนก็รู้
 * 2. โหมดนักพากย์ฟุตบอล: ใส่อารมณ์ตื่นเต้นและเสียงเชียร์ (ต่อกับ $.audio.play)
 * 3. ใช้เสียง AI คุณภาพสูงผ่าน $.http.fetch ไปยังบริการ TTS
 */
