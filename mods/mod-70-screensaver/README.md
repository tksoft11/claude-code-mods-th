# Mod 70: Screensaver TH

ภาพพักหน้าจอยุค 90 ในแผง 5 ฉาก คำนวณเองทุกเฟรม: ลูกบาศก์ 3D หมุน (cube), บินผ่านดวงดาว (stars), โคมไฟลาวาแบบ metaballs (lava), โลโก้กระดอนแบบ DVD ที่นับครั้งชนมุมพอดี (dvd), หิมะตกแล้วกองพูนที่พื้น (snow) เปิดเองเมื่อไม่มีใครพิมพ์และ Claude ว่าง และปิดเองเมื่อพิมพ์ prompt ใหม่

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/screensaver [ฉาก]` | เปิดเลย: cube stars lava dvd snow (ไม่ระบุ = สุ่ม) |
| `/screensaver idle <นาที>` | เปิดเองเมื่อว่าง (ค่าเริ่มต้น 5, 0 = ไม่เปิดเอง) |
| `/screensaver stop` | ปิด |

## ติดตั้ง

```
/plugin install screensaver-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ลูกบาศก์ 3D: หมุนจุด 8 มุมแล้วฉายลง 2 มิติ
2. บินผ่านดวงดาว: ความลึก z
3. โคมไฟลาวา: metaballs
4. โลโก้กระดอน
5. หิมะ: ตกแล้วกองพูน

## หมายเหตุ

วาดด้วย grid.tsx: บน terminal เป็น Raster (ช่องสีจริง) บน VS Code / Desktop / มือถือ แปลงเป็น SVG ข้อความในภาพเป็นภาษาอังกฤษเพราะสระ/วรรณยุกต์ไทยลง Raster ทีละช่องไม่ได้
