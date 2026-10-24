# Mod 57: Code Insight TH

เจาะลึกโปรเจกต์จากประวัติ git: แผนที่โฟลเดอร์พร้อมจำนวนไฟล์และคำอธิบายที่ Claude อ่านจากชื่อไฟล์จริง (บันทึกเป็น CODEMAP.md ได้), ใครเขียนส่วนไหนมากสุด, ไฟล์ที่ถูกแก้บ่อยที่สุด (hotspot = จุดที่บั๊กชอบซ่อน) และประวัติของไฟล์

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/insight map [save]` | แผนที่โฟลเดอร์ + คำอธิบาย (save = เขียน CODEMAP.md) |
| `/insight owners [path]` | ใครเขียนส่วนไหนมากสุด |
| `/insight hotspots [เดือน]` | ไฟล์ที่ถูกแก้บ่อยสุด (ค่าเริ่มต้น 6 เดือน) |
| `/insight file <path>` | ประวัติไฟล์ |

## ติดตั้ง

```
/plugin install code-insight-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แผนที่จาก git ls-files ยุบโฟลเดอร์ที่มีลูกเยอะ + คำอธิบายจาก Haiku (จำไว้จนโครงสร้างเปลี่ยน)
2. เจ้าของโค้ดจาก git shortlog
3. hotspot จาก git log --name-only
4. ประวัติไฟล์จาก git log --follow

## หมายเหตุ

ต้องเป็น git repo TODO/FIXME ดูได้ที่ Mod 18 (/pain todos)
