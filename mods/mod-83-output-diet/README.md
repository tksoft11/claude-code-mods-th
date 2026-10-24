# Mod 83: Output Diet TH

ตัด output ยาวของคำสั่ง Bash ก่อนส่งให้ Claude อ่าน: เกิน 150 บรรทัดจะเหลือหัว 40 บรรทัด บรรทัดสำคัญตรงกลาง (error, fail, warning) และท้าย 60 บรรทัด ฉบับเต็มเก็บไว้ที่ `.claude/output-diet/` และบอก Claude ให้อ่านไฟล์นั้นถ้าต้องการ ประหยัด context และ token จริง แถบสถานะบอกว่าประหยัดไปกี่ token

ต่างจาก [Mod 61 Log Fold](../mod-61-log-fold) ที่พับให้คนดู แต่ Claude ยังอ่านเต็ม

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/diet` | ดูสถานะและ token ที่ประหยัดได้ |
| `/diet on\|off` | เปิด/ปิด |
| `/diet lines <n>` | เกณฑ์จำนวนบรรทัด (50-2000) |

ใส่ `# full` ท้ายคำสั่งเมื่ออยากให้ Claude เห็น output เต็ม เช่น `npm test # full`

## ติดตั้ง

```
/plugin install output-diet-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เลือกบรรทัดที่จะเก็บ (หัว + บรรทัด error + ท้าย)
2. `await next(e)` เอาผลของ Bash มาแก้ แล้วคืน `{ result }` ใหม่ให้ Claude อ่าน

## หมายเหตุ

ตัดเฉพาะคำสั่งที่สำเร็จ ผลที่ error ส่งเต็มเสมอ ควรใส่ `.claude/output-diet/` ใน `.gitignore` ของโปรเจกต์
