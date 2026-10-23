# Mod 06: Blast Radius TH

ก่อน Claude แก้ไฟล์ที่มีอยู่แล้ว (Edit/Write) Mod จะหาว่ามีไฟล์ไหน import ไฟล์นั้นอยู่ด้วย `git grep` แล้วให้ระดับความเสี่ยง 🟢 LOW / 🟡 MEDIUM / 🟠 HIGH / 🔴 CRITICAL ถ้าเสี่ยงสูงจะเด้งเตือนคุณ และแนบรายชื่อไฟล์ที่ได้รับผลกระทบให้ Claude อ่านด้วย Claude จะได้รู้ว่าต้องเช็คไฟล์ไหนต่อ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/blast <ไฟล์>` | วิเคราะห์ไฟล์นั้น |
| `/blast list` | ดูไฟล์ที่วิเคราะห์ไปแล้ว |

## ติดตั้ง

```
/plugin install blast-radius-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. รันคำสั่งของเครื่องด้วย `$.process.run` (ส่ง argv ไม่ต่อสตริง)
2. cache ผลด้วย `Map` 5 นาที
3. ส่งข้อความให้ Claude อ่านผ่าน `context` ของผลลัพธ์ tool
4. วิธีบล็อก tool ด้วย `{ deny }` (อยู่ในคอมเมนต์)

## หมายเหตุ

ต้องอยู่ใน git repo และหาเฉพาะ import แบบ relative (`./`, `../`) ที่อ้างชื่อไฟล์ตรงๆ ไม่ใช่ dependency graph เต็ม
