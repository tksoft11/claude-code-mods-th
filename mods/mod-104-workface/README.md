# Mod 104: Workface TH

สมุดโน้ตงานที่รอดทุกการ compact: งานยาวๆ พอ compact ทีไร เป้าหมาย สิ่งที่ตกลงกันไว้ และกับดักที่เคยเจอมักหาย Mod นี้ให้ Claude มี tool `note` จดโน้ตเองระหว่างทำงาน (🎯 เป้าหมาย · ✅ ตัดสินใจแล้ว · ⚠️ กับดัก · ☐ ต้องทำ · 📍 ความคืบหน้า) ตอน compact จะสั่งตัวสรุปให้เก็บโน้ตไว้ครบ แล้วแนบโน้ตกลับไปกับ prompt ถัดไป เก็บเป็นไฟล์ `.claude/workface.md` เปิด session ใหม่ Claude ก็รู้งานเดิม

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/note <ข้อความ>` | จดเป็น "ต้องทำ" |
| `/note กับดัก: <ข้อความ>` | กำหนดประเภท: เป้าหมาย / ตัดสินใจ / กับดัก / ต้องทำ / คืบหน้า |
| `/note done <id>` | ทำเสร็จแล้ว |
| `/note rm <id>` | ลบ |
| `/note clear` | ล้างทั้งหมด |
| `/workface` | เปิดแผงสมุดโน้ต |

## ติดตั้ง

```
/plugin install workface-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน/เขียนไฟล์โน้ตเป็น Markdown ที่คนอ่านรู้เรื่อง
2. ลงทะเบียน tool ให้ Claude จดเองด้วย `$.tool.register` และตอบด้วย `tool.call`
3. ตอน compact: เติม `instructions` ให้ตัวสรุป แล้วแนบโน้ตกลับด้วย `context` ของ `prompt.submit`
4. แผงสมุดโน้ต

## หมายเหตุ

ทดสอบจริงแล้ว: หลัง `/compact` และใน session ใหม่ Claude ยังอ้างกับดักที่จดไว้ได้ตรงคำ แก้ไฟล์ `.claude/workface.md` ด้วยมือได้
