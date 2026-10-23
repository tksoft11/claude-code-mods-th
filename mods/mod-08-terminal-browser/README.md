# Mod 08: Terminal Browser TH

เปิดเว็บโดยไม่ต้องออกจาก Claude Code ให้ Claude เปิดแล้วสรุปเป็นภาษาไทย หรือดึงข้อความดิบมาดูเองโดยไม่ใช้ token มีเว็บโปรดสาย dev ไทย ค้นหาเว็บ และประวัติ (รวมเว็บที่ Claude เปิดเองด้วย WebFetch)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/browser react.dev` | ให้ Claude เปิดและสรุปเป็นไทย |
| `/browser raw example.com` | ดึงข้อความดิบเอง |
| `/browser fav [ชื่อ]` | ดู/เปิดเว็บโปรด |
| `/browser search <คำ>` | ให้ Claude ค้นเว็บแล้วสรุป |
| `/browser history` | ประวัติ |

## ติดตั้ง

```
/plugin install terminal-browser-th --marketplace <github-user>/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ดัก tool เดียวด้วย matcher `{ tool: "WebFetch" }`
2. สั่งให้ Claude ทำงานด้วย `$.prompt.submit`
3. ดึงเว็บเองด้วย `$.http.fetch`
4. ตรวจ URL ด้วย `new URL()`

## หมายเหตุ

`raw` แสดงสูงสุด 3,000 ตัวอักษร และตัด HTML แบบง่าย
