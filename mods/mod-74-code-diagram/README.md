# Mod 74: Code Diagram TH

แปลงโค้ดเป็นภาพ: Claude (Haiku) อ่านไฟล์จริงแล้ววาด flowchart (เงื่อนไขเป็น ◇ มีทาง yes/no) หรือ class diagram เป็นกล่อง ASCII และวาดผังการ import ระหว่างไฟล์ของโปรเจกต์ (คำนวณเองไม่ใช้ AI) บอกไฟล์ที่ถูก import มากสุดและ import ที่วนกัน บันทึกเป็น Markdown ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/diagram flow <ไฟล์>` | flowchart ของการทำงานหลัก |
| `/diagram class <ไฟล์>` | class / type และความสัมพันธ์ |
| `/diagram deps [โฟลเดอร์]` | ผังการ import + หา import วนกัน |
| `/diagram save` | บันทึกภาพล่าสุดเป็น .diagram.md |

## ติดตั้ง

```
/plugin install code-diagram-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ให้ Haiku วาดโดยใช้เฉพาะสิ่งที่อยู่ในโค้ด
2. ผัง import: อ่าน import/require/from แล้วหาวงจรด้วย DFS

## หมายเหตุ

ผัง import รองรับ JS/TS (relative import) และ Python (relative import) ภาพที่ Claude วาดควรอ่านทวนกับโค้ดจริง
