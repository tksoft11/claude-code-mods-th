# Mod 04: Filetree TH

แผงด้านข้างที่แสดงทุกไฟล์ที่ Claude อ่าน แก้ไข สร้าง หรือลบ จัดกลุ่มตามโฟลเดอร์ บอกจำนวนครั้งและเวลาล่าสุด มีไอคอนตามสถานะ (👁️ อ่าน ✏️ แก้ไข ✨ สร้าง 🗑️ ลบ) และตามชนิดไฟล์

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/files` | เปิดแผง |
| `/files list` | แสดงเป็นข้อความ |
| `/files clear` | ล้างรายการ |

## ติดตั้ง

```
/plugin install filetree-th --marketplace <github-user>/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. จดเฉพาะ tool ที่สำเร็จ (เช็ค `deny` และ `isError` หลัง `next`)
2. เช็คก่อน Write ว่าไฟล์มีอยู่แล้วหรือไม่ด้วย `$.fs.exists`
3. เปิดแผงด้วย `$.ui.open` และวาดด้วย `ui.render` บน `Pane`
4. สั่งวาดใหม่ด้วย `$.ui.invalidate`

## หมายเหตุ

การตรวจ `rm` ใน Bash เป็นแบบง่าย อ่านแค่ชื่อไฟล์หลังคำสั่ง rm
