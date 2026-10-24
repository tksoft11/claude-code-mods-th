# Mod 45: Celebrate TH

ฉลองความสำเร็จด้วยพลุกระดาษที่ตกลงมาในแผงและเสียงแตรที่สังเคราะห์ขึ้นเอง ฉลองอัตโนมัติเมื่อ Claude รันคำสั่งแล้วสำเร็จจริง: เทสต์ผ่าน (npm/pnpm/yarn test, pytest, jest, vitest, go test, cargo test ...), git commit สำเร็จ และ deploy สำเร็จ พร้อมสถิติ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/celebrate [ข้อความ]` | พลุกระดาษ + แตรฉลอง |
| `/celebrate auto on\|off` | ฉลองอัตโนมัติ |
| `/celebrate sound on\|off` | เปิด/ปิดเสียง |
| `/celebrate stats` | สถิติความสำเร็จ |
| `/celebrate style fireworks\|confetti` | พลุไฟ (ค่าเริ่มต้น: จรวดพุ่งแล้วระเบิดเป็นประกายสี) หรือพลุกระดาษ |

## ติดตั้ง

```
/plugin install celebrate-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แยกแยะความสำเร็จจากคำสั่งและผลลัพธ์ Bash
2. พลุกระดาษที่คำนวณจากเลขเฟรม (ทดสอบได้)
3. ดูผลลัพธ์ Bash ใน tool.call
4. วาดพลุในแผง
5. คำสั่ง /celebrate

## หมายเหตุ

เสียงใน sounds/ สังเคราะห์ขึ้นเองด้วย Python บน Windows/Linux เล่นผ่านโปรแกรมของระบบ (PowerShell SoundPlayer / paplay / aplay) แบบเดียวกับ Mod 36 การฉลองอัตโนมัติดูจากคำสั่งที่ Claude รันเท่านั้น ไม่รวมคำสั่งที่คุณรันเองใน terminal
