# Mod 56: Dev Dictionary TH

พจนานุกรมศัพท์ Dev ภาษาคน 60 คำ (CORS, JWT, debounce, race condition, idempotent, hydration ...) แต่ละคำมีความหมายสั้นๆ และการเปรียบเทียบกับชีวิตจริง คำที่ไม่มีในคลังให้ Claude อธิบายแบบเข้าใจง่าย 3 บรรทัดแล้วจำไว้ และกระซิบความหมายเป็น toast เมื่อคุณพิมพ์ศัพท์ในคลัง (คำละครั้งต่อ session)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/explain <ศัพท์>` | อธิบายศัพท์ เช่น /explain cors |
| `/explain list` | คำทั้งหมดในคลัง |
| `/explain random` | สุ่มหนึ่งคำ |
| `/explain whisper on\|off` | กระซิบความหมายเมื่อพิมพ์ศัพท์ในคลัง |

## ติดตั้ง

```
/plugin install dev-dictionary-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. คลังศัพท์พร้อมคำเปรียบเทียบ
2. หาศัพท์ในข้อความแบบทั้งคำ
3. ถาม Haiku เมื่อไม่มีในคลัง
4. จำคำตอบไว้ใช้ซ้ำ (ประหยัด token)

## หมายเหตุ

คำในคลังไม่ใช้ token เลย ส่วนคำที่ Claude อธิบายจะเก็บไว้สูงสุด 200 คำ
