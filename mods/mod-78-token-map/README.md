# Mod 78: Token Map TH

แผนที่ความร้อนของ token: ประเมินว่าแต่ละโฟลเดอร์/ไฟล์จะกิน context ของ Claude เท่าไรถ้าให้อ่านทั้งไฟล์ (เทียบกับ 200k) 10 ไฟล์ที่ใหญ่สุด ไฟล์ที่ไม่ควรให้อ่าน (lock file, build, minified) พร้อมวิธีกันใน permissions และนับ token จริงของไฟล์ที่ Claude อ่านใน session นี้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/tokenmap [โฟลเดอร์]` | ประเมินทั้งโปรเจกต์หรือโฟลเดอร์ |
| `/tokenmap session` | ไฟล์ที่ Claude อ่านจริงใน session นี้ |

## ติดตั้ง

```
/plugin install token-map-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เดินโฟลเดอร์เก็บขนาดไฟล์ (ไม่อ่านเนื้อไฟล์)
2. นับ token จากผลลัพธ์ Read ที่โมเดลได้จริง

## หมายเหตุ

เป็นค่าประมาณ (ไบต์ / 3.5) ภาษาไทยกิน token มากกว่านี้
