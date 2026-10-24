# Mod 31: Dev Awake TH

แก้ง่วงระหว่างเขียนโค้ด: มุกโปรแกรมเมอร์ ควิซความรู้ Dev โจทย์โค้ดสั้นๆ Pomodoro ที่นับถอยหลังใน status line และเตือนพักอัตโนมัติ (ดื่มน้ำ พักสายตา 20-20-20 ยืดเส้น) รวมถึงทักเมื่อทำงานดึกเกินไป

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/awake joke` | มุกโปรแกรมเมอร์ |
| `/awake quiz / answer <a-d>` | ควิซความรู้ Dev พร้อมนับคะแนน |
| `/awake challenge` | โจทย์โค้ดสั้นๆ พร้อมคำใบ้ |
| `/awake pomodoro [โฟกัส] [พัก]` | เริ่ม Pomodoro (ค่าเริ่มต้น 25/5 นาที) |
| `/awake pomodoro stop` | หยุด |
| `/awake remind on [นาที] / off` | เตือนพักอัตโนมัติ (ค่าเริ่มต้น 50 นาที) |
| `/awake status` | สถานะทั้งหมด |
| `/awake quote` / `quote ai` | คำคมของคนจริง (อ้างที่มาถูก) / ให้ Claude แต่งคำคมใหม่ |
| `/awake quote on [นาที]` / `quote off` | คำคมหมุนเวียนในแถบสถานะ (ไม่แย่งที่ Pomodoro) |

## ติดตั้ง

```
/plugin install dev-awake-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. คลังเนื้อหา (มุก ควิซ โจทย์ คำเตือน)
2. state ของ Mod
3. Pomodoro ด้วย $.clock.every และ $.ui.status
4. ทักเมื่อทำงานดึกผ่าน prompt.submit
5. คำสั่ง /awake

## หมายเหตุ

การเตือนพักและ Pomodoro ทำงานเฉพาะตอนเปิด Claude Code อยู่
