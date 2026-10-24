# Mod 37: Dev Unblock TH

ช่วย Dev ที่ตัน: บอกอาการ (ติดบั๊ก งง งานท่วม เหนื่อย เบื่อ) แล้ว Claude จะอ่าน git status และ diff ล่าสุดของโปรเจกต์ ถามคำถามนำไม่เกิน 2 ข้อ และเสนอขั้นต่อไปที่เล็กที่สุด สั่ง /unblock go ให้ Claude ลงมือทำขั้นนั้นได้ทันที มีคำถามแบบ rubber duck และบันทึกว่าตันตอนไหนบ่อย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/unblock [อาการ] [เล่าเพิ่ม]` | อาการ: stuck confused overwhelm tired bored |
| `/unblock go` | ให้ Claude ทำขั้นต่อไปที่ได้ |
| `/unblock duck` | คำถามแบบ rubber duck |
| `/unblock log [clear]` | ดู / ล้างบันทึก |

## ติดตั้ง

```
/plugin install dev-unblock-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เก็บบริบทจาก git (สรุป ไม่ส่งทั้งไฟล์)
2. ให้ Claude โค้ชแบบสั้น และแยกขั้นต่อไปจากคำตอบ
3. คำสั่ง /unblock และส่งงานต่อด้วย $.prompt.submit

## หมายเหตุ

ส่ง git diff ล่าสุด (ตัดเหลือประมาณ 6,000 ตัวอักษร) ให้ model ใช้ token ตามจริง
