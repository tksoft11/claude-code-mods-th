# Mod 21: Status Page TH

ทำหน้าสถานะระบบแบบ status.example.com: ลงทะเบียนเว็บหรือ API แล้วเช็คจริงทาง HTTP เก็บประวัติและ uptime % ตั้งเช็คอัตโนมัติได้ (เด้งเตือนเมื่อสถานะเปลี่ยน) บันทึกและปิดเหตุขัดข้อง (incident) และส่งออกเป็นไฟล์ HTML หน้าเดียว 5 ธีมไปขึ้นเว็บได้เลย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/statuspage` | สถานะล่าสุด + เปิดแผง |
| `/statuspage add <ชื่อ> <url>` | เพิ่ม service (เช็คทันที) |
| `/statuspage check` | เช็คทุก service ตอนนี้ |
| `/statuspage monitor on [นาที] / off` | เช็คอัตโนมัติ (ค่าเริ่มต้นทุก 5 นาที) |
| `/statuspage incident <ข้อความ> [--service ชื่อ] [--major]` | เปิด incident |
| `/statuspage resolve <id>` | ปิด incident |
| `/statuspage export [ธีม]` | สร้าง status.html (light, dark, thai, minimal, ocean) |
| `/statuspage reset confirm` | ล้างข้อมูลทั้งหมด |

## ติดตั้ง

```
/plugin install status-page-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เช็ค service ด้วย HTTP พร้อม timeout (Promise.race กับ $.clock.sleep)
2. คำนวณ uptime และสถานะรวม
3. สร้างหน้า HTML หน้าเดียว และ escape ทุกข้อความที่มาจากผู้ใช้
4. แผงสถานะสดพร้อมแถบประวัติ
5. คำสั่ง /statuspage และการเช็คอัตโนมัติด้วย $.clock.every

## หมายเหตุ

ใช้ชื่อ /statuspage เพราะ /status เป็นคำสั่งเดิมของ Claude Code การเช็คอัตโนมัติทำงานเฉพาะตอนเปิด Claude Code อยู่ ถ้าต้องการเฝ้าตลอด 24 ชม. ให้ใช้บริการ uptime monitor หรือ GitHub Actions
