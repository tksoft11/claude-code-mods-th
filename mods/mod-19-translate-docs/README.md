# Mod 19: Translate & Docs TH

ใช้ Claude แปลข้อความ ไฟล์ทั้งไฟล์ เฉพาะคอมเมนต์ในโค้ด (โค้ดไม่เปลี่ยน) และไฟล์ภาษา i18n แบบ JSON หลายภาษาในครั้งเดียว (ตรวจว่า key ครบเท่าต้นฉบับ) สร้าง API.md จาก `export` และ JSDoc ในโค้ด และให้ Claude ร่าง README จากโครงสร้างโปรเจกต์ ทุกคำสั่งจะสร้างเป็นไฟล์ใหม่ ไม่เขียนทับไฟล์เดิม

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/translate <ข้อความ>` | ไทย → อังกฤษ, ภาษาอื่น → ไทย |
| `/translate to ja <ข้อความ>` | แปลเป็นภาษาที่เลือก |
| `/translate file README.md en` | แปลทั้งไฟล์ → `README.en.md` |
| `/translate comments src/app.ts en` | แปลเฉพาะคอมเมนต์ → `src/app.en.ts` |
| `/translate i18n locales/th.json en ja` | แปลไฟล์ภาษา → `locales/en.json`, `locales/ja.json` |
| `/docgen api [โฟลเดอร์]` | สร้าง `API.md` จาก export + JSDoc (ไม่ใช้ AI) |
| `/docgen readme` | ให้ Claude ร่าง `README.generated.md` |
| `/docgen usage` | token ที่ใช้ไปใน session นี้ |
| `/translate live on\|off` | ล่ามสด: คำตอบภาษาอังกฤษของ Claude มีคำแปลไทยต่อท้ายให้อ่านอัตโนมัติ (ใช้ token เพิ่ม) |

ภาษาที่รองรับ: `th` `en` `ja` `zh` `ko` `vi` `lo` `my` `km` `ms` `id` `fr` `de` `es`

## ติดตั้ง

```
/plugin install translate-docs-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เรียก model ด้วย `$.model.complete` และถ้า model ที่ขอใช้ไม่ได้ จะลองใหม่ด้วย model ของ session
2. แปลไฟล์ JSON โดยแตะเฉพาะค่า แล้วตรวจ key ด้วยการแตก key ซ้อนให้แบน
3. ดึง API จากโค้ดด้วย regex (export + JSDoc)
4. คำสั่ง `/translate` ที่มี subcommand
5. คำสั่ง `/docgen`

## หมายเหตุ

- การแปลและ `/docgen readme` เรียก model จริง (ค่าเริ่มต้นใช้ haiku) คิดค่าใช้จ่ายตามบัญชีของคุณ ทุกคำสั่งจะบอกจำนวน token ที่ใช้
- ใช้ชื่อคำสั่ง `/docgen` ไม่ใช่ `/docs` เพราะชนกับคำสั่ง `/docs` ที่มีอยู่แล้วในบางเครื่อง
- แปลคอมเมนต์แล้ว ถ้าจำนวนบรรทัดไม่เท่าต้นฉบับจะขึ้นเตือน ให้ตรวจด้วย diff ก่อนใช้
- `/docgen readme` ร่างจาก package.json และรายชื่อไฟล์เท่านั้น ส่วนที่ไม่รู้จะใส่ TODO ไว้ ควรตรวจและเติมเองก่อนใช้
