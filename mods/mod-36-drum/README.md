# Mod 36: Drum TH

กลองชุด 8 ชิ้นในแผงข้าง Claude Code ตีด้วยปุ่มคีย์บอร์ด (k กระเดื่อง, s สแนร์, h ไฮแฮท, o ไฮแฮทเปิด, t ทอมสูง, l ทอมต่ำ, c ปรบมือ, x แฉ) อัดจังหวะแล้วเล่นซ้ำตรงเวลา และมี beat สำเร็จรูป (rock pop funk hiphop ลูกทุ่ง) แบบ step sequencer ปรับ BPM ได้ เสียงในโฟลเดอร์ sounds/ สังเคราะห์ขึ้นเองทั้งหมด

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/drum` | เปิดแผงกลอง |
| `/drum rec / stop` | อัด / หยุด |
| `/drum play [loop]` | เล่นสิ่งที่อัดไว้ |
| `/drum beat <ชื่อ> [bpm]` | beat สำเร็จรูป |
| `/drum hit <ชื่อเสียง...>` | ตีจากคำสั่ง |
| `/drum sound engine|system` | เลือกวิธีเล่นเสียง |

## ติดตั้ง

```
/plugin install drum-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. beat แบบ 16 ช่อง
2. เล่นเสียงข้ามระบบ ($.audio.play หรือ PowerShell/aplay)
3. step sequencer และเล่นซ้ำด้วย $.clock.after
4. แผงกลองพร้อมปุ่ม hotkey
5. คำสั่ง /drum

## หมายเหตุ

บน Windows เล่นเสียงผ่าน PowerShell ทุกครั้งที่ตีจะช้าไปเล็กน้อย (เพราะต้องเปิดโปรแกรมใหม่) ถ้าไม่มีเสียงให้ลอง /drum sound engine แผงต้องถูกโฟกัสอยู่ ปุ่มคีย์บอร์ดถึงจะใช้ได้
