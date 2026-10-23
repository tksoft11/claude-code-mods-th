# Mod 11: Sweet Alert TH

Alert สวยๆ แบบ SweetAlert ใน Claude Code: dialog กลางจอ มีขอบสีตามประเภท (✅ success, ❌ error, ⚠️ warning, ℹ️ info, ❓ question, ⏳ loading) มีปุ่มให้กดจริง ถามยืนยันได้ ให้กรอกข้อมูลได้ และถ้าสั่งหลาย alert ติดกันจะแสดงทีละอันตามคิว
นอกจากนี้ ถ้า Bash, Edit หรือ Write ล้มเหลว จะเด้ง toast เตือนให้เอง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/alert success บันทึกแล้ว` | แสดง alert (ปิดเองใน 5 วินาที) |
| `/alert error หัวข้อ \| ข้อความ` | แยกหัวข้อกับข้อความด้วย `\|` |
| `/alert demo` | ดูตัวอย่างทุกแบบ ต่อกันตามคิว |
| `/alert history` | ประวัติและผลการตอบของแต่ละ alert |
| `/alert answer <yes\|no\|ข้อความ>` | ตอบคำถามที่ค้างอยู่ด้วยคำสั่ง (ใช้ตอนเปิด dialog ไม่ได้) |
| `/alert clear` | ล้างทั้งหมด |
| `/confirm <คำถาม>` | ถามยืนยัน มีปุ่ม "ใช่" กับ "ยกเลิก" |
| `/prompt <คำถาม>` | ให้กรอกข้อมูลแล้วกด Enter |
| `/toast <type> <ข้อความ>` | แจ้งเตือนเล็กๆ มุมจอ |

ใน dialog: กด Tab เพื่อเลื่อนระหว่างปุ่ม, Enter เพื่อกด, `y` / `n` เป็นปุ่มลัด และ Esc เพื่อปิด (นับเป็นยกเลิก)

## ติดตั้ง

```
/plugin install sweet-alert-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. กำหนดหน้าตาแต่ละประเภท (ไอคอน, สี, หัวข้อ) ไว้ใน object เดียว
2. ระบบคิว: แสดงทีละอัน แล้วหยิบอันถัดไปเมื่ออันเดิมถูกตอบ
3. เปิดแผงแบบ dialog ด้วย `$.ui.open({ focus, closeOnEscape, holdToasts })` และปิดอัตโนมัติด้วย `$.clock.after`
4. จัดการ event ของผู้ใช้: `onPress` ของ `Button`, `onSubmit` ของ `Input` และดัก `ui.close` ตอนผู้ใช้กด Esc
5. วาด dialog ด้วย `Box` ที่มีขอบสี (`borderStyle`, `borderColor`)
6. เช็คก่อนใช้ element ที่บางหน้าจอไม่มี (`Input` ไม่มีบน mobile)

## หมายเหตุ

Mod วาด HTML/CSS ไม่ได้ จึงไม่มี animation แบบ SweetAlert บนเว็บ สิ่งที่ได้คือ dialog ที่ใช้ element ของ Claude Code เอง ซึ่งใช้ได้ทั้งใน terminal, แอป Desktop, VS Code และ mobile
