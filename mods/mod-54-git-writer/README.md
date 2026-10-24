# Mod 54: Git Writer TH

นักเขียนประจำ Git: อ่าน diff ที่ stage ไว้แล้วเสนอข้อความ commit 3 แบบให้เลือก (Conventional / ไทย / กวีน่ารัก 🎀) กดแล้ว commit ให้, เขียน Pull Request จาก commit ของ branch (title + Summary + Changes + Testing) ถ้ามี GitHub CLI ถามแล้วสร้าง PR ให้ ไม่มีก็คัดลอกให้พร้อมลิงก์หน้าเปิด PR และสรุปงานวันนี้เป็นโพสต์โซเชียล 280 ตัวอักษร

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/gitmsg` | เสนอข้อความ commit 3 แบบ แล้ว commit ให้ |
| `/gitmsg style conventional\|thai\|cute` | สไตล์ข้อความ |
| `/pr [base]` | เขียน PR จาก commit ของ branch นี้ |
| `/tweet [en]` | สรุปงานวันนี้เป็นโพสต์ |

## ติดตั้ง

```
/plugin install git-writer-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เรียก git / gh แบบ argv ล้วน
2. ข้อความ commit + เลือกด้วย $.ui.ask
3. PR: หา base, รวบรวม commit + diff, สร้างหรือคัดลอก
4. โพสต์สรุปงานวันนี้ + $.ui.copy

## หมายเหตุ

การสร้าง PR จะ push branch ขึ้น origin จึงถามก่อนทุกครั้ง ข้อความที่ได้มาจาก Haiku อ่านเฉพาะ diff/commit ของจริง ควรอ่านทวนก่อนใช้
