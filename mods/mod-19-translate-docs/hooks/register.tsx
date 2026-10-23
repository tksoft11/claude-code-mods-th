/**
 * ============================================================================
 * MOD 19: Translate & Docs TH - แปลภาษาและทำเอกสารจากโค้ด (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: งานที่ Dev ไม่อยากทำเอง - แปลคอมเมนต์ ทำไฟล์ภาษา (i18n) เขียน README และ API Docs
 *
 * หน้าที่ของ Mod นี้:
 * 1. /translate แปลข้อความ ด้วย Claude ($.model.complete) ไม่ใช่ดิกชันนารีคำต่อคำ
 * 2. /translate file, /translate comments แปลทั้งไฟล์ หรือแปลเฉพาะคอมเมนต์ (โค้ดไม่เปลี่ยน)
 * 3. /translate i18n แปลไฟล์ภาษา JSON หลายภาษา ตรวจว่า key ครบเท่าต้นฉบับ
 * 4. /docgen api สร้าง API.md จาก export และ JSDoc ในโค้ด (ไม่ใช้ AI ได้ผลตรงตามโค้ด)
 * 5. /docgen readme ให้ Claude ร่าง README จากโครงสร้างโปรเจกต์
 *
 * หลักการ: ไม่เขียนทับไฟล์เดิมเลย ผลลัพธ์เป็นไฟล์ใหม่เสมอ (เช่น app.en.ts, README.generated.md)
 * ค่าใช้จ่าย: การแปลเรียก model จริง (คิดเงินตามบัญชีของคุณ) Mod จะบอกจำนวน token ทุกครั้ง
 */

import type { EngineInterface, FsEntry, Register } from 'claude-code'

const LANGS: Record<string, string> = {
  th: 'Thai', en: 'English', ja: 'Japanese', zh: 'Simplified Chinese', ko: 'Korean', vi: 'Vietnamese',
  lo: 'Lao', my: 'Burmese', km: 'Khmer', ms: 'Malay', id: 'Indonesian', fr: 'French', de: 'German', es: 'Spanish',
}
const DEFAULT_MODEL = 'haiku' // ถูกและเร็ว เหมาะกับงานแปล

let projectRoot = ''
let tokensUsed = 0

const sep = () => (projectRoot.includes('\\') ? '\\' : '/')
const resolve = (p: string) => (/^([A-Za-z]:|[\\/])/.test(p) ? p : `${projectRoot}${sep()}${p.replace(/[\\/]/g, sep())}`)
const rel = (p: string) => (p.toLowerCase().startsWith(projectRoot.toLowerCase()) ? p.slice(projectRoot.length + 1) : p)

// ข้อความมีตัวอักษรไทย -> แปลเป็นอังกฤษ, ไม่มี -> แปลเป็นไทย
function guessTarget(text: string): string {
  return /[฀-๿]/.test(text) ? 'en' : 'th'
}

// app.ts + en -> app.en.ts
function withLang(path: string, lang: string): string {
  const dot = path.lastIndexOf('.')
  return dot > path.lastIndexOf(sep()) ? `${path.slice(0, dot)}.${lang}${path.slice(dot)}` : `${path}.${lang}`
}

// ==========================================================================
// บทที่ 1: เรียก Claude ด้วย $.model.complete (ไม่มีประวัติแชต เป็นคำขอเดี่ยวๆ)
// ==========================================================================
// ถ้า model ที่ขอใช้ไม่ได้ (เช่น องค์กรไม่อนุญาต) ลองใหม่ด้วย model ของ session
async function ask($: EngineInterface, system: string, prompt: string, maxTokens = 4000): Promise<string> {
  const models = [DEFAULT_MODEL, await $.session.model()]
  let lastError = ''
  for (const model of models) {
    try {
      const r = await $.model.complete({ model, system, prompt, maxTokens, timeoutMs: 120_000 })
      tokensUsed += (r.usage?.input_tokens ?? 0) + (r.usage?.output_tokens ?? 0)
      if (r.isAnswered) return r.text.trim()
      lastError = r.reason
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(`เรียก model ไม่สำเร็จ (${lastError})`)
}

// ตัด ``` ที่ model อาจห่อมาให้ออก
function unfence(text: string): string {
  const m = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(text.trim())
  return m?.[1] ?? text
}

const TRANSLATOR = 'You are a professional translator for software teams. Translate faithfully and naturally. Keep code, identifiers, URLs, placeholders like {name} or %s, and Markdown formatting unchanged. Output only the translation, with no notes.'

async function translateText($: EngineInterface, text: string, to: string, from?: string): Promise<string> {
  const source = from ? `from ${LANGS[from] ?? from} ` : ''
  return ask($, TRANSLATOR, `Translate ${source}into ${LANGS[to] ?? to}:\n\n${text}`)
}

// ==========================================================================
// บทที่ 2: แปลไฟล์ i18n แบบ JSON - แปลเฉพาะค่า ไม่แตะ key แล้วตรวจว่า key ครบ
// ==========================================================================
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k))
}

async function translateI18n($: EngineInterface, json: string, to: string): Promise<{ text: string; missing: string[] }> {
  const source = JSON.parse(json) as unknown
  const out = unfence(
    await ask(
      $,
      `${TRANSLATOR} You receive a JSON object of UI strings. Translate only the string values. Keep every key, the nesting and placeholders exactly. Output valid JSON only.`,
      `Target language: ${LANGS[to] ?? to}\n\n${json}`,
      8000,
    ),
  )
  const translated = JSON.parse(out) as unknown // ถ้า model ตอบ JSON ผิดรูปแบบ จะ throw ตรงนี้
  const have = new Set(flatKeys(translated))
  return { text: JSON.stringify(translated, null, 2) + '\n', missing: flatKeys(source).filter(k => !have.has(k)) }
}

// ==========================================================================
// บทที่ 3: API Docs จากโค้ด - ใช้ regex หา export + JSDoc (ไม่ใช้ AI ได้ผลตรงตามโค้ด)
// ==========================================================================
interface ApiItem {
  kind: string
  name: string
  signature: string
  doc: string
  file: string
  line: number
}

function extractApi(file: string, text: string): ApiItem[] {
  const items: ApiItem[] = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const m = /^export\s+(?:default\s+)?(?:declare\s+)?(async\s+function|function|class|interface|type|const|enum)\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (!m) return
    // JSDoc = คอมเมนต์ /** ... */ ที่อยู่เหนือบรรทัด export
    let doc = ''
    if (lines[i - 1]?.trim().endsWith('*/')) {
      let j = i - 1
      while (j > 0 && !lines[j]?.trim().startsWith('/**')) j--
      doc = lines
        .slice(j, i)
        .map(l => l.trim().replace(/^\/\*\*|\*\/$|^\*\s?/g, '').trim())
        .filter(Boolean)
        .join(' ')
    }
    items.push({ kind: (m[1] ?? '').replace('async ', ''), name: m[2] ?? '', signature: line.trim().replace(/\s*[{=]\s*$/, '').slice(0, 160), doc, file, line: i + 1 })
  })
  return items
}

async function walk($: EngineInterface, root: string, match: RegExp, limit = 500): Promise<string[]> {
  const files: string[] = []
  const queue = [root]
  while (queue.length && files.length < limit) {
    const dir = queue.shift() ?? root
    let entries: FsEntry[] = []
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    for (const e of entries) {
      const path = `${dir}${sep()}${e.name}`
      if (e.kind === 'dir' && !['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(e.name) && !e.name.startsWith('.')) queue.push(path)
      else if (e.kind === 'file' && match.test(e.name) && !/\.(test|spec|d)\.[jt]sx?$/.test(e.name)) files.push(path)
    }
  }
  return files
}

function apiMarkdown(items: ApiItem[]): string {
  const byFile = new Map<string, ApiItem[]>()
  for (const it of items) byFile.set(it.file, [...(byFile.get(it.file) ?? []), it])
  const out = ['# API Reference', '', `สร้างอัตโนมัติจากโค้ด ${items.length} รายการ`, '']
  for (const [file, list] of byFile) {
    out.push(`## \`${file}\``, '')
    for (const it of list) out.push(`### ${it.name} _(${it.kind})_`, '', '```ts', it.signature, '```', '', it.doc || '_ยังไม่มีคำอธิบาย (เพิ่ม JSDoc เหนือบรรทัด export)_', '')
  }
  return out.join('\n')
}

const HELP = `🌐 Translate & Docs TH (Mod 19)
========================================
แปล (ใช้ Claude):
  /translate <ข้อความ>                      ไทย -> อังกฤษ, ภาษาอื่น -> ไทย
  /translate to <ภาษา> <ข้อความ>             เช่น /translate to ja สวัสดี
  /translate file <ไฟล์> [ภาษา]              แปลทั้งไฟล์ -> ไฟล์ใหม่ เช่น README.en.md
  /translate comments <ไฟล์> [ภาษา]          แปลเฉพาะคอมเมนต์ โค้ดไม่เปลี่ยน -> app.en.ts
  /translate i18n <ไฟล์ json> <ภาษา...>       เช่น /translate i18n locales/th.json en ja
  ภาษา: ${Object.keys(LANGS).join(' ')}

เอกสาร:
  /docgen api [โฟลเดอร์]     สร้าง API.md จาก export + JSDoc (ไม่ใช้ AI)
  /docgen readme             ให้ Claude ร่าง README.generated.md
  /docgen usage              token ที่ใช้ไปใน session นี้`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projectRoot = e.cwd.replace(/[\\/]$/, '')
    tokensUsed = 0
    await $.command.register({ name: 'translate', description: 'แปลข้อความ ไฟล์ คอมเมนต์ และไฟล์ภาษาด้วย Claude (/translate help)', argumentHint: '<ข้อความ>|to|file|comments|i18n' })
    await $.command.register({ name: 'docgen', description: 'สร้าง API Docs และ README จากโค้ด (/docgen help)', argumentHint: 'api|readme|usage' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 4: คำสั่ง /translate
  // ==========================================================================
  on('command.run', { command: 'translate' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = '', ...rest] = args.split(/\s+/)
    const before = tokensUsed
    const cost = () => `\n(ใช้ ${(tokensUsed - before).toLocaleString('en-US')} tokens)`

    try {
      if (!args || sub === 'help') return { text: HELP }

      if (sub === 'to') {
        const [lang = '', ...words] = rest
        if (!LANGS[lang] || words.length === 0) return { text: `วิธีใช้: /translate to <${Object.keys(LANGS).join('|')}> <ข้อความ>` }
        return { text: `🌐 → ${LANGS[lang]}\n${await translateText($, words.join(' '), lang)}${cost()}` }
      }

      if (sub === 'file' || sub === 'comments') {
        const [file = '', langArg] = rest
        const path = resolve(file)
        const text = await $.fs.read(path).catch(() => undefined)
        if (text === undefined) return { text: `❌ ไม่พบไฟล์ ${file}` }
        if (text.length > 60_000) return { text: '❌ ไฟล์ยาวเกิน 60,000 ตัวอักษร แบ่งไฟล์ก่อนแปล' }
        const lang = langArg && LANGS[langArg] ? langArg : guessTarget(text)
        const result =
          sub === 'file'
            ? await ask($, TRANSLATOR, `Translate this whole file into ${LANGS[lang]}:\n\n${text}`, 16_000)
            : await ask(
                $,
                `${TRANSLATOR} You receive a source code file. Translate ONLY the comments (and docstrings) into the target language. Every other character, including code, strings, whitespace and line breaks, must stay exactly the same. Output the full file only.`,
                `Target language: ${LANGS[lang]}\n\n${text}`,
                16_000,
              )
        const out = withLang(path, lang)
        await $.fs.write(out, unfence(result).replace(/\n?$/, '\n'))
        // นับบรรทัดโดยไม่สนบรรทัดว่างท้ายไฟล์ (model มักตัดออก)
        const lineNote = sub === 'comments' && unfence(result).trimEnd().split('\n').length !== text.trimEnd().split('\n').length ?'\n⚠️ จำนวนบรรทัดไม่เท่าต้นฉบับ ตรวจด้วย diff ก่อนใช้' : ''
        return { text: `✅ แปลแล้ว → ${rel(out)} (ไฟล์เดิมไม่ถูกแก้)${lineNote}${cost()}` }
      }

      if (sub === 'i18n') {
        const [file = '', ...langs] = rest
        const targets = langs.filter(l => LANGS[l])
        if (!file || targets.length === 0) return { text: 'วิธีใช้: /translate i18n locales/th.json en ja' }
        const path = resolve(file)
        const json = await $.fs.read(path).catch(() => undefined)
        if (json === undefined) return { text: `❌ ไม่พบไฟล์ ${file}` }
        const dir = path.slice(0, path.lastIndexOf(sep()))
        const lines: string[] = []
        for (const lang of targets) {
          const out = `${dir}${sep()}${lang}.json`
          if (await $.fs.exists(out)) {
            lines.push(`⏭️ ${rel(out)} มีอยู่แล้ว ข้าม (ลบหรือเปลี่ยนชื่อก่อนถ้าต้องการแปลใหม่)`)
            continue
          }
          const { text, missing } = await translateI18n($, json, lang)
          await $.fs.write(out, text)
          lines.push(missing.length ? `⚠️ ${rel(out)} ขาด key: ${missing.slice(0, 10).join(', ')}` : `✅ ${rel(out)} key ครบ`)
        }
        return { text: [`🌐 แปลไฟล์ภาษา ${rel(path)}`, ...lines].join('\n') + cost() }
      }

      // ไม่มี subcommand = แปลข้อความทั้งหมดที่พิมพ์
      const lang = guessTarget(args)
      return { text: `🌐 → ${LANGS[lang]}\n${await translateText($, args, lang)}${cost()}` }
    } catch (err) {
      return { text: `❌ แปลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  // ==========================================================================
  // บทที่ 5: คำสั่ง /docgen
  // ==========================================================================
  on('command.run', { command: 'docgen' }, async ($, e) => {
    const [sub = 'help', arg] = e.args.trim().split(/\s+/).filter(Boolean)
    const before = tokensUsed

    if (sub === 'usage') return { text: `🧮 session นี้ Mod 19 ใช้ไป ${tokensUsed.toLocaleString('en-US')} tokens` }

    if (sub === 'api') {
      const root = arg ? resolve(arg) : projectRoot
      // ข้ามไฟล์ที่ /translate สร้าง (เช่น cart.en.ts) จะได้ไม่ซ้ำกับต้นฉบับ
      const translated = new RegExp(`\\.(${Object.keys(LANGS).join('|')})\\.[jt]sx?$|\\.(${Object.keys(LANGS).join('|')})\\.mjs$`)
      const files = (await walk($, root, /\.(ts|tsx|js|jsx|mjs)$/)).filter(f => !translated.test(f))
      const items: ApiItem[] = []
      for (const f of files) items.push(...extractApi(rel(f).replace(/\\/g, '/'), await $.fs.read(f).catch(() => '')))
      if (items.length === 0) return { text: `ไม่พบ export ใน ${rel(root) || '.'}` }
      const out = `${projectRoot}${sep()}API.md`
      await $.fs.write(out, apiMarkdown(items))
      const undocumented = items.filter(i => !i.doc).length
      return { text: `📚 สร้าง ${rel(out)} แล้ว: ${items.length} รายการจาก ${files.length} ไฟล์${undocumented ? ` (ยังไม่มีคำอธิบาย ${undocumented} รายการ)` : ''}` }
    }

    if (sub === 'readme') {
      try {
        const pkg = await $.fs.read(`${projectRoot}${sep()}package.json`).catch(() => '')
        const files = (await walk($, projectRoot, /./, 200)).map(rel)
        const existing = await $.fs.read(`${projectRoot}${sep()}README.md`).catch(() => '')
        const draft = await ask(
          $,
          'You write clear, accurate README files. Use only facts present in the material given; where something is unknown, leave a TODO marker instead of inventing it. Write in Thai, keep commands and code in English.',
          `Write a README.md for this project.\n\npackage.json:\n${pkg.slice(0, 4000) || '(none)'}\n\nFiles:\n${files.slice(0, 200).join('\n')}\n\nCurrent README (may be empty):\n${existing.slice(0, 4000)}`,
          4000,
        )
        const out = `${projectRoot}${sep()}README.generated.md`
        await $.fs.write(out, unfence(draft).replace(/\n?$/, '\n'))
        return { text: `📝 ร่าง README ไว้ที่ ${rel(out)} (README.md เดิมไม่ถูกแก้) ตรวจก่อนใช้\n(ใช้ ${(tokensUsed - before).toLocaleString('en-US')} tokens)` }
      } catch (err) {
        return { text: `❌ สร้าง README ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    return { text: HELP }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ใส่ cache: true ให้ system prompt ของ TRANSLATOR เมื่อแปลหลายไฟล์ติดกัน จะประหยัด token (ดู Mod 05)
 * 2. แปลไฟล์ภาษาเฉพาะ key ที่ยังไม่มี แทนการแปลใหม่ทั้งไฟล์
 * 3. ให้ /docgen api ใช้ AI ช่วยเขียนคำอธิบายเฉพาะรายการที่ยังไม่มี JSDoc
 */
