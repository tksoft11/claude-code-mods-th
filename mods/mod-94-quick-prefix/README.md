# Mod 94: Quick Prefix TH

สัญลักษณ์นำหน้า prompt เปลี่ยนโหมดเฉพาะรอบนั้น ไม่ต้องสลับ /model ไปมา: `+` คิดเต็มที่ (effort สูงสุด) สำหรับงานยาก · `_` ใช้ Haiku เร็วและถูก สำหรับงานง่าย · `~` โหมดประหยัด effort ต่ำ อ่านเฉพาะที่จำเป็น ตอบสั้น รอบถัดไปกลับเป็นค่าเดิมเอง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `+ <prompt>` | คิดเต็มที่ เช่น `+ ออกแบบ schema ใหม่` |
| `_ <prompt>` | ใช้ Haiku เช่น `_ แก้คำผิดใน README` |
| `~ <prompt>` | โหมดประหยัด |
| `/prefix` | ดูวิธีใช้และสถิติ |

## ติดตั้ง

```
/plugin install quick-prefix-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านสัญลักษณ์แล้วตัดออกจาก prompt (`prompt.submit`)
2. ผูกโหมดกับ turn ที่เพิ่งเริ่ม
3. เปลี่ยน model / effort ทุกคำขอใน turn นั้นด้วย `turn.step` (async generator)
4. บอกว่ารอบนี้อยู่โหมดไหน

## หมายเหตุ

ไม่ใช้ `!` เพราะ Claude Code ใช้ `!` นำหน้าเป็นโหมด shell อยู่แล้ว ใน `turn.step` ต้องใช้ model id เต็ม (`claude-haiku-5-5`) เพราะ alias ถูกส่งถึง API ตรงๆ
