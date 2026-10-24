# Mod 47: SQLite TH

เปิดไฟล์ฐานข้อมูล SQLite ของจริงใน Claude Code: ดูรายชื่อตารางพร้อมจำนวนแถว ดูโครงสร้าง รัน SQL แล้วแสดงผลเป็นตาราง (ภาษาไทยตรงคอลัมน์) ทั้งในแชตและในแผง ส่งออกเป็น CSV ที่เปิดใน Excel ภาษาไทยไม่เพี้ยน และกันพลาด: DROP หรือ DELETE/UPDATE ที่ไม่มี WHERE ต้องพิมพ์ confirm ต่อท้าย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/sqlite open <ไฟล์.db> [new]` | เปิด (หรือสร้างใหม่) |
| `/sqlite tables` | ตาราง + จำนวนแถว |
| `/sqlite schema <ตาราง>` | โครงสร้างตาราง |
| `/sqlite <SQL>` | รัน SQL |
| `/sqlite export <ไฟล์.csv> <SQL\|ตาราง>` | ส่งออก CSV |
| `/sqlite close` | ปิด |

## ติดตั้ง

```
/plugin install sqlite-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. สคริปต์ Python ที่รับค่าทาง env ตอบเป็น JSON
2. เลือก python ที่ใช้ได้ หรือใช้โปรแกรม sqlite3 แทน
3. วาดตารางเป็นข้อความ
4. กันคำสั่งอันตราย
5. คำสั่ง /sqlite

## หมายเหตุ

ต้องมี Python 3 (มี sqlite3 ในตัว) หรือโปรแกรม `sqlite3` บนเครื่อง SQL และ path ส่งผ่าน env/argv ไม่ต่อเป็นคำสั่ง shell รันได้ทีละคำสั่ง แสดงผลสูงสุด 200 แถว
