# Mod 58: Port Guard TH

ยามเฝ้าพอร์ต: ทุก 30 วินาทีดูว่าพอร์ตสำคัญ (3000, 5173, 8080, 8000, 4200, 5432, 3306, 6379, 27017 และที่เพิ่มเอง) ถูกโปรแกรมไหนใช้อยู่ เด้งเตือนเมื่อ server ที่เคยรันอยู่ตาย หรือมีโปรแกรมอื่นมายึดพอร์ตแทน และก่อน Claude สั่งเปิด server (npm run dev, vite, next dev, uvicorn ...) บนพอร์ตที่ไม่ว่าง จะเตือนพร้อมบอก Claude ว่าโปรแกรมไหนใช้อยู่

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/portguard` | สถานะพอร์ตที่เฝ้า (เช็คใหม่ทันที) |
| `/portguard add <พอร์ต> [ชื่อ]` | เฝ้าพอร์ตเพิ่ม |
| `/portguard remove <พอร์ต>` | เลิกเฝ้า |
| `/portguard start on\|off` | แจ้งเมื่อมี server ใหม่เริ่มใช้พอร์ตด้วย |
| `/portguard on\|off` | เปิด/ปิดการเฝ้า |

## ติดตั้ง

```
/plugin install port-guard-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านพอร์ตจาก netstat / lsof / ss
2. เทียบกับรอบก่อนแล้วเตือนเฉพาะสิ่งที่เปลี่ยน
3. เดาพอร์ตจากคำสั่งเปิด server แล้วเติม context ให้ Claude

## หมายเหตุ

ปิดโปรแกรมที่ยึดพอร์ตใช้ Mod 18 (/pain kill <port>) การเฝ้าทำงานเฉพาะตอนเปิด Claude Code อยู่
