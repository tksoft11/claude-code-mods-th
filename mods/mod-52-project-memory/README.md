# Mod 52: Project Memory TH

สมองที่สองของ Claude ข้าม session: จดเรื่องที่อยากให้จำ เช่น "ใช้ pnpm ไม่ใช้ npm" แยกตามโปรเจกต์หรือใช้ทุกโปรเจกต์ แล้ว Mod แนบให้ Claude อ่านทุกบทสนทนาอัตโนมัติ พิมพ์ "จำไว้ว่า ..." ในแชตก็จดให้เอง และให้ Claude อ่านบทสนทนาแล้วเสนอเรื่องที่ควรจำให้ติ๊กเลือกได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/jam <ข้อความ>` | จดให้ Claude จำ (เฉพาะโปรเจกต์นี้) |
| `/jam global <ข้อความ>` | จดให้จำทุกโปรเจกต์ |
| `/jam list` | ดูทั้งหมด |
| `/jam forget <เลข>` | ลบข้อที่ระบุ |
| `/jam suggest` | ให้ Claude เสนอเรื่องที่ควรจำ แล้วเลือกในหน้าต่าง |
| `/jam on\|off` | แนบ/ไม่แนบให้ Claude |
| `/jam clear confirm` | ล้างของโปรเจกต์นี้ |

## ติดตั้ง

```
/plugin install project-memory-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เก็บแยกตามโปรเจกต์ใน $.store
2. ข้อความที่แนบให้ Claude
3. แนบด้วย event prompt.context และ invalidate เมื่อเปลี่ยน
4. จับ "จำไว้ว่า" ใน prompt.submit
5. เสนอด้วย Haiku แล้วให้เลือกด้วย $.ui.ask

## หมายเหตุ

ต่างจาก CLAUDE.md ตรงที่เก็บในเครื่องคุณ ไม่ลง repo ไม่กระทบเพื่อนร่วมทีม ใช้ชื่อ /jam (จำ) เพราะ /memory เป็นคำสั่งของ Claude Code เอง ถ้าพิมพ์ "จำไว้ว่า" Claude Code อาจบันทึกลง auto-memory ของตัวเองด้วย
