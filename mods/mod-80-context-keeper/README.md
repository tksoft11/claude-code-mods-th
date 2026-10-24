# Mod 80: Context Keeper TH

เฝ้า context และ prompt cache: แถบเหนือช่องพิมพ์บอกว่า context ใช้ไปกี่ % และ prompt cache จะเย็นในอีกกี่นาที (ส่งข้อความตอน cache เย็นจะแพงกว่า) เมื่อ context เกิน 70% จะแนะนำให้ compact ตอนงานจบช่วง และเขียน "บันทึกส่งต่องาน" ลง `.claude/handoff.md` เพื่อ /clear แล้วเริ่ม session ใหม่ที่รู้งานเดิมได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/ctx` | ดู context และเวลา cache |
| `/ctx compact [สิ่งที่ต้องเก็บ]` | compact ทันที บอกได้ว่าให้เก็บอะไรไว้ |
| `/ctx handoff` | เขียนบันทึกส่งต่องานลง `.claude/handoff.md` |
| `/ctx resume` | ใส่บันทึกส่งต่องานลงช่องพิมพ์ (ใช้หลัง `/clear`) |
| `/ctx auto on\|off` | เขียน handoff ให้เองเมื่อถึง 85% |
| `/ctx warn 70 85` | ตั้งเกณฑ์เตือนและเกณฑ์ handoff |
| `/ctx ttl 5\|60` | อายุ prompt cache เป็นนาที |
| `/ctx band on\|off` | แถบเหนือช่องพิมพ์ |

## ติดตั้ง

```
/plugin install context-keeper-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. สีและหลอดตามระดับ context
2. นาฬิกา cache นับถอยหลังด้วย `$.clock.every`
3. เขียนบันทึกส่งต่องานด้วย `$.model.fork` (อ่าน transcript เดิมจาก cache)
4. ตรวจเกณฑ์ตอนจบ turn
5. รับตัวเลขจาก `session.measure` และดู `turn.start` / `turn.complete`
6. แถบเหนือช่องพิมพ์
7. คำสั่ง /ctx กับ `$.session.compact` และ `$.prompt.fill`

## หมายเหตุ

ตัวเลข context มีหลังคำตอบแรกของ session เวลา cache เป็นการประมาณจากคำตอบล่าสุด ค่าเริ่มต้น 5 นาที ถ้าใช้ cache แบบ 1 ชั่วโมงให้ตั้ง `/ctx ttl 60`
