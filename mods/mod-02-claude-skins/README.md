# Mod 02: Claude Skins TH

ธีมไทย 5 แบบ: 🇹🇭 สงกรานต์, 🌕 ลอยกระทง, 🌙 ดาร์กไทย (ค่าเริ่มต้น), 🤍 มินิมอล, 🛍️ ตลาดนัด เลือกแล้วจะสลับธีมหลักของ Claude Code เป็นโหมดมืดหรือสว่างตามธีม และวาดแถบสีของธีมไว้เหนือช่องพิมพ์ ธีมที่เลือกจะจำไว้ข้าม session

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/skin` | ดูรายการธีม |
| `/skin loykrathong` | เปลี่ยนธีม |
| `/skin off` | ซ่อนแถบธีม |
| `/skin-random` | สุ่มธีม |

## ติดตั้ง

```
/plugin install claude-skins-th --marketplace <github-user>/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. นิยามธีมเป็น object
2. เปลี่ยนการตั้งค่าของ Claude Code ด้วย `$.config.set` และรับมือกับ `{ deny }`
3. จำค่าข้าม session ด้วย `$.store`
4. คำสั่งที่มี argument (`e.args`)
5. ใช้สี hex กับ `<Text color>`

## หมายเหตุ

Mod ไม่มี DOM จึงเปลี่ยนสีทุกส่วนของหน้าจอไม่ได้ สิ่งที่ Mod คุมได้คือธีมหลัก (มืด/สว่าง) และสีของสิ่งที่ Mod วาดเอง ถ้าองค์กรล็อกการตั้งค่าธีมไว้ จะขึ้นคำเตือนแทน
