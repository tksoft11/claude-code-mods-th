/**
 * ============================================================================
 * MOD 75: Image View TH - ดูรูปและให้ Claude วิเคราะห์ภาพ (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: imgcat ของ iTerm2 และ "ช่วยดูหน่อยว่ารูปนี้ผิดตรงไหน"
 *
 * หน้าที่ของ Mod นี้:
 * 1. /view <รูป> - แสดงรูปในแผง: terminal ใช้ element Image (รูปจริง), VS Code/Desktop ใช้ SVG
 * 2. /view <รูป> blocks - แปลงเป็นภาพบล็อกสี ▀ (ช่องละ 2 พิกเซล บน/ล่าง) แบบ pixel art
 * 3. /view <รูป> ask <คำถาม> - ส่งให้ Claude ตัวหลักเปิดรูป (Claude Code อ่านรูปได้) แล้วตอบคำถาม
 *
 * ทำไมไม่ให้ Haiku ดูรูปเอง: $.model.complete รับได้แต่ข้อความ จึงส่งต่อให้ Claude ตัวหลักแทน
 * แปลงรูปด้วย Python + Pillow (หรือ PowerShell บน Windows) ส่ง path ผ่าน env
 */

import type { EngineInterface, Register } from 'claude-code'
import { Grid, drawGrid } from './grid'

interface Decoded {
  w: number
  h: number
  png: string // ภาพย่อ (กว้าง/สูงไม่เกิน 480) เป็น PNG base64
  cols: number
  prow: number // จำนวนแถวพิกเซล (ช่องละ 2 แถว)
  px: number[] // 0xRRGGBB
}

const PANE = 'image-view-th'
const COLS = 64
const ROWS = 22

let current: { name: string; mode: 'photo' | 'blocks'; img: Decoded } | undefined

// ==========================================================================
// บทที่ 1: ถอดรูป - Python/Pillow ก่อน ไม่มีค่อยใช้ PowerShell (System.Drawing)
// ==========================================================================
const PY = `
import base64, io, json, os
from PIL import Image
im = Image.open(os.environ["IV_SRC"]).convert("RGB")
W, H = im.size
th = im.copy(); th.thumbnail((480, 480)); buf = io.BytesIO(); th.save(buf, "PNG")
cols, rows = int(os.environ["IV_COLS"]), int(os.environ["IV_ROWS"])
# ช่องตัวอักษรสูงประมาณ 2 เท่าของกว้าง: 1 ช่อง = 1 พิกเซลกว้าง x 2 พิกเซลสูง จึงคงสัดส่วนได้
prow = max(2, min(rows * 2, round(cols * H / W)))
c = max(1, min(cols, round(prow * W / H)))
prow -= prow % 2
raw = im.resize((c, prow)).tobytes()
px = [raw[i] << 16 | raw[i + 1] << 8 | raw[i + 2] for i in range(0, len(raw), 3)]
print(json.dumps({"w": W, "h": H, "png": base64.b64encode(buf.getvalue()).decode(), "cols": c, "prow": prow, "px": px}))
`

const PS = `
Add-Type -AssemblyName System.Drawing
$im = [System.Drawing.Image]::FromFile($env:IV_SRC)
$W = $im.Width; $H = $im.Height
$s = [Math]::Min(1, 480 / [Math]::Max($W, $H))
$th = New-Object System.Drawing.Bitmap $im, ([int]($W * $s)), ([int]($H * $s))
$ms = New-Object System.IO.MemoryStream; $th.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$cols = [int]$env:IV_COLS; $rows = [int]$env:IV_ROWS
$prow = [Math]::Max(2, [Math]::Min($rows * 2, [int]($cols * $H / $W))); $prow -= $prow % 2
$c = [Math]::Max(1, [Math]::Min($cols, [int]($prow * $W / $H)))
$sm = New-Object System.Drawing.Bitmap $im, $c, $prow
$px = for ($y = 0; $y -lt $prow; $y++) { for ($x = 0; $x -lt $c; $x++) { $p = $sm.GetPixel($x, $y); ($p.R -shl 16) -bor ($p.G -shl 8) -bor $p.B } }
@{ w = $W; h = $H; png = [Convert]::ToBase64String($ms.ToArray()); cols = $c; prow = $prow; px = @($px) } | ConvertTo-Json -Compress
`

async function decode($: EngineInterface, path: string, isWindows: boolean): Promise<Decoded | string> {
  const env = { IV_SRC: path, IV_COLS: String(COLS), IV_ROWS: String(ROWS), PYTHONIOENCODING: 'utf-8' }
  for (const argv of [['python', '-I', '-c', PY], ['python3', '-I', '-c', PY], ['py', '-3', '-I', '-c', PY]]) {
    const r = await $.process.run(argv, { env, timeoutMs: 60_000 }).catch(() => undefined)
    if (r?.exitCode === 0) {
      try {
        return JSON.parse(r.stdout.trim()) as Decoded
      } catch {}
    }
    if (r && /No module named 'PIL'/.test(r.stderr) && !isWindows) return 'ต้องติดตั้ง Pillow ก่อน: pip install pillow'
  }
  if (isWindows) {
    const r = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS], { env, timeoutMs: 120_000 }).catch(() => undefined)
    if (r?.exitCode === 0) {
      try {
        return JSON.parse(r.stdout.trim()) as Decoded
      } catch {}
    }
    return `เปิดรูปไม่ได้: ${r?.stderr.trim().split('\n')[0] ?? 'ไม่พบ Python/PowerShell'}`
  }
  return 'เปิดรูปไม่ได้ (ต้องมี Python + Pillow)'
}

// ==========================================================================
// บทที่ 2: ภาพบล็อก - ▀ ใช้สีตัวอักษรเป็นพิกเซลบน สีพื้นเป็นพิกเซลล่าง
// ==========================================================================
function blocks(img: Decoded): Grid {
  const g = new Grid(img.cols, img.prow / 2)
  for (let y = 0; y < img.prow; y += 2) {
    for (let x = 0; x < img.cols; x++) g.set(x, y / 2, '▀', img.px[y * img.cols + x] ?? 0, img.px[(y + 1) * img.cols + x] ?? 0)
  }
  return g
}

function svgPhoto(img: Decoded): string {
  const s = Math.min(1, 480 / Math.max(img.w, img.h))
  const w = Math.round(img.w * s)
  const h = Math.round(img.h * s)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="data:image/png;base64,${img.png}"/></svg>`
}

const HELP = `🖼️ Image View TH (Mod 75)
========================================
/view <รูป>                แสดงรูปในแผง (PNG JPG GIF WebP BMP)
/view <รูป> blocks         แปลงเป็นภาพบล็อกสีแบบ pixel art
/view <รูป> ask <คำถาม>     ให้ Claude เปิดรูปแล้วตอบ เช่น ask หน้าเว็บนี้มีอะไรเพี้ยน`

export const register: Register = on => {
  let isWindows = false
  on('session.start', async ($, e, next) => {
    isWindows = /^[A-Za-z]:/.test(e.cwd)
    await $.command.register({ name: 'view', description: 'ดูรูปในแผง แปลงเป็น pixel art และถาม Claude ว่าในรูปมีอะไร (/view help)', argumentHint: '<รูป> [blocks|ask <คำถาม>]' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แผงรูป - เลือกวิธีวาดตามหน้าจอ
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const c = current
    if (!c) return <Text dimColor>/view รูป.png</Text>
    const caption = <Text dimColor>{`${c.name} · ${c.img.w}×${c.img.h}`}</Text>
    if (c.mode === 'blocks') return <Box flexDirection="column">{drawGrid(els, e.surface, blocks(c.img), 'px', `ภาพ ${c.name} แบบบล็อกสี`) as never}{caption}</Box>
    // เช็คจาก e.surface ไม่ใช่ 'Image' in els (ตารางของบางหน้าจอมีชื่อ element ที่วาดไม่ได้จริง)
    if (e.surface === 'terminal' && 'Image' in els) {
      const Image = els.Image
      const rows = Math.min(ROWS, Math.max(4, Math.round((COLS * c.img.h) / c.img.w / 2)))
      return (
        <Box flexDirection="column">
          <Image key="photo" source={{ png: c.img.png }} columns={Math.min(COLS, Math.round((rows * 2 * c.img.w) / c.img.h))} rows={rows} alt={c.name} />
          {caption}
        </Box>
      )
    }
    if (e.surface !== 'terminal' && 'Svg' in els && c.img.png.length < 120_000) {
      const Svg = els.Svg
      return (
        <Box flexDirection="column">
          <Svg source={svgPhoto(c.img)} alt={c.name} />
          {caption}
        </Box>
      )
    }
    // ใหญ่เกินหรือหน้าจอไม่มีที่วาดรูป: ใช้ภาพบล็อกแทน
    return <Box flexDirection="column">{drawGrid(els, e.surface, blocks(c.img), 'px', c.name) as never}{caption}</Box>
  })

  on('command.run', { command: 'view' }, async ($, e) => {
    const args = e.args.trim()
    if (!args || args === 'help') return { text: HELP }
    const m = /^(?:"([^"]+)"|(\S+))(?:\s+(blocks|ask)(?:\s+([\s\S]+))?)?$/.exec(args)
    const file = m?.[1] ?? m?.[2] ?? ''
    const mode = m?.[3]
    const root = (await $.session.root()).replace(/[\\/]$/, '')
    const path = /^(?:[A-Za-z]:[\\/]|\/)/.test(file) ? file : `${root}${isWindows ? '\\' : '/'}${file}`
    if (!(await $.fs.exists(path))) return { text: `❌ ไม่พบไฟล์ ${path}` }
    if (mode === 'ask') {
      const question = m?.[4]?.trim() || 'ในรูปนี้มีอะไร อธิบายสั้นๆ'
      $.clock.after(50, () => void $.prompt.submit({ text: `ช่วยเปิดรูป ${path} (ใช้ Read tool) แล้วตอบคำถามนี้เป็นภาษาไทย: ${question}` }).catch(() => undefined)) // ส่งหลังคำสั่งตอบกลับแล้ว (ส่งระหว่าง command.run ไม่ได้)
      return { text: `👀 ส่งรูปให้ Claude ดูแล้ว: ${question}` }
    }
    const img = await decode($, path, isWindows)
    if (typeof img === 'string') return { text: `❌ ${img}` }
    current = { name: file.split(/[\\/]/).pop() ?? file, mode: mode === 'blocks' ? 'blocks' : 'photo', img }
    await $.ui.open({ id: PANE, title: `🖼️ ${current.name}` })
    $.ui.invalidate('ui.render')
    return { text: `🖼️ ${current.name} (${img.w}×${img.h}) เปิดในแผงแล้ว${mode === 'blocks' ? ' แบบบล็อกสี' : ''}\nถาม Claude เรื่องรูปนี้: /view ${file} ask <คำถาม>` }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เปิดภาพหน้าจอจาก Playwright / screenshot ล่าสุดให้เองหลัง Claude ถ่ายรูป
 * 2. เทียบสองรูปข้างกัน (ก่อน/หลังแก้ CSS)
 * 3. ดูรูปทั้งโฟลเดอร์เป็นแกลเลอรี เลื่อนด้วย n / p
 */
