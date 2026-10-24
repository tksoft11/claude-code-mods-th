# Mod 62: Session Bridge TH

ท่อเชื่อม Claude Code หลายหน้าต่างบนเครื่องเดียวกัน: ดูว่ามี session ไหนเปิดอยู่ ส่งข้อความไปให้ Claude อีกหน้าต่าง หรือส่ง "คำตอบล่าสุด" ของหน้าต่างนี้ไปให้ เช่น ส่งสเปก API จากหน้าต่าง backend ไปหน้าต่าง frontend และแจ้งเตือนเมื่อมีข้อความเข้ามาพร้อมกล่องข้อความย้อนหลัง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/bridge list` | session / agent ที่ส่งหาได้ |
| `/bridge send <ชื่อ> <ข้อความ>` | ส่งข้อความ |
| `/bridge share <ชื่อ> [หมายเหตุ]` | ส่งคำตอบล่าสุดของหน้าต่างนี้ |
| `/bridge inbox` | ข้อความที่ได้รับ |

## ติดตั้ง

```
/plugin install session-bridge-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. รายชื่อจาก tool ListAgents
2. ส่งด้วย $.session.send และเช็ค isDelivered
3. ข้อความเข้าผ่าน event session.receive

## หมายเหตุ

ใช้กลไก SendMessage ของ Claude Code เอง ส่งได้เฉพาะ session ของคุณที่เปิดอยู่ ข้อความที่ส่งไป Claude อีกฝั่งจะอ่านและอาจทำตาม จึงควรส่งเฉพาะสิ่งที่ตั้งใจ
