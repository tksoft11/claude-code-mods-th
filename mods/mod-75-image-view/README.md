# Mod 75: Image View TH

ดูรูปในแผงข้าง Claude Code (PNG JPG GIF WebP BMP): บน terminal แสดงรูปจริงด้วย element Image บน VS Code/Desktop ใช้ SVG แปลงรูปเป็นภาพบล็อกสี ▀ แบบ pixel art ได้ และส่งรูปให้ Claude ตัวหลักเปิดดูแล้วตอบคำถาม เช่น "หน้าเว็บนี้มีอะไรเพี้ยน"

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/view <รูป>` | แสดงรูปในแผง |
| `/view <รูป> blocks` | ภาพบล็อกสีแบบ pixel art |
| `/view <รูป> ask <คำถาม>` | ให้ Claude เปิดรูปแล้วตอบ |

## ติดตั้ง

```
/plugin install image-view-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ถอดรูปด้วย Python + Pillow หรือ PowerShell (System.Drawing)
2. ภาพบล็อก: ▀ สีตัวอักษร = พิกเซลบน สีพื้น = พิกเซลล่าง
3. แผงรูป: เลือกวิธีวาดจาก e.surface

## หมายเหตุ

ต้องมี Python + Pillow (pip install pillow) หรือ PowerShell บน Windows $.model.complete รับได้แต่ข้อความ การวิเคราะห์ภาพจึงส่งต่อให้ Claude ตัวหลัก (อ่านรูปด้วย Read tool)
