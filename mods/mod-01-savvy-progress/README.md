# Mod 01: Savvy Progress TH

แถบเหนือช่องพิมพ์ที่บอกว่า session นี้ใช้เวลาไปเท่าไหร่ เรียก tool กี่ครั้ง ใช้ token เท่าไหร่ และคิดเป็นเงินบาทประมาณเท่าไหร่ ระหว่างที่ tool ทำงานจะขึ้นชื่อ tool ใน status line ด้วย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/progress` | ดูรายงานเต็ม |
| `/progress hide` | ซ่อนแถบ |
| `/progress show` | แสดงแถบ |

## ติดตั้ง

```
/plugin install savvy-progress-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. จำค่าข้าม event ด้วยตัวแปรนอก `register()`
2. ดัก `tool.call` ทั้งก่อนและหลัง `next(e)`
3. อ่าน `usage` จาก `turn.complete`
4. วาดแถบ `AbovePrompt` และสั่งวาดใหม่ด้วย `$.ui.invalidate`
5. สร้างคำสั่งเองด้วย `$.command.register` + `command.run`

## หมายเหตุ

ราคาเป็นค่าประมาณ แก้ได้ที่ `PRICE` และ `THB_PER_USD` ด้านบนของไฟล์
