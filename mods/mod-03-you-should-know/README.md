# Mod 03: You Should Know TH

เด้งทิปภาษาไทยตามสิ่งที่คุณกำลังทำ เช่น พิมพ์ path ยาวๆ จะแนะนำให้ใช้ `@`, ใช้ Write ทับไฟล์เดิมจะแนะนำ Edit, tool พลาดสองครั้งติดจะแนะนำ Plan Mode, context เกิน 80% จะแนะนำ `/compact` แต่ละทิปแสดงครั้งเดียวต่อ session

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/tips` | ดูคลังทิปและสถานะ |
| `/tips random` | สุ่มทิป |
| `/tips reset` | ให้แสดงทิปใหม่ทั้งหมด |
| `/tips <id>` | ดูทิปนั้น เช่น /tips plan-mode |

## ติดตั้ง

```
/plugin install you-should-know-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ทำ Mod ที่ "สอน" ผู้ใช้ (ไม่บล็อกอะไร)
2. อ่าน prompt ด้วย `prompt.submit`
3. แยกชนิด tool ด้วย `e.tool === "Write"` แล้ว TypeScript รู้ field ให้เอง
4. ดูผลหลัง `next(e)` (`isError`)
5. อ่าน context ด้วย `$.session.usage()`

## หมายเหตุ

เพิ่มทิปของทีมเองได้ที่ `TIPS` ด้านบนของไฟล์
