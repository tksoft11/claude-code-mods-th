# Mod 79: Live Diff TH

จอแยกสองแผง: แผง Diff เป็น git diff ของงานที่ยังไม่ commit ระบายสี (+ เขียว − แดง หัวไฟล์เหลือง) พร้อมไฟล์ใหม่ที่ยังไม่ git add และแผง Output เป็นคำสั่ง Bash ล่าสุดที่ Claude รันกับผลลัพธ์ (error สีแดง) ทั้งสองแผงอัปเดตทันทีเมื่อ Claude แก้ไฟล์หรือรันคำสั่ง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/livediff` | เปิดสองแผง |
| `/livediff staged` | เฉพาะที่ git add แล้ว |
| `/livediff file <path>` | เฉพาะไฟล์เดียว |
| `/livediff close` | ปิดทั้งสองแผง |

## ติดตั้ง

```
/plugin install live-diff-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน diff + ไฟล์ใหม่ที่ยังไม่ track
2. ฟัง Edit/Write/Bash แล้วอัปเดตเฉพาะตอนแผงเปิด
3. สองแผงคนละ requestId

## หมายเหตุ

ต้องเป็น git repo
