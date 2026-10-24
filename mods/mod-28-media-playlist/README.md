# Mod 28: Media Playlist TH

จัด playlist หลายชุด เพิ่มเพลงเป็นลิงก์ YouTube/Spotify (ดึงชื่อเพลงให้เองผ่าน oEmbed) หรือไฟล์ในเครื่อง กดเล่นแล้วเปิดด้วยแอปหรือเบราว์เซอร์ของเครื่อง มีถัดไป ย้อนกลับ สุ่ม วนซ้ำ แผง "กำลังเล่น" พร้อมปุ่ม ⏮ ⏭ และส่งออกเป็น .m3u

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/playlist new <ชื่อ>` | สร้าง playlist |
| `/playlist add <ชื่อ> <ลิงก์หรือไฟล์> [ชื่อเพลง]` | เพิ่มเพลง |
| `/playlist show [ชื่อ] / lists` | ดูเพลง / ดูทุก playlist |
| `/playlist play <ชื่อ> [ลำดับ]` | เริ่มเล่น + เปิดแผง |
| `/playlist next / prev / now` | ถัดไป / ย้อนกลับ / ตอนนี้ |
| `/playlist shuffle on\|off / repeat on\|off` | สุ่ม / วนซ้ำ |
| `/playlist remove <ชื่อ> <ลำดับ>` | ลบเพลง |
| `/playlist delete <ชื่อ> confirm` | ลบ playlist |
| `/playlist search <คำค้น>` | เปิดค้นบน YouTube |
| `/playlist export <ชื่อ>` | ส่งออก .m3u |

## ติดตั้ง

```
/plugin install media-playlist-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ดึงชื่อเพลงด้วย oEmbed ของ YouTube และ Spotify
2. เปิดด้วยแอปของเครื่องอย่างปลอดภัย (ส่งผ่าน env)
3. คิวเพลง สุ่มแบบ Fisher-Yates
4. แผงกำลังเล่นพร้อมปุ่ม
5. คำสั่ง /playlist และส่งออก .m3u

## หมายเหตุ

Mod ไม่ได้เล่นเสียงเองและไม่รู้ว่าเพลงจบเมื่อไหร่ จึงกด "ถัดไป" เอง การคุม Spotify จากในนี้ต้องใช้ Spotify Web API + OAuth (และบัญชี Premium) ซึ่งเกินขอบเขตของ Mod นี้
