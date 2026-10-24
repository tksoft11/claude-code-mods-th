# Mod 99: Thai News TH

ข่าวไทยล่าสุดเหนือช่องพิมพ์: ดึงหัวข้อข่าวจาก Google News ภาษาไทยทุก 15 นาที แถบหมุนเปลี่ยนข่าวทุก 30 วินาที พร้อมชื่อสำนักข่าวและเวลา เลือกหมวดได้ และให้ Claude สรุปข่าวเด่นให้ฟังได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/news` | เปิดแผงข่าว 15 ข่าว พร้อมลิงก์อ่านต่อ |
| `/news <หมวด>` | `top` `tech` `business` `nation` `world` `sports` `entertainment` `science` `health` |
| `/news band on\|off` | แถบข่าวเหนือช่องพิมพ์ |
| `/news ask` | ให้ Claude สรุปข่าวเด่น 5 ประเด็น |

## ติดตั้ง

```
/plugin install thai-news-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน RSS ด้วย regex (mod ไม่มี DOM)
2. ตั้งเวลาดึงข่าวใหม่และหมุนหัวข้อ
3. แถบข่าวและแผงที่มี `Link`

## หมายเหตุ

ข่าวมาจาก Google News RSS ภาษาไทย ไม่ต้องใช้ API key
