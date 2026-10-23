# Mod 15: Cyber Guard TH

ยามความปลอดภัยของโปรเจกต์ บล็อกคำสั่ง Bash ที่ทำลายระบบก่อน Claude จะรันจริง (เช่น `rm -rf /`, fork bomb, `mkfs`, `curl ... | sh`) เตือนเมื่อ Claude เขียน secret ลงในโค้ด และสแกนทั้งโปรเจกต์หา API key ที่หลุด โค้ดเสี่ยงโดนโจมตี (eval, SQL ต่อสตริง, innerHTML) และ package.json ที่น่าสงสัย (install script แปลกๆ, ชื่อแพ็กเกจคล้ายของดัง) รวมถึงไฟล์ลับที่ถูก commit เข้า git

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/guard scan [path]` | สแกนทั้งหมด: secret, โค้ดเสี่ยง, package.json, git |
| `/guard secrets` / `code` / `deps` | สแกนเฉพาะเรื่อง |
| `/guard git` | ตรวจไฟล์ลับใน git และ `.gitignore` |
| `/guard report` / `critical` | ดูรายงานล่าสุด / เฉพาะระดับร้ายแรง |
| `/guard export` | บันทึก `cyber-guard-report.json` (ซ่อนค่า secret แล้ว) |
| `/guard watch <ไฟล์>` / `unwatch <ไฟล์>` | เฝ้าไฟล์สำคัญ ถ้า Claude จะแก้จะเด้งเตือน |
| `/guard bash on\|off` | เปิด/ปิดการบล็อกคำสั่ง Bash อันตราย (ค่าเริ่มต้น: เปิด) |
| `/guard test <คำสั่ง>` | ลองดูว่าคำสั่งนี้จะถูกบล็อกไหม (ไม่รันจริง) |

## ติดตั้ง

```
/plugin install cyber-guard-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. regex ของ secret แต่ละเจ้า (AWS, GitHub, Anthropic, OpenAI, Stripe, Google, Slack, private key)
2. regex ของโค้ดเสี่ยงและรูปแบบมัลแวร์
3. รายการคำสั่ง Bash ที่ทำลายระบบ
4. ตรวจ package.json: install script และ typosquatting ด้วย Levenshtein distance
5. เดินสแกนไฟล์ทั้งโปรเจกต์ด้วย `$.fs`
6. ตรวจไฟล์ลับใน git ด้วย `$.process.run(['git', 'ls-files'])`
7. คำนวณ Risk Score และทำรายงาน
8. ทำด่านกั้น (guard) ที่ถูกต้อง: ตัดสินก่อน `next`, ตอบ `{ deny }` และมี `.catch` ไว้ ถ้าตัวตรวจพังจะปฏิเสธไว้ก่อน
9. ส่ง `context` บอก Claude เมื่อเขียน secret ลงไฟล์

## หมายเหตุ

- ตรวจด้วย regex จึงอาจจับผิดหรือหลุดได้ ใช้เป็นด่านแรก ไม่ใช่ตัวแทนของเครื่องมือ security เต็มรูปแบบ
- การบล็อก Bash เป็นด่านเพิ่มเติม Claude Code ยังถามอนุญาตก่อนรันคำสั่งตามปกติ
- ค่า secret ที่เจอจะแสดงแค่ 4 ตัวแรกเสมอ ทั้งในรายงานและไฟล์ export
