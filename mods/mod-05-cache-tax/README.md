# Mod 05: Cache Tax TH

บอกว่า session นี้ใช้ Prompt Cache คุ้มไหม: token ที่อ่านจาก cache (ถูกกว่า input ปกติประมาณ 10 เท่า) กับที่เขียนเข้า cache, Hit Rate, ค่าใช้จ่ายเป็นบาท และเงินที่ประหยัดได้ แสดงไฟสี 🟢🟡🔴 ใน status line และเตือนเมื่อจะ `/clear`

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/cache` | รายงานของ session นี้ |
| `/cache all` | ยอดสะสมทุก session |
| `/cache clear` | ล้างสถิติ |

## ติดตั้ง

```
/plugin install cache-tax-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. แกะ `cache_read_input_tokens` และ `cache_creation_input_tokens` จาก `usage`
2. คำนวณ Hit Rate และเงินที่ประหยัด
3. ดักคำสั่ง built-in (`/clear`) แล้วปล่อยให้ทำงานต่อด้วย `next(e)`
4. เก็บยอดสะสมใน `$.store`
5. แสดงผลใน status line ด้วย `$.ui.status`

## หมายเหตุ

ราคาเป็นค่าประมาณของ model ระดับ Sonnet แก้ได้ที่ `PRICE`
