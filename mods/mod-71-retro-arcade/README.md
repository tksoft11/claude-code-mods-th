# Mod 71: Retro Arcade TH

ตู้เกมยุค 80 ในแผง: Pong สู้กับ AI ถึง 5 แต้ม (w/s), Breakout ทุบอิฐสีรุ้ง มี 3 ชีวิต (a/d ขยับ w ปล่อยลูก), Flappy นกกระพือปีกลอดช่องท่อ (w) เก็บสถิติสูงสุด กด p หยุด r เริ่มใหม่

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/arcade-play pong` | ปิงปองกับ AI |
| `/arcade-play breakout` | ทุบอิฐ |
| `/arcade-play flappy` | นกกระพือปีก |
| `/arcade-play scores` | สถิติสูงสุด |

## ติดตั้ง

```
/plugin install retro-arcade-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ฟิสิกส์ของแต่ละเกม (game loop ทุก 70ms)
2. วาดสนาม
3. ปุ่มควบคุมด้วย Button ที่มี hotkey

## หมายเหตุ

วาดด้วย grid.tsx: บน terminal เป็น Raster (ช่องสีจริง) บน VS Code / Desktop / มือถือ แปลงเป็น SVG ปุ่มใช้ได้เมื่อแผงได้โฟกัส (คลิกที่แผง) ใช้ชื่อ /arcade-play เพราะ /arcade เป็นของ Mod 59
