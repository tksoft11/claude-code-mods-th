# Mod 101: Micro Compaction TH

compact แบบไม่เรียก model: `/compact` ปกติให้ model อ่านทั้งบทสนทนาแล้วเขียนสรุปใหม่ ทั้งเสียเงิน เสียเวลา และรายละเอียดหาย แต่ส่วนที่ทำให้ context บวมจริงๆ คือผลของ Read ไฟล์ยาวๆ ที่อ่านไปนานแล้ว Mod นี้ตัดผลของ Read เก่าออก เหลือป้ายบอกว่าเคยอ่านไฟล์ไหน กี่บรรทัด และตัด thinking ของรอบเก่าทิ้ง โครงบทสนทนายังอยู่ครบ (ทุกคำสั่ง ทุกคำตอบ ทุก tool call) เสร็จในเสี้ยววินาทีและไม่เสีย token ข้อความ 8 อันล่าสุดไม่แตะ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/compact micro` | ตัดผล Read เก่าและ thinking (ไม่เรียก model) |
| `/micro` | เหมือนกัน |
| `/micro all` | ตัดผลยาวของ Bash, Grep, Glob, WebFetch ด้วย |
| `/micro last` | ผลครั้งล่าสุด |

## ติดตั้ง

```
/plugin install micro-compaction-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ตัดสินว่าผลของ tool ไหนควรตัด
2. สร้างบทสนทนาใหม่: ข้อความที่มี `handle` คือของเดิม ข้อความที่ไม่มีคือประกอบใหม่ (ไม่มี thinking)
3. ตอบผลของ `session.compact` เองโดยไม่เรียก `next` (core และ model ไม่ได้รันเลย)

## หมายเหตุ

ทดสอบจริงแล้ว: context ลดจาก 40,853 เหลือ 5,129 tokens ใน 47 ms ถ้า Claude ต้องใช้เนื้อไฟล์อีกก็อ่านใหม่ได้ (ไฟล์อาจเปลี่ยนไปแล้วด้วย อ่านใหม่ยิ่งถูก)
