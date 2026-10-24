# Mod 38: Trend TH

เทรนด์ล่าสุดจากแหล่งข้อมูลจริง: คำค้นมาแรงในไทยจาก Google Trends, ข่าว tech จาก Hacker News, repo ใหม่ที่ได้ดาวเร็วที่สุดบน GitHub, เหรียญคริปโตที่คนค้นมากสุด และบทความ Wikipedia ที่คนอ่านมากสุดเมื่อวาน ติดตามคำที่สนใจแล้วเด้งเตือนเมื่อคำนั้นขึ้นเทรนด์ได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/trend` | สรุปทุกแหล่ง |
| `/trend google [ประเทศ]` | Google Trends (TH, US, JP ...) |
| `/trend hn` | Hacker News |
| `/trend github [วัน] [ภาษา]` | repo ใหม่ดาวพุ่ง |
| `/trend crypto` | คริปโตมาแรง |
| `/trend wiki [th\|en]` | Wikipedia ที่คนอ่านมากสุด |
| `/trend watch <คำ> / unwatch <คำ>` | ติดตามคำ |

## ติดตั้ง

```
/plugin install trend-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน RSS (XML) ของ Google Trends ด้วย regex
2. อ่าน JSON จาก Hacker News, GitHub, CoinGecko, Wikimedia
3. ติดตามคำด้วย timer ทุก 1 ชม.
4. คำสั่ง /trend และดึงหลายแหล่งพร้อมกันโดยแหล่งที่พังไม่ทำให้แหล่งอื่นพังตาม

## หมายเหตุ

GitHub API แบบไม่ใช้ token จำกัดจำนวนครั้งต่อชั่วโมง บทความ Wikipedia ที่คนอ่านมากสุดเป็นข้อมูลดิบจากผู้อ่าน อาจมีหัวข้อที่ไม่เหมาะสม Mod กรองหัวข้อสั้นเกินไปออกแล้วแต่ไม่ได้กรองทั้งหมด
