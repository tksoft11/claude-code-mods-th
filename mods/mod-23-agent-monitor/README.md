# Mod 23: Agent Monitor TH

Task Manager ของ subagent เวลา Claude แตกงานให้ agent หลายตัวพร้อมกัน แผงด้านข้างจะแสดงทุกตัว (รวมงานหลัก) แบบสดๆ ว่ากำลังทำอะไร ใช้ tool ไปกี่ครั้ง ล้มเหลวกี่ครั้ง กิน token เท่าไหร่ และใช้เวลานานแค่ไหน ดู log ของแต่ละตัวและหยุดตัวที่ทำงานนานเกินได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/agentmon` | รายการ agent + เปิดแผง |
| `/agentmon log <id>` | tool ที่ agent นั้นเรียกล่าสุด (ใช้ id 8 ตัวแรกได้) |
| `/agentmon stop <id>` | หยุดงานรอบปัจจุบันของ agent |
| `/agentmon stats` | สรุปรวมทั้ง session |
| `/agentmon clear` | ล้างสถิติ |

## ติดตั้ง

```
/plugin install agent-monitor-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เก็บสถิติแยกตาม agent ด้วย e.agentId ที่มากับทุก event
2. รวมสถานะจริงจาก $.agent.list() กับสถิติที่เก็บเอง และจำ agent ที่จบไปแล้ว
3. ฟัง turn.start, tool.call และ turn.complete ของทุก agent
4. แผง Task Manager
5. หยุด agent ด้วย $.turn.abort

## หมายเหตุ

ใช้ชื่อ /agentmon เพราะ /agents เป็นคำสั่งเดิมของ Claude Code สถิติเริ่มนับตั้งแต่ Mod โหลด
