# Mod 59: Spinner Arcade TH

เกมแพคแมนใต้ spinner ตอนรอ Claude คิดนานเกิน 5 วินาที วิ่งกินจุดสะสมแต้ม (มีสถิติรอบที่รอนานสุด) และถ้ารอบนั้นมี tool พังหลายครั้ง แถบจะเปลี่ยนเป็นสีพาสเทลนุ่มๆ พร้อมคำปลอบใจ วาดต่อท้าย spinner เดิม จึงใช้ร่วมกับ Mod 35 Spinner ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/arcade` | แต้มสะสม + รอบที่รอนานสุด |
| `/arcade on\|off` | เปิด/ปิด |
| `/arcade reset` | ล้างแต้ม |

## ติดตั้ง

```
/plugin install spinner-arcade-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. วาดเฟรมจากเวลาที่ผ่านไปล้วนๆ
2. timer วิ่งเฉพาะระหว่าง Claude ทำงาน และนับ tool ที่พัง
3. ห่อ Spinner เดิมด้วย {await next(e)}

## หมายเหตุ

ไม่บังข้อความพิเศษของ spinner (เช่น รออนุญาต) รวมไอเดีย spinner-mini-game กับ mood-palette ไว้ด้วยกันเพราะวาดตำแหน่งเดียวกัน
