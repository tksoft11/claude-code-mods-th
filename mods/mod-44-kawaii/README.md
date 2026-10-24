# Mod 44: Kawaii TH

มาสคอตน่ารักเหนือช่องพิมพ์ที่เปลี่ยนสีหน้าตามสถานะจริงของ Claude: กำลังคิด / ใช้เครื่องมืออะไรอยู่ / เจอ error / เสร็จแล้ว / รอคุณตอบ / ว่าง เลือกได้ 6 ตัว (แมว หมี กระต่าย เพนกวิน ผี ก้อนวุ้น) และคลัง kaomoji 50 แบบ 5 หมวดที่ส่งลงช่องพิมพ์ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/kawaii` | ดูมาสคอตและสถานะ |
| `/kawaii pick <ตัว>` | เปลี่ยนตัว: cat bear bunny penguin ghost blob |
| `/kawaii preview` | ทุกอารมณ์ของตัวปัจจุบัน |
| `/kawaii gallery [หมวด]` | คลัง kaomoji 50 แบบ |
| `/kawaii use <หมวด> <เลข>` | ส่ง kaomoji ลงช่องพิมพ์ |
| `/kawaii on|off` | แสดง/ซ่อนมาสคอต |

## ติดตั้ง

```
/plugin install kawaii-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ตัวละคร 2 เฟรมต่ออารมณ์
2. คลัง kaomoji
3. เปลี่ยนอารมณ์และขยับเฟรมเฉพาะตอนทำงาน
4. ฟัง turn.start / tool.call / turn.complete / Notification
5. วาดมาสคอตใน AbovePrompt

## หมายเหตุ

spinner น่ารักอยู่ใน Mod 35 แล้ว ตัวนี้เน้นมาสคอตตามสถานะ ถ้าเปิดหลาย Mod ที่วาดเหนือช่องพิมพ์พร้อมกัน (เช่น Mod 01) อาจเห็นแค่ตัวเดียว
