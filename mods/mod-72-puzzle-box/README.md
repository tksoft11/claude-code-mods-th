# Mod 72: Puzzle Box TH

เกมฝึกสมองในแผง: 2048 (w a s d เลื่อน แผ่นตัวเลขไล่สีแบบต้นฉบับ) และ Minesweeper กู้ระเบิด (w a s d เลื่อนเคอร์เซอร์ j เปิด k ปักธง ตาแรกปลอดภัยเสมอ และเปิดช่องว่างต่อกันอัตโนมัติ) เก็บสถิติ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/puzzle 2048` | เกม 2048 |
| `/puzzle mines` | กู้ระเบิด |
| `/puzzle scores` | สถิติ |

## ติดตั้ง

```
/plugin install puzzle-box-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. 2048: หมุนกระดานให้ทุกทิศเหลือการเลื่อนซ้ายแบบเดียว
2. Minesweeper: วางระเบิดหลังตาแรก + flood fill ด้วยคิว
3. ปุ่มและคำสั่ง

## หมายเหตุ

วาดด้วย grid.tsx: บน terminal เป็น Raster (ช่องสีจริง) บน VS Code / Desktop / มือถือ แปลงเป็น SVG
