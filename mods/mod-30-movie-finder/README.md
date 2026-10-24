# Mod 30: Movie Finder TH

ค้นหนังจาก Wikipedia (ไทยและอังกฤษ) และซีรีส์จาก TVmaze (แนว คะแนน ช่อง) ดูเรื่องย่อ เปิดหน้าค้นหาบน Netflix, YouTube, Disney+, Prime Video หรือ Apple TV ดูตัวอย่างหนัง ทำ watchlist บันทึกเรื่องที่ดูแล้วพร้อมให้คะแนน และให้ Claude แนะนำเรื่องต่อไปจากเรื่องที่ชอบ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/movie search <ชื่อ>` | ค้นหนัง |
| `/movie series <ชื่อ>` | ค้นซีรีส์ |
| `/movie info <ชื่อเรื่อง>` | เรื่องย่อ |
| `/movie watch <ชื่อ> [netflix\|youtube\|disney\|prime\|apple]` | เปิดหน้าค้นหาบนแพลตฟอร์ม |
| `/movie trailer <ชื่อ>` | ค้นตัวอย่างบน YouTube |
| `/movie add / remove / list` | watchlist |
| `/movie watched <ชื่อ> [1-10]` | บันทึกว่าดูแล้ว + คะแนน |
| `/movie history` | ประวัติ |
| `/movie recommend` | ให้ Claude แนะนำ |

## ติดตั้ง

```
/plugin install movie-finder-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ค้นหนังจาก Wikipedia และกรองเฉพาะภาพยนตร์ (รองรับปี พ.ศ.)
2. ค้นซีรีส์จาก TVmaze
3. เปิดเว็บด้วยเบราว์เซอร์ของเครื่องอย่างปลอดภัย
4. คำสั่ง /movie, watchlist และขอคำแนะนำจาก Claude

## หมายเหตุ

Mod เล่นวิดีโอเองไม่ได้ และไม่รู้ว่าเรื่องไหนมีบนแพลตฟอร์มไหนในไทย (ไม่มี API สาธารณะ) จึงเปิดหน้าค้นหาของแพลตฟอร์มนั้นให้ ต้องมีบัญชีของแพลตฟอร์มเอง
