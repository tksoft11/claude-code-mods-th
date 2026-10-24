# Mod 18: Dev Painkiller TH

แก้ปัญหาที่ Dev เจอทุกวันด้วยคำสั่งเดียว: พอร์ตชน ("Port 3000 is already in use"), `.env` หายหรือไม่ครบ, `console.log` ที่ลืมลบ, TODO ที่ค้าง, ไฟล์ใหญ่ที่หลุดเข้า git, branch ที่ merge แล้วแต่ยังไม่ลบ, merge conflict ค้าง และ cache ของ build ที่บวม ทุกคำสั่งที่ลบหรือปิดอะไรจะแสดงให้ดูก่อน แล้วทำจริงเมื่อพิมพ์ `confirm` ต่อท้ายเท่านั้น

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/pain scan` | สแกนทุกอย่างในครั้งเดียว |
| `/pain ports` | พอร์ต dev ที่ถูกใช้ และโปรแกรมที่ใช้อยู่ |
| `/pain kill 3000` | ดูว่าโปรแกรมไหนใช้พอร์ต 3000 |
| `/pain kill 3000 confirm` | ปิดโปรแกรมนั้นจริง |
| `/pain env` / `env fix` | ตรวจ `.env` / สร้าง `.env` จาก `.env.example` และเพิ่ม `.env` ใน `.gitignore` |
| `/pain logs` / `logs fix` | หา `console.log` และ `debugger` / ให้ Claude ช่วยลบ (ขออนุญาตก่อนแก้ทุกไฟล์) |
| `/pain todos` | หา TODO FIXME HACK XXX |
| `/pain todos rank` | ให้ Claude จัดลำดับความสำคัญของ TODO (สูง/กลาง/ต่ำ) |
| `/pain deps` | แพ็กเกจ npm ที่ตกรุ่น แยกตัวที่ข้ามเวอร์ชันหลัก (เช็คเองสัปดาห์ละครั้งตอนเปิด Claude Code) |
| `/pain git` | ไฟล์ใหญ่กว่า 5 MB ใน git, branch ที่ merge แล้ว, conflict ค้าง |
| `/pain clean` / `clean confirm` | ดูรายการ cache ที่ลบได้ / ลบจริง |
| `/pain report` | ผลสแกนล่าสุด |

## ติดตั้ง

```
/plugin install dev-painkiller-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. หาพอร์ตที่ถูกใช้ข้ามระบบ: `netstat` บน Windows, `lsof` หรือ `ss` บน macOS/Linux และหาชื่อโปรแกรมจาก PID
2. เดินอ่านไฟล์โค้ดเพื่อหา pattern (ข้ามไฟล์ test และ script)
3. เทียบชื่อตัวแปรใน `.env` กับ `.env.example` โดยไม่แสดงค่า
4. ตรวจ git ด้วย `$.process.run(['git', ...])`
5. ลบ cache อย่างปลอดภัย: ส่ง path ผ่าน env ไม่ต่อเข้าสตริงคำสั่ง
6. คำสั่งที่ต้องยืนยันด้วย `confirm` และส่งงานแก้ไฟล์ให้ Claude ด้วย `$.prompt.submit`

## หมายเหตุ

- ตรวจเฉพาะพอร์ต dev ยอดนิยม: 3000, 3001, 4200, 5000, 5173, 5432, 6379, 8000, 8080, 8888, 9000
- ก่อน `kill` ให้ดูชื่อโปรแกรมให้ดี พอร์ต 5432 / 6379 มักเป็นฐานข้อมูล (PostgreSQL / Redis) ที่ไม่ควรปิด
- `env fix` ไม่เขียนทับ `.env` ที่มีอยู่แล้ว
