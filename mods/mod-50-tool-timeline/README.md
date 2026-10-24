# Mod 50: Tool Timeline TH

ไทม์ไลน์การทำงานของ Claude แบบ Chrome DevTools: จับเวลาทุก tool เติมเวลาและแท่งเทียบใต้แถว tool ในแชต (ตัวที่ช้าสุดของรอบเป็นสีส้ม) เติมสรุปใต้บรรทัด "Baked for ..." ว่าเวลาหายไปกับอะไร และมีกราฟแกนต์ในแผงให้เห็นว่าอะไรรันพร้อมกัน อะไรรอกัน

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/timeline` | กราฟแกนต์ของรอบล่าสุด (เปิดแผง) |
| `/timeline stats` | สถิติแยกตาม tool ทั้ง session |
| `/timeline on\|off` | เปิด/ปิดการเติมเวลาใต้แถว tool |

## ติดตั้ง

```
/plugin install tool-timeline-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ป้ายชื่อสั้นของแต่ละ tool
2. กราฟแกนต์บนแกนเวลาเดียวกัน
3. จับเวลาด้วย try/finally รอบ next(e)
4. แต่งแถว ToolUse โดยห่อของเดิม {await next(e)}
5. แต่งบรรทัด TurnDuration และแผง

## หมายเหตุ

เติมเวลาเฉพาะ tool ที่ใช้ตั้งแต่ 1 วินาที เพื่อไม่ให้แชตรก
