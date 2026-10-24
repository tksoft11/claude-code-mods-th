# Mod 32: Agent Tips TH

ทิปสั่ง Claude Code วันละข้อ (แสดงตอนเปิด Claude Code ครั้งแรกของวัน) 20 ข้อใน 6 หมวด เฉพาะฟีเจอร์ที่มีจริง พร้อม template prompt 8 แบบ (แก้บั๊ก ฟีเจอร์ใหม่ refactor รีวิว เขียนเทสต์ อธิบายโค้ด commit หาจุดช้า) เลือกแล้วเติมลงช่องพิมพ์ให้ทันที

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/agenttips` | ทิปวันนี้ |
| `/agenttips random / all` | สุ่ม / ดูทั้งหมด |
| `/agenttips cat <หมวด>` | ทิปตามหมวด |
| `/agenttips search <คำ>` | ค้นทิป |
| `/agenttips fav [id]` | รายการโปรด |
| `/agenttips template [ชื่อ]` | เติม template ลงช่องพิมพ์ |

## ติดตั้ง

```
/plugin install agent-tips-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. คลังทิป
2. template prompt ที่มี {ช่องว่าง} ให้เติม
3. คำสั่ง /agenttips และการเติมช่องพิมพ์ด้วย $.prompt.fill

## หมายเหตุ

ใช้ชื่อ /agenttips เพราะ /tips เป็นของ Mod 03 และ /prompt เป็นของ Mod 11
