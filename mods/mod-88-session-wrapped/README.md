# Mod 88: Session Wrapped TH

สรุป session แบบ Spotify Wrapped: เก็บสถิติตลอด session แล้ว `/wrapped` เปิดแผงเผยทีละหน้าแบบมีจังหวะ ได้แก่ เวลาที่ใช้, ช่วงเวลาทอง, tool ที่ใช้บ่อย, ไฟล์ที่รักที่สุด, บรรทัดที่เพิ่ม/ลบ, รอบที่นานที่สุด, คำสั่งที่พัง, ค่าใช้จ่าย และ "บุคลิก Claude ของคุณ" (นักสืบ, ช่างฝีมือ, นักซิ่ง CLI, หัวหน้าทีม ...) สร้างการ์ด HTML ไว้แคปจอแชร์ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/wrapped` | เผยสถิติทีละหน้าในแผง |
| `/wrapped html` | สร้างการ์ด HTML ที่ `.claude/wrapped/` |
| `/wrapped all` | สถิติสะสมทุก session |

## ติดตั้ง

```
/plugin install session-wrapped-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. บุคลิกจาก tool ที่ใช้มากที่สุด
2. หน้าต่างๆ ของ Wrapped
3. การ์ด HTML สำหรับแชร์
4. เก็บสถิติจาก prompt.submit, turn, tool.call, agent.spawn, session.measure
5. แผงเผยทีละหน้าด้วย `$.clock.every`

## หมายเหตุ

ค่าเงินบาทประมาณที่ 36 บาทต่อดอลลาร์ ควรใส่ `.claude/wrapped/` ใน `.gitignore` ของโปรเจกต์
