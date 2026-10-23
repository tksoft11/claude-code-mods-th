# Mod 24: App Scheduler TH

ตั้งเวลาเปิดเว็บ แอป หรือไฟล์อัตโนมัติเหมือนนาฬิกาปลุก: ทุกวัน, เฉพาะวันทำงาน, วันที่เลือก หรือครั้งเดียว มีเว็บยอดนิยมให้เลือก (gmail, youtube, line, tradingview ฯลฯ) ถึงเวลาแล้วจะเปิดให้และเด้งบอก

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/autoopen add gmail weekdays 09:00` | เปิด Gmail วันทำงาน 9 โมง (ใช้ preset) |
| `/autoopen add งาน https://notion.so daily 08:30` | เปิดเว็บทุกวัน |
| `/autoopen add รายงาน C:\work\report.xlsx mon,fri 09:00` | เปิดไฟล์วันจันทร์กับศุกร์ |
| `/autoopen add ประชุม https://meet.google.com once 14:30` | ครั้งเดียว (วันนี้ หรือพรุ่งนี้ถ้าเลยเวลาแล้ว) |
| `/autoopen list / next` | ดูรายการ / รายการถัดไป |
| `/autoopen run <id>` | เปิดเดี๋ยวนี้ |
| `/autoopen on <id> / off <id> / delete <id>` | เปิด/ปิด/ลบรายการ |
| `/autoopen presets` | รายชื่อ preset |

## ติดตั้ง

```
/plugin install app-scheduler-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. คำนวณเวลารอบถัดไปตามรูปแบบการทำซ้ำ (เวลาท้องถิ่น)
2. เปิดเว็บ/แอป/ไฟล์ด้วยโปรแกรมของระบบ ส่ง target ผ่าน env กันคำสั่งแทรก
3. วนเช็คทุก 30 วินาที และไม่เปิดย้อนหลังรายการที่พลาดไปนาน
4. คำสั่ง /autoopen

## หมายเหตุ

ทำงานเฉพาะตอนเปิด Claude Code อยู่ ถ้าต้องการให้เปิดแม้ไม่ได้เปิด Claude Code ให้ใช้ Task Scheduler ของ Windows หรือ cron ใช้ชื่อ /autoopen เพราะ /schedule เป็นคำสั่งที่มีอยู่แล้ว
