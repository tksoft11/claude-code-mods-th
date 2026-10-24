# Mod 98: Narrator TH

นักพากย์: งานที่ใช้เวลานาน (ค่าเริ่มต้น 20 วินาทีขึ้นไป) เสร็จเมื่อไหร่ Haiku จะสรุปเป็นประโยคพูดสั้นๆ แล้วอ่านออกเสียง ลุกไปชงกาแฟได้โดยไม่ต้องจ้องจอ พูดได้ทั้งไทยและอังกฤษ

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/narrator on\|off` | เปิด/ปิด |
| `/narrator lang th\|en` | ภาษา |
| `/narrator min 20` | พากย์เฉพาะงานที่นานเกินกี่วินาที |
| `/narrator test` | ทดสอบเสียง |
| `/narrator again` | พูดประโยคล่าสุดซ้ำ |

## ติดตั้ง

```
/plugin install narrator-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. พูดออกเสียง: `$.audio.speak` (macOS) และ System.Speech ของ PowerShell (Windows)
2. สรุปงานเป็นประโยคพูดด้วย Haiku
3. งานนานเสร็จแล้วค่อยพากย์

## หมายเหตุ

เสียงภาษาไทยบน Windows ต้องติดตั้งก่อน: Settings > Time & language > Speech > Add voices > ไทย ถ้ายังไม่มี Mod จะเตือนครั้งแรก หรือใช้ `/narrator lang en`
