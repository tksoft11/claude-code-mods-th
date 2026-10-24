# Mod 95: MD Preview TH

ดู Markdown ที่ Claude แก้แบบเรนเดอร์ในแผงข้าง: README, docs, CHANGELOG แสดงหัวข้อ ตาราง โค้ด ลิงก์เหมือนดูบน GitHub ดูก่อนแก้ หลังแก้ หรือเทียบสองฝั่งได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/md` | เปิดไฟล์ .md ล่าสุดที่ Claude แก้ |
| `/md <path>` | เปิดไฟล์ markdown ไหนก็ได้ |
| `/md before\|after\|split` | ก่อน / หลัง / เทียบสองฝั่ง |
| `/md auto on\|off` | เปิดแผงเองเมื่อ Claude แก้ .md |

## ติดตั้ง

```
/plugin install md-preview-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. จับเนื้อหาก่อนและหลัง Claude แก้ไฟล์ .md
2. วาดด้วย `Markdown` element ของ surface

## หมายเหตุ

แก้ไฟล์เดิมหลายครั้ง "ก่อน" คือก่อนการแก้ครั้งแรก เทียบได้ทั้งชุด
