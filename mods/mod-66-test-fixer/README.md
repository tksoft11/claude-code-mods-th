# Mod 66: Test Fixer TH

วนแก้เทสต์จนผ่าน: Mod รันเทสต์เอง ถ้าไม่ผ่านส่งท้าย output ให้ Claude แก้ "โค้ด" (ห้ามแก้หรือลบเทสต์ให้ผ่านแบบโกง) พอ Claude แก้เสร็จ Mod รันเทสต์ซ้ำเอง วนจนผ่าน มีเบรก: เพดานรอบ (ค่าเริ่มต้น 3), error เหมือนเดิม 2 รอบติดให้หยุด, กด Esc ขัดหรือ /fixtests stop ก็หยุด ไม่ระบุคำสั่งจะเดาจากโปรเจกต์ (npm/pnpm/yarn test, pytest, go test, cargo test)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/fixtests [คำสั่ง]` | เริ่มวนแก้ |
| `/fixtests stop` | หยุด |
| `/fixtests max <n>` | เพดานรอบ 1-10 |
| `/fixtests status` | สถานะ |

## ติดตั้ง

```
/plugin install test-fixer-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เดาคำสั่งเทสต์จากไฟล์ในโปรเจกต์
2. รันเทสต์เองด้วย $.process.run
3. ลายเซ็นของความล้มเหลว กันวนที่เดิม
4. รอ turn.complete แล้วรันรอบถัดไป

## หมายเหตุ

ทดสอบจริงแล้ว: บั๊กคำนวณส่วนลด Claude แก้รอบเดียว Mod รันซ้ำแล้วผ่านครบ 3 เทสต์ คำสั่งเทสต์เป็นของคุณเองจึงรันผ่าน shell
