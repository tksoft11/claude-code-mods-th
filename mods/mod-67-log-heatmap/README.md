# Mod 67: Log Heatmap TH

แผนที่ความร้อนของ log: แกนเวลา × ระดับ (ERROR แดง, WARN เหลือง, INFO เขียว) ด้วยบล็อก ░▒▓█ ยิ่งเข้มยิ่งเยอะ เห็นทันทีว่าพังช่วงไหน พร้อม error ที่เจอบ่อยสุด 5 แบบ (ตัดตัวเลข/id ก่อนจัดกลุ่ม) อ่านจากไฟล์ log หรือ docker logs ก็ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/heatmap <ไฟล์.log>` | แผนที่ความร้อนจากไฟล์ log |
| `/heatmap docker <container>` | จาก docker logs |

## ติดตั้ง

```
/plugin install log-heatmap-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านเวลา (ISO, Apache, syslog) และระดับจากแต่ละบรรทัด
2. แบ่งช่วงเวลาให้พอดีความกว้าง
3. แหล่ง log: ไฟล์ หรือ docker logs
4. แผง heatmap สีตามระดับ

## หมายเหตุ

ดัดแปลงจากไอเดีย flamegraph-log เพราะ Claude Code ไม่มี component LogLine ให้แต่ง จึงทำเป็นแผงแทน ไฟล์ใหญ่กว่า 5 MB ใช้เฉพาะส่วนท้าย
