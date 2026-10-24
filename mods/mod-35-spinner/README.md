# Mod 35: Spinner TH

เปลี่ยนตัวหมุน (spinner) ที่แสดงตอน Claude กำลังทำงานได้จริง 20 แบบใน 5 กลุ่ม รวมแบบไทย (ตุ๊กตุ๊กวิ่ง ดอกบัวบาน กาแฟหยด สวัสดีครับ) เปลี่ยนคำกริยาเป็นภาษาไทยขำๆ ได้ (กำลังต้มยำ กำลังตำส้มตำ ...) ปรับความเร็ว หรือปิดกลับเป็นของเดิม

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/spinner` | ดูทุกแบบ |
| `/spinner use <id>` | เปลี่ยนแบบ เช่น tuktuk lotus moon |
| `/spinner random` | สุ่มแบบ |
| `/spinner thai on\|off` | ใช้คำกริยาไทย |
| `/spinner speed <ms>` | ความเร็ว 60-400 ms ต่อเฟรม |
| `/spinner off` | กลับไปใช้ของเดิม |

## ติดตั้ง

```
/plugin install spinner-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. นิยาม spinner เป็นชุดเฟรม
2. ทำให้ขยับด้วย timer ที่เปิดเฉพาะตอน Claude ทำงาน
3. วาด component Spinner ใหม่ (และให้ข้อความพิเศษอย่างรออนุญาตยังแสดงตามเดิม)
4. คำสั่ง /spinner

## หมายเหตุ

บางแบบใช้ emoji ซึ่งความกว้างอาจไม่เท่ากันในบาง terminal
