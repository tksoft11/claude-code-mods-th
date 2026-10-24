# Mod 77: System Monitor TH

กราฟชีพจรเครื่องแบบสด: CPU และ RAM ย้อนหลัง 2 นาที (อ่านทุก 3 วินาที) สีไล่จากเขียวถึงแดงตามความหนัก โปรแกรมที่กินแรมมากสุด 5 อันดับ และเตือนเมื่อ CPU เกิน 90% นาน 30 วินาที หรือ RAM เกิน 90%

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/sysmon` | เปิดกราฟ |
| `/sysmon stop` | ปิด |

## ติดตั้ง

```
/plugin install system-monitor-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านค่าตามระบบ: Windows (PowerShell เปิดค้างไว้ อ่านผ่าน $.process.spawn), Linux (/proc), macOS (top)
2. กราฟพื้นที่ด้วยบล็อกครึ่งระดับ ▁▂▃▄▅▆▇█

## หมายเหตุ

วาดด้วย grid.tsx: บน terminal เป็น Raster (ช่องสีจริง) บน VS Code / Desktop / มือถือ แปลงเป็น SVG อ่านค่าเฉพาะตอนแผงเปิด ปิดแผงแล้วโปรเซสที่อ่านค่าถูกปิดตาม
