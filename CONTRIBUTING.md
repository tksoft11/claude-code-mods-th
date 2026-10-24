# มาตรฐานของ Mod ใน repo นี้

ทุก Mod ใช้โครงสร้าง รูปแบบโค้ด และขั้นตอนตรวจแบบเดียวกัน ใช้หน้านี้เป็น checklist ตอนเพิ่ม Mod ใหม่

## 1. ชื่อและโฟลเดอร์

| อะไร | รูปแบบ | ตัวอย่าง |
|---|---|---|
| โฟลเดอร์ | `mods/mod-NN-<ชื่อ>` (NN สองหลัก) | `mods/mod-12-flex-message` |
| ชื่อปลั๊กอิน (`name`) | `<ชื่อ>-th` | `flex-message-th` |
| คำสั่ง | ภาษาอังกฤษ ตัวเล็ก ใช้ได้แค่ตัวอักษร ตัวเลข `-` `_` | `/flex` |

```
mods/mod-NN-<ชื่อ>/
├── .claude-plugin/plugin.json
├── hooks/hooks.json
├── hooks/register.tsx
└── README.md
```

`plugin.json`:

```json
{
  "name": "<ชื่อ>-th",
  "version": "1.0.0",
  "description": "<บรรทัดเดียว ภาษาไทย บอกว่า Mod ทำอะไร>",
  "author": { "name": "Tawatchai Saekuai" }
}
```

`hooks/hooks.json`:

```json
{
  "modules": ["./register.tsx"]
}
```

## 2. รูปแบบของ `register.tsx`

```ts
/**
 * ============================================================================
 * MOD NN: <ชื่อ> TH - <คำอธิบายสั้น> (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: <ลิงก์ หรือ "Mod ของเราเอง ...">
 *
 * หน้าที่ของ Mod นี้:
 * 1. ...
 */

import type { EngineInterface, Register } from 'claude-code'

// ==========================================================================
// บทที่ 1: <หัวข้อ>
// ==========================================================================
...

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: '...', description: '...' })
    return next(e)
  })
  on('command.run', { command: '...' }, async ($, e) => ({ text: '...' }))
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. ...
 */
```

กติกา:

- คอมเมนต์เป็นภาษาไทย แบ่งเป็น "บทที่ 1, 2, 3, ..." เรียงตามลำดับในไฟล์
- ลงทะเบียนคำสั่งใน `session.start` ด้วย `$.command.register` แล้วตอบใน `command.run` โดยคืนค่าเป็น `{ text }`
- ห้ามใช้ `console.log`, `setTimeout`, `Date.now()` หรือ DOM (ไม่มีให้ใช้ใน Mod) ให้ใช้ `$.ui.toast`, `$.clock.after` และ `$.clock.now()` แทน
- ค่าที่ถูกวาดบนจอให้เก็บในตัวแปรของ module แล้วเรียก `$.ui.invalidate('ui.render')` ทุกครั้งที่ค่าเปลี่ยน (`$.state` ยังใช้ไม่ได้ใน build ปัจจุบัน)
- ค่าที่ต้องจำข้าม session ให้เก็บใน `$.store`
- รันคำสั่งของเครื่องด้วย `$.process.run([...argv])` และส่งค่าที่ผู้ใช้พิมพ์ผ่าน `env` ห้ามต่อเป็นสตริงคำสั่ง
- วันที่ในชื่อไฟล์ให้ใช้เวลาเครื่อง ไม่ใช้ `toISOString()` เพราะได้เวลา UTC
- ใช้ element ที่บางหน้าจอไม่มี (เช่น `Input` ไม่มีบน mobile) ต้องเช็คก่อนใช้
- แยกโค้ดเป็นหลายไฟล์ได้ (เช่น `hooks/qr.ts`) แล้ว import แบบไม่ใส่นามสกุล: `import { encodeQR } from './qr'` ใช้ library จาก npm ไม่ได้
- ตั้งชื่อคำสั่งให้ไม่ชนกับคำสั่งที่มีอยู่แล้ว (เช่น `/docs`, `/clear`, `/help`) ไม่งั้นคำสั่งอื่นจะรับไปแทน ลองพิมพ์ `/` แล้วดูรายการก่อนตั้งชื่อ
- คำสั่งที่ลบหรือปิดอะไร ให้แสดงรายการก่อน แล้วทำจริงเมื่อพิมพ์ `confirm` ต่อท้าย
- `$.http.fetch` รับ response ได้ไม่เกิน 4 MB ต่อครั้ง ถ้าต้องโหลดมากกว่านั้นให้แบ่งเป็นหลายครั้ง
- เปิดเว็บ/แอป/ไฟล์ด้วย `$.process.run` ให้ส่ง URL หรือ path ผ่าน `env` (ดู Mod 24) และทดสอบด้วย `claude plugin test` ที่จำลอง `process.run` จะได้ไม่มีหน้าต่างเด้งขึ้นมาตอนทดสอบ
- function ที่รับ `$` ต้องประกาศไว้ระดับบนสุดของไฟล์ (นอก `register`) ไม่งั้น engine ไม่โหลด Mod
- ห้ามใช้ prop `mono` ของ `Text` เพราะหน้าจอไม่รับ แล้ว Claude Code จะไม่วาดทั้งแผง Mod ที่มีการวาดหน้าจอให้ทดสอบด้วย `claude plugin test` ก่อน

## 3. รูปแบบของ `README.md` ของแต่ละ Mod

ใช้หัวข้อเหล่านี้ เรียงตามนี้:

1. `# Mod NN: <ชื่อ> TH` ตามด้วยย่อหน้าบอกว่าทำอะไร
2. `## คำสั่ง` เป็นตาราง `| คำสั่ง | ทำอะไร |`
3. `## ติดตั้ง` ใช้บรรทัด `/plugin install <ชื่อ>-th --marketplace tksoft11/claude-code-mods-th`
4. `## โค้ดสอนอะไร` เป็นรายการเรียงตามบทใน `register.tsx`
5. `## หมายเหตุ` บอกข้อจำกัด

## 4. ตรวจก่อน commit

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

# 1) ตรวจ manifest และ hooks
claude plugin validate mods/mod-NN-<ชื่อ>

# 2) ลองรันคำสั่งจริง (Git Bash ต้องตั้ง MSYS_NO_PATHCONV=1 ไม่งั้น /คำสั่ง จะกลายเป็น path)
claude -p "/<คำสั่ง> help" --plugin-dir mods/mod-NN-<ชื่อ>

# 3) ตรวจ marketplace ทั้งหมด
claude plugin validate .
```

## 5. เพิ่มเข้า repo

- เพิ่มแถวใน `.claude-plugin/marketplace.json`
- เพิ่มแถวในตารางของ `README.md` หลัก และเพิ่มบรรทัด `/plugin install` ในส่วนติดตั้ง
- อัปเดตจำนวน Mod ในบรรทัดแรกของ `README.md` และใน `description` ของ marketplace
