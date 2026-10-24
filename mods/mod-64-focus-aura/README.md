# Mod 64: Focus Aura TH

ออร่าโฟกัสสีพาสเทลเหนือช่องพิมพ์ระหว่างที่ Claude ทำงาน บอกว่ากำลังทำเรื่องอะไร (จากบรรทัดแรกของ prompt) และผ่านไปกี่นาที สีไล่ไปมาเป็นจังหวะหายใจเข้า 4 ออก 4 วินาที เสร็จแล้วบอกเวลาที่ใช้ 10 วินาที มี 4 ธีม (sakura ocean matcha lavender)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/aura` | สถานะ |
| `/aura on\|off` | เปิด/ปิด |
| `/aura sakura\|ocean\|matcha\|lavender` | เปลี่ยนธีม |

## ติดตั้ง

```
/plugin install focus-aura-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. จังหวะหายใจ 8 วินาทีต่อรอบ
2. timer เฉพาะตอน Claude ทำงาน
3. ต่อท้ายสิ่งที่วาดเหนือช่องพิมพ์อยู่แล้ว {await next(e)}

## หมายเหตุ

ห่อของเดิมไว้ จึงใช้ร่วมกับ Mod 01 / Mod 44 ที่วาดเหนือช่องพิมพ์ได้
