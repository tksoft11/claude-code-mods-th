# Mod 76: Git Graph TH

กราฟ git สีสวยในแผง: เส้นแต่ละ branch คนละสีตามเลน, ป้าย HEAD (เขียว) branch (ฟ้า) remote (ม่วง) tag (เหลือง), hash ข้อความ ผู้เขียน เวลา สรุปทุก branch ว่าล้ำหน้า/ตามหลังหรือ merge แล้ว ดูเฉพาะ commit ที่แตะไฟล์เดียวได้ และรีเฟรชเองเมื่อ Claude commit/merge/rebase

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/gitgraph [จำนวน]` | กราฟ commit ทุก branch (ค่าเริ่มต้น 40) |
| `/gitgraph branch` | สรุป branch |
| `/gitgraph file <path>` | เฉพาะ commit ที่แตะไฟล์นั้น |

## ติดตั้ง

```
/plugin install git-graph-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แยกส่วนกราฟออกจากข้อมูล commit
2. สรุป branch ด้วย rev-list --left-right --count
3. วาด: ตัวอักษรกราฟแต่ละคอลัมน์ได้สีของเลน

## หมายเหตุ

ต้องเป็น git repo
