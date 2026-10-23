# Mod 10: File Manager TH

จัดการไฟล์ด้วยคำสั่ง `/fm` ครบชุด: ดู อ่าน สร้าง ย้าย ก็อป ค้นหา `rm` จะย้ายเข้าถังขยะ `.fm-trash/` ก่อนเสมอ กู้คืนได้ ไฟล์สำคัญ (`.env`, `package.json`, `.git`, `CLAUDE.md`) ลบด้วย `rm` ธรรมดาไม่ได้ ใช้ได้ทั้ง Windows และ macOS/Linux

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/fm help` | ดูคำสั่งทั้งหมด |
| `/fm ls [path]` | ดูไฟล์ |
| `/fm cat <ไฟล์>` | อ่านไฟล์ |
| `/fm touch / mkdir` | สร้างไฟล์ / โฟลเดอร์ |
| `/fm mv / cp` | ย้าย / ก็อป |
| `/fm rm <ไฟล์>` | ลบเข้าถังขยะ |
| `/fm rm! <ไฟล์>` | ลบถาวร |
| `/fm trash / restore <ชื่อ> / empty-trash` | ถังขยะ |
| `/fm find / grep / ext` | ค้นหาตามชื่อ / เนื้อหา / นามสกุล |
| `/fm backup <ไฟล์>` | สำรองเป็น .bak-วันที่ |
| `/fm fav [ไฟล์]` | ไฟล์โปรด |
| `/fm history / stats` | ประวัติ / สถิติ |

## ติดตั้ง

```
/plugin install file-manager-th --marketplace <github-user>/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน เขียน และ list ไฟล์ด้วย `$.fs`
2. ย้าย ก็อป และลบด้วย `$.process.run` โดยส่ง path ผ่าน env (`FM_SRC`, `FM_DST`) กัน command injection และชื่อไฟล์ที่มีช่องว่าง
3. รองรับ Windows (PowerShell) และ macOS/Linux (`sh`)
4. เดินดูทั้งโปรเจกต์แบบจำกัดจำนวน (ข้าม `node_modules`, `.git`)

## หมายเหตุ

ชื่อที่มีช่องว่างให้ใส่ในเครื่องหมายคำพูด เช่น `/fm mv "old name.txt" new.txt`
