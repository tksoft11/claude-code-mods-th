# Mod 07: Reflect TH

เก็บ work log ของทุก tool ที่ Claude เรียก แล้วสรุปเป็นรายงานทบทวนงาน: ใช้เวลาเท่าไหร่ สำเร็จกี่เปอร์เซ็นต์ แตะกี่ไฟล์ ใช้ tool ไหนเยอะสุด พร้อมคำแนะนำอัตโนมัติและคำถามทบทวน ถ้า tool ล้มเหลว 3 ใน 5 ครั้งล่าสุดจะเด้งเตือน

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/reflect` | ดูรายงาน |
| `/reflect stats` | สถิติสั้นๆ |
| `/reflect feedback <ข้อความ>` | จดบทเรียน (จำข้าม session) |
| `/reflect save` | บันทึกเป็น REFLECT-YYYY-MM-DD.md |

## ติดตั้ง

```
/plugin install reflect-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เก็บ log ก่อน `next` แล้วอัปเดตผลหลัง `next`
2. วิเคราะห์ log ด้วย Map/Set
3. จำ feedback ด้วย `$.store`
4. เขียนไฟล์ด้วย `$.fs.write`

## หมายเหตุ

work log อยู่ในหน่วยความจำ จะเริ่มใหม่เมื่อเปิด session ใหม่หรือ Mod ถูกโหลดใหม่
