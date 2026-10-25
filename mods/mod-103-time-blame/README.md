# Mod 103: Time Blame TH

งานช้าเพราะอะไร: แบ่งเวลาของทุกรอบเป็น 🤖 Claude คิด · 🔧 tool รันจริง · 👥 subagent · 🙋 รอคุณกดอนุญาตหรือตอบคำถาม · ⋯ อื่นๆ รอบที่นานเกิน 15 วินาทีพิมพ์บรรทัดสรุปลงบทสนทนา พร้อมบอกว่า tool ไหนกินเวลาที่สุด และ `/blame` ออกใบสรุปทั้ง session พร้อมคำแนะนำว่าควรแก้ตรงไหน

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/blame` | ใบสรุปเวลาทั้ง session |
| `/blame on\|off` | สรุปท้ายรอบที่นาน |
| `/blame min 15` | สรุปเฉพาะรอบที่นานเกินกี่วินาที |

## ติดตั้ง

```
/plugin install time-blame-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. รวมช่วงเวลาที่ซ้อนกัน ให้แต่ละช่วงนับให้กองเดียว
2. จับเวลาคิดของ Claude ด้วย `turn.step` (async generator + `try/finally`)
3. จับเวลา tool แล้วแยกเวลารออนุญาตออก ด้วย `duration_ms` ของ `classic.PostToolUse` และ `classic.PermissionRequest`
4. จบรอบแล้วสรุปลงบทสนทนา

## หมายเหตุ

เวลาที่ซ้อนกัน (tool หลายตัวรันพร้อมกัน) นับครั้งเดียว ตามลำดับ คุณ > subagent > tool > Claude
