# Mod 87: Secret Veil TH

ปิด secret ก่อนถึงตา Claude: เมื่อผลของ Bash หรือ Read มี API key, token, รหัสผ่าน, private key, JWT หรือรหัสใน connection string จะถูกเปลี่ยนเป็น `‹secret:N›` ก่อนส่งให้ Claude ค่าจริงจึงไม่เข้า context ไม่ถูกส่งไป API และไม่อยู่ใน transcript

Claude ยังทำงานได้ตามปกติ: ถ้า Claude ใส่ `‹secret:N›` ในคำสั่ง Bash หรือใน Write/Edit Mod จะใส่ค่าจริงกลับให้ตอนรัน โดย Claude ไม่เคยเห็นค่าจริง

ต่างจาก [Mod 15 Cyber Guard](../mod-15-cyber-guard) ที่ตรวจตอน Claude **เขียน** secret ลงไฟล์ ส่วน Mod นี้ปิดตอน Claude **อ่าน** เจอ secret ใช้คู่กันได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/veil` | ดู secret ที่ปิดไป (แสดงแค่ 4 ตัวแรก) |
| `/veil on\|off` | เปิด/ปิด |

## ติดตั้ง

```
/plugin install secret-veil-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. รูปแบบ secret (ของแต่ละเจ้า, ชื่อตัวแปร, URL, Bearer)
2. ปิดและเปิดด้วยตารางในหน่วยความจำ
3. ใส่ค่าจริงกลับก่อน tool รัน (`next({ ...e, command })`)
4. ปิดผลของ Read และ tool อื่น

## หมายเหตุ

ตรวจด้วยรูปแบบ (regex) จับได้เฉพาะ secret ที่หน้าตาเป็นแบบที่รู้จัก ตารางค่าจริงอยู่ในหน่วยความจำของ session เท่านั้น ไม่เขียนลงไฟล์ เปิด session ใหม่ เลข `‹secret:N›` เริ่มนับใหม่
