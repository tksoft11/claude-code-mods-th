# Mod 60: File Badges TH

ป้ายสีภาษาหน้าแถว tool ที่อ่าน/แก้ไฟล์ เช่น [TS] [PY] [RS] [GO] ใช้สีเดียวกับ GitHub มีป้ายพิเศษสำหรับไฟล์ทดสอบ [TEST] ไฟล์ตั้งค่า [CONF] และไฟล์ลับ [ENV🔒] ให้กวาดตาแล้วรู้ทันทีว่า Claude แตะไฟล์อะไร พร้อมสรุปว่า session นี้อ่าน/แก้ภาษาอะไรไปเท่าไร

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/badges` | สรุปภาษาที่ Claude อ่าน/แก้ใน session |
| `/badges on\|off` | แสดง/ซ่อนป้าย |

## ติดตั้ง

```
/plugin install file-badges-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. สีของแต่ละภาษา (อิง GitHub linguist)
2. นับภาษาที่แตะจาก tool.call ที่สำเร็จ
3. วางป้ายซ้ายแล้วตามด้วยแถวเดิมทั้งแถว

## หมายเหตุ

แต่งเฉพาะแถว Read / Edit / Write / MultiEdit / NotebookEdit ใช้ร่วมกับ Mod 50 Tool Timeline ได้
