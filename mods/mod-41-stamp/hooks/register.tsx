/**
 * ============================================================================
 * MOD 41: Stamp TH - ตรายางดิจิทัล (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ตรายาง "อนุมัติ" "ด่วนที่สุด" "ลับ" ในสำนักงาน
 *
 * หน้าที่ของ Mod นี้:
 * 1. ตรายางสำเร็จรูป 10 แบบ (อนุมัติ ไม่อนุมัติ ด่วน ด่วนที่สุด ลับ เสร็จแล้ว ตรวจแล้ว ชำระแล้ว ...)
 * 2. ตรายางข้อความของคุณเอง เช่น ชื่อบริษัท ชื่อแบรนด์
 * 3. ส่งออกเป็นไฟล์ SVG พร้อมวันที่และชื่อผู้ปั๊ม เอาไปวางในเอกสาร/สไลด์ได้
 * 4. ปั๊มเล่นในแผง: ตราที่ปั๊มจะเรียงซ้อนบน "กระดาษ" แบบสนุกๆ
 */

import type { EngineInterface, Register } from 'claude-code'

interface StampStyle {
  text: string
  color: string
  shape: 'rect' | 'circle'
}

// ==========================================================================
// บทที่ 1: ตรายางสำเร็จรูป (สีและรูปทรงตามที่ใช้กันในสำนักงาน)
// ==========================================================================
const STAMPS: Record<string, StampStyle> = {
  approved: { text: 'อนุมัติ', color: '#1b7f3b', shape: 'rect' },
  rejected: { text: 'ไม่อนุมัติ', color: '#c62828', shape: 'rect' },
  urgent: { text: 'ด่วน', color: '#c62828', shape: 'rect' },
  'very-urgent': { text: 'ด่วนที่สุด', color: '#b71c1c', shape: 'rect' },
  secret: { text: 'ลับ', color: '#c62828', shape: 'circle' },
  done: { text: 'เสร็จแล้ว', color: '#1565c0', shape: 'circle' },
  checked: { text: 'ตรวจแล้ว', color: '#1565c0', shape: 'rect' },
  paid: { text: 'ชำระแล้ว', color: '#1b7f3b', shape: 'circle' },
  copy: { text: 'สำเนาถูกต้อง', color: '#37474f', shape: 'rect' },
  draft: { text: 'ฉบับร่าง', color: '#6d4c41', shape: 'rect' },
}

let paper: { text: string; color: string; at: number }[] = []
let owner = ''

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function thaiDate(ms: number): string {
  const d = new Date(ms)
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

// ==========================================================================
// บทที่ 2: วาดตราเป็น SVG - เอียงนิดๆ ขอบหนา และใส่ texture ให้ดูเหมือนหมึกจริง
// ==========================================================================
function stampSvg(s: StampStyle, date: string, by: string): string {
  const rot = -8
  const sub = [date, by].filter(Boolean).join(' · ')
  const ink = `<filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6"/><feComposite in="SourceGraphic" operator="in"/></filter>`
  if (s.shape === 'circle') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">${ink}<g filter="url(#ink)" transform="rotate(${rot} 150 150)" fill="none" stroke="${s.color}"><circle cx="150" cy="150" r="130" stroke-width="10"/><circle cx="150" cy="150" r="112" stroke-width="3"/><text x="150" y="${sub ? 158 : 168}" font-size="${s.text.length > 6 ? 40 : 56}" font-weight="800" font-family="Sarabun, 'Noto Sans Thai', sans-serif" text-anchor="middle" fill="${s.color}" stroke="none">${esc(s.text)}</text>${sub ? `<text x="150" y="205" font-size="20" font-family="Sarabun, sans-serif" text-anchor="middle" fill="${s.color}" stroke="none">${esc(sub)}</text>` : ''}</g></svg>`
  }
  const width = Math.max(300, [...s.text].length * 52 + 80)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 40}" height="200" viewBox="0 0 ${width + 40} 200">${ink}<g filter="url(#ink)" transform="rotate(${rot} ${(width + 40) / 2} 100)" fill="none" stroke="${s.color}"><rect x="20" y="30" width="${width}" height="140" rx="12" stroke-width="10"/><rect x="34" y="44" width="${width - 28}" height="112" rx="6" stroke-width="3"/><text x="${(width + 40) / 2}" y="${sub ? 112 : 122}" font-size="64" font-weight="800" font-family="Sarabun, 'Noto Sans Thai', sans-serif" text-anchor="middle" fill="${s.color}" stroke="none">${esc(s.text)}</text>${sub ? `<text x="${(width + 40) / 2}" y="148" font-size="20" font-family="Sarabun, sans-serif" text-anchor="middle" fill="${s.color}" stroke="none">${esc(sub)}</text>` : ''}</g></svg>`
}

// ความกว้างที่เห็นบนจอ: สระบน/ล่างและวรรณยุกต์ของไทยไม่กินที่ (ั ิ ี ึ ื ุ ู ฺ ็ ่ ้ ๊ ๋ ์ ...)
function visibleWidth(text: string): number {
  return [...text].filter(ch => !/[ัิ-ฺ็-๎]/.test(ch)).length
}

// ตราแบบข้อความสำหรับแสดงในแชต
function stampAscii(text: string): string {
  const w = visibleWidth(text) + 4
  return [`╔${'═'.repeat(w)}╗`, `║  ${text}  ║`, `╚${'═'.repeat(w)}╝`].join('\n')
}

const PANE = 'stamp-th'

const HELP = `📮 Stamp TH (Mod 41)
========================================
/stamp                    ดูตราทั้งหมด
/stamp <ชื่อตรา>          ปั๊มลงกระดาษในแผง เช่น /stamp approved
/stamp custom <ข้อความ> [สี]   ตราข้อความของคุณ เช่น /stamp custom ร้านกาแฟดี #6d4c41
/stamp export <ชื่อตรา|custom ข้อความ>   บันทึกเป็น stamp-*.svg พร้อมวันที่
/stamp owner <ชื่อ>       ชื่อผู้ปั๊ม (ใส่ใต้ตราตอน export)
/stamp clear              ล้างกระดาษ
ตรา: ${Object.entries(STAMPS).map(([k, s]) => `${k}=${s.text}`).join(' ')}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    owner = ((await $.store.get('owner')) as string | undefined) ?? ''
    await $.command.register({ name: 'stamp', description: 'ตรายางดิจิทัล ปั๊มเล่นในแผงหรือส่งออก SVG (/stamp help)', argumentHint: '<ตรา>|custom|export|owner|clear' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: แผงกระดาษ - ตราที่ปั๊มเรียงต่อกัน
  // ==========================================================================
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" backgroundColor="#fdfaf2" paddingX={1}>
        <Text color="#9e9e9e">📄 กระดาษ ({paper.length} ตรา)</Text>
        {paper.length === 0 && <Text color="#9e9e9e">ปั๊มด้วย /stamp approved</Text>}
        {paper.slice(-6).map(p => (
          <Box flexDirection="column" marginTop={1}>
            {stampAscii(p.text).split('\n').map(line => (
              <Text color={p.color} bold>
                {line}
              </Text>
            ))}
            <Text color="#9e9e9e">{thaiDate(p.at)}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'stamp' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()

    // custom <ข้อความ...> [สี] - คำสุดท้ายเป็นสีถ้าขึ้นต้นด้วย #
    const custom = (words: string[]): StampStyle | undefined => {
      const color = /^#[0-9a-f]{3,6}$/i.test(words.at(-1) ?? '') ? words.pop() : undefined
      const text = words.join(' ').slice(0, 20)
      return text ? { text, color: color ?? '#c62828', shape: 'rect' } : undefined
    }

    const stampIt = async (s: StampStyle) => {
      paper = [...paper, { text: s.text, color: s.color, at: now }].slice(-50)
      await $.ui.open({ id: PANE, title: '📮 Stamp' })
      $.ui.invalidate('ui.render')
      return { text: `ปั๊ก! 📮\n${stampAscii(s.text)}` }
    }

    switch (sub) {
      case '':
        return { text: ['📮 ตรายางทั้งหมด', ...Object.entries(STAMPS).map(([k, s]) => `  ${k.padEnd(12)} ${s.text}`), '', HELP.split('\n').slice(2).join('\n')].join('\n') }
      case 'help':
        return { text: HELP }
      case 'custom': {
        const s = custom(rest)
        return s ? stampIt(s) : { text: 'วิธีใช้: /stamp custom ชื่อแบรนด์ [#สี]' }
      }
      case 'export': {
        const s = rest[0] === 'custom' ? custom(rest.slice(1)) : STAMPS[rest[0] ?? '']
        if (!s) return { text: 'วิธีใช้: /stamp export approved  หรือ  /stamp export custom ชื่อแบรนด์ #1565c0' }
        const root = (await $.session.cwd()).replace(/[\\/]$/, '')
        const name = (rest[0] === 'custom' ? 'custom' : rest[0]) ?? 'stamp'
        const path = `${root}${root.includes('\\') ? '\\' : '/'}stamp-${name}.svg`
        await $.fs.write(path, stampSvg(s, thaiDate(now), owner))
        return { text: `💾 บันทึกตรา "${s.text}" แล้ว: ${path}\nลากไปวางในเอกสาร สไลด์ หรือแปลงเป็น PNG ได้` }
      }
      case 'owner':
        owner = rest.join(' ').slice(0, 30)
        await $.store.set('owner', owner)
        return { text: owner ? `✍️ ผู้ปั๊ม: ${owner}` : 'ลบชื่อผู้ปั๊มแล้ว' }
      case 'clear':
        paper = []
        $.ui.invalidate('ui.render')
        return { text: '🧹 ล้างกระดาษแล้ว' }
      default: {
        const s = STAMPS[sub]
        return s ? stampIt(s) : { text: `ไม่มีตรา "${sub}"\n${HELP}` }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ปั๊มตราลงไฟล์ PDF จริงด้วย $.process.run เรียกเครื่องมืออย่าง qpdf หรือ Python
 * 2. ตราวันที่แบบร้านค้า "รับแล้ว 24 ต.ค. 69" ที่เปลี่ยนวันเอง
 * 3. ปั๊ม "ตรวจแล้ว" อัตโนมัติเมื่อ Claude รีวิวโค้ดเสร็จ (ดัก turn.complete)
 */
