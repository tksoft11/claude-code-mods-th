# Mod 09: Replay Theater TH

บันทึกทุกอย่างใน session เป็น "ฉาก": prompt ของคุณ, tool ที่ Claude เรียก, ผลลัพธ์พร้อมเวลาที่ใช้, error และคำตอบ ดูย้อนหลังได้หลายแบบ เล่นทีละฉากในแผงด้านข้างเหมือนดูหนัง และส่งออกเป็นไฟล์ HTML

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/replay` | ดูทั้งหมด |
| `/replay last 5` | 5 ฉากล่าสุด |
| `/replay scene 10` | ฉากที่ 10 แบบละเอียด |
| `/replay errors` | เฉพาะที่พัง |
| `/replay tools` | สรุปการใช้ tool |
| `/replay play 1000` | เล่นในแผง ฉากละ 1 วินาที |
| `/replay stop` | หยุดเล่น |
| `/replay export` | ส่งออก HTML |
| `/replay pause / resume / clear` | หยุดบันทึก / บันทึกต่อ / ล้าง |

## ติดตั้ง

```
/plugin install replay-theater-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ดักหลาย event (`prompt.submit`, `tool.call`, `turn.complete`)
2. จับเวลาการทำงานของ tool
3. ใช้ timer `$.clock.every` และยกเลิกด้วย `cancel()`
4. escape ข้อความก่อนใส่ HTML

## หมายเหตุ

เก็บล่าสุด 200 ฉาก และฉากจะเริ่มใหม่เมื่อ Mod ถูกโหลดใหม่
