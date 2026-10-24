# Mod 100: Activity Calendar TH

🎉 Mod ตัวที่ 100 · ปฏิทินกิจกรรมแบบ GitHub contribution ข้ามทุก session: นับรายวันว่าส่ง prompt กี่ครั้ง ใช้ tool เท่าไหร่ แก้ไฟล์กี่ครั้ง Claude ทำงานกี่นาที เสียเงินเท่าไหร่ แล้ววาดตาราง 26 สัปดาห์ สีเขียวเข้มตามความขยัน พร้อม streak วันติดกัน และวันที่ขยันที่สุด

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/calendar` | เปิดปฏิทินกิจกรรม |
| `/calendar prompts\|tools\|edits\|minutes\|cost` | เลือกสิ่งที่นับ |

## ติดตั้ง

```
/plugin install activity-calendar-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. นับลงวันนี้จากหลาย event
2. ตารางและสถิติ (streak, ยาวสุด, วันที่ขยันที่สุด)
3. เก็บตัวเลขจาก prompt.submit, tool.call, turn, session.measure
4. วาดตาราง 7 แถว × 26 สัปดาห์

## หมายเหตุ

เก็บใน `$.store` ของ mod นับเฉพาะเครื่องนี้
