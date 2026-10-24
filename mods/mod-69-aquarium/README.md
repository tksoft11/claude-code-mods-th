# Mod 69: Aquarium TH

ตู้ปลาในแผงข้างแชต: ปลา 5 พันธุ์หลายสีว่ายไปมา ฟองอากาศลอยขึ้น สาหร่ายโยกตามน้ำ น้ำไล่สีตามความลึก โรยอาหารแล้วปลาว่ายเข้ามากิน เพิ่มปลาได้ (จำจำนวนข้าม session) และโหมดกลางคืน

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/aquarium` | เปิดตู้ปลา |
| `/aquarium feed` | โรยอาหาร |
| `/aquarium add [จำนวน]` | เพิ่มปลา |
| `/aquarium night\|day` | ปิด/เปิดไฟตู้ |
| `/aquarium stop` | ปิด |

## ติดตั้ง

```
/plugin install aquarium-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ขยับทุกอย่างหนึ่งจังหวะ: ปลา อาหาร ฟอง
2. วาดตู้: น้ำไล่สี ทราย สาหร่าย

## หมายเหตุ

วาดด้วย grid.tsx: บน terminal เป็น Raster (ช่องสีจริง) บน VS Code / Desktop / มือถือ แปลงเป็น SVG
