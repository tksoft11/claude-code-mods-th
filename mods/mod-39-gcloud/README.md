# Mod 39: GCloud TH

ดู Google Cloud ผ่าน gcloud CLI: บัญชีที่ login, project ที่เลือก, VM ที่รันอยู่, Cloud Run service, สถานะ billing สลับ project ได้ และมี template คำสั่งที่ใช้บ่อยให้ copy (deploy Cloud Run, สร้าง/หยุด VM, เก็บ secret, ดู log) หรือส่งงานให้ Claude ทำ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/gcloud status` | บัญชี project region |
| `/gcloud projects` | project ทั้งหมด |
| `/gcloud use <project-id>` | สลับ project |
| `/gcloud vms / run / billing` | VM, Cloud Run, billing |
| `/gcloud template [ชื่อ]` | template คำสั่ง |
| `/gcloud ask <งาน>` | ให้ Claude ทำงาน GCP ให้ |

## ติดตั้ง

```
/plugin install gcloud-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เรียก gcloud แล้วอ่านผลเป็น JSON (และเรียกผ่าน cmd /c บน Windows)
2. คำสั่งอ่านอย่างเดียว
3. template คำสั่งที่ใช้บ่อย
4. คำสั่ง /gcloud และตรวจ project id ก่อนส่งให้คำสั่งระบบ

## หมายเหตุ

ต้องติดตั้ง gcloud CLI และ gcloud auth login ก่อน Mod เรียก gcloud เฉพาะคำสั่งอ่าน (ยกเว้น /gcloud use ที่เปลี่ยน project ในเครื่อง) ไม่สร้าง ลบ หรือ deploy เอง เงื่อนไข free tier เปลี่ยนได้ ดูล่าสุดที่ https://cloud.google.com/free
