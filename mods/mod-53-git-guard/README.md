# Mod 53: Git Guard TH

ยามเฝ้า Git และไฟล์ในโปรเจกต์: ก่อน Claude รัน git reset --hard / checkout . / restore / clean -f ตอนมีงานค้าง จะถามพร้อมทางเลือก "เก็บเข้า stash ก่อน", git push --force เสนอเปลี่ยนเป็น --force-with-lease, branch -D และ stash drop ต้องยืนยัน, rm ไฟล์ในโปรเจกต์จะสำรองไว้ใน .claude-backup/ ก่อน (ข้าม node_modules, dist), ตรวจ Conventional Commits ได้ และสลับ branch อย่างปลอดภัย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/gitguard` | สถานะ + stash ที่ Git Guard เก็บให้ |
| `/gitguard pause <นาที>` | พักการเฝ้าชั่วคราว |
| `/gitguard guard on\|off` | ถามก่อนคำสั่ง git อันตราย (ค่าเริ่มต้น: เปิด) |
| `/gitguard backup on\|off` | สำรองก่อน rm (ค่าเริ่มต้น: เปิด) |
| `/gitguard convention on\|off` | บังคับ Conventional Commits (ค่าเริ่มต้น: ปิด) |
| `/gswitch <branch> [new]` | สลับ branch โดยถามเรื่องงานค้างก่อน |

## ติดตั้ง

```
/plugin install git-guard-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แยกแยะคำสั่ง git อันตราย และอ่านข้อความ commit (รวม heredoc)
2. เรียก git / คัดลอกไฟล์ผ่าน $.process.run
3. ถามผ่าน $.ui.ask: ไม่มีคนตอบ = ไม่อนุญาต
4. ด่านตรวจหน้า Bash
5. /gswitch

## หมายเหตุ

ถ้าไม่มีใครตอบได้ (เช่น claude -p) คำสั่งที่ทำให้งานหายจะถูกปฏิเสธไว้ก่อน โฟลเดอร์ .claude-backup/ มี .gitignore ของตัวเองจึงไม่ถูก commit Mod 15 บล็อกคำสั่งทำลายระบบ ส่วน Mod นี้ดูแลงานในโปรเจกต์
