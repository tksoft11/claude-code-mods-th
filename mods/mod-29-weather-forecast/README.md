# Mod 29: Weather Forecast TH

พยากรณ์อากาศจริงจาก Open-Meteo: อากาศตอนนี้ (อุณหภูมิ รู้สึกเหมือน ความชื้น ลม UV), PM2.5 และ AQI, รายชั่วโมง 12 ชม. และรายวัน 7 วันพร้อมโอกาสฝน ค้นเมืองได้ทั้งภาษาไทยและอังกฤษ ตั้งเมืองหลักและเมืองโปรด และเตือนเมื่อฝนน่าจะตกใน 2 ชม. ข้างหน้า

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/weather [เมือง]` | อากาศตอนนี้ (ไม่ใส่ = เมืองหลัก) |
| `/weather hourly [เมือง]` | รายชั่วโมง 12 ชม. |
| `/weather week [เมือง]` | 7 วัน |
| `/weather home <เมือง>` | ตั้งเมืองหลัก + เปิดแผง |
| `/weather fav add\|remove <เมือง> / fav` | เมืองโปรด |
| `/weather alert on\|off` | เตือนฝนที่เมืองหลัก (เช็คทุก 30 นาที) |

## ติดตั้ง

```
/plugin install weather-forecast-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แปลงรหัสสภาพอากาศ WMO เป็นข้อความไทย + emoji และแปล AQI/UV
2. เรียก geocoding, forecast และ air quality ของ Open-Meteo พร้อมกัน
3. จัดรูปแบบรายชั่วโมงและรายวัน
4. เตือนฝนด้วย $.clock.every และกันเตือนซ้ำ
5. แผงอากาศเมืองหลัก

## หมายเหตุ

ข้อมูลจาก Open-Meteo ฟรีสำหรับใช้งานส่วนตัว (ไม่ต้องใช้ key) การเตือนฝนทำงานเฉพาะตอนเปิด Claude Code อยู่
