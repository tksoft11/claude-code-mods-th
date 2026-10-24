# Mod 92: Changes Receipt TH

ใบเสร็จการเปลี่ยนแปลงทุกรอบ: Claude ตอบจบเมื่อไหร่ พิมพ์ใบเสร็จลงบทสนทนาว่า 🆕 สร้างไฟล์ไหน · ✏️ แก้ไฟล์ไหน (+/- บรรทัด) · 🗑 ลบอะไร รวมสิ่งที่ทำผ่าน shell (rm, mv, cp, mkdir, touch, > redirect, git restore) และแยกส่วน "ลองแล้วไม่สำเร็จ" ให้เห็นชัด

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/receipt` | ใบเสร็จรอบล่าสุด |
| `/receipt all` | รวมทั้ง session |
| `/receipt on\|off` | พิมพ์อัตโนมัติทุกรอบ |

## ติดตั้ง

```
/plugin install changes-receipt-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านคำสั่ง shell ที่เปลี่ยนไฟล์
2. พิมพ์ใบเสร็จ รวมการแก้ไฟล์เดียวกันเป็นบรรทัดเดียว
3. จดทุกการเปลี่ยนแปลงจาก tool.call
4. จบรอบแล้วพิมพ์ลงบทสนทนาด้วย `$.ui.log`

## หมายเหตุ

ใบเสร็จเป็นบรรทัดที่คนเห็น Claude ไม่เห็น จึงไม่เปลือง context การจับคำสั่ง shell เป็นการเดาจากรูปแบบคำสั่ง
