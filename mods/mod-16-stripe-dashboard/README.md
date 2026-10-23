# Mod 16: Stripe Dashboard TH

ดูยอดขายจาก Stripe ใน Claude Code: วันนี้ เมื่อวาน 7 วัน 30 วัน พร้อมการเติบโตเทียบช่วงก่อน ค่าธรรมเนียมและยอดสุทธิจริง MRR/ARR จาก subscription ที่ active กราฟรายวัน ลูกค้าที่จ่ายมากสุด และยอดแยกตามสินค้า ทั้งหมดดึงจาก Stripe API จริง และมี dashboard ในแผงด้านข้าง ถ้ายังไม่มี key ลองดูหน้าตาได้ด้วยโหมดข้อมูลตัวอย่าง ซึ่งจะมีป้ายบอกทุกจุด

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/stripe` | สรุป + เปิด dashboard ในแผง |
| `/stripe today` / `yesterday` / `week` / `month` | ยอดตามช่วงเวลา เทียบกับช่วงก่อนหน้า |
| `/stripe 7days` / `30days` | กราฟยอดรายวัน |
| `/stripe transactions [n]` | รายการล่าสุด พร้อมค่าธรรมเนียมและยอดสุทธิ |
| `/stripe top` | ลูกค้าที่จ่ายมากสุด 5 อันดับ |
| `/stripe products` | ยอดแยกตามสินค้า (จาก description ของรายการ) |
| `/stripe refresh` | ดึงข้อมูลใหม่ (ปกติจะ cache ไว้ 5 นาที) |
| `/stripe status` | ดูว่าใช้ key แบบไหนอยู่ (แสดงแค่ 4 ตัวท้าย) |
| `/stripe export` | ส่งออก CSV |
| `/stripe demo` / `demo off` | เปิด/ปิดโหมดข้อมูลตัวอย่าง |

## ตั้งค่า key

1. ไปที่ https://dashboard.stripe.com/apikeys แล้วสร้าง **Restricted key** ที่ให้สิทธิ์ **Read** สำหรับ Charges, Balance transactions และ Subscriptions
2. ตั้งตัวแปร environment ก่อนเปิด `claude`:

```powershell
# Windows PowerShell
$env:STRIPE_SECRET_KEY = "rk_live_..."
```

```bash
# macOS / Linux
export STRIPE_SECRET_KEY=rk_live_...
```

อย่าพิมพ์ key ลงในช่องแชตของ Claude Code เพราะข้อความทั้งหมดจะถูกบันทึกไว้ใน transcript

## ติดตั้ง

```
/plugin install stripe-dashboard-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. เรียก REST API ด้วย `$.http.fetch` และดึงข้อมูลหลายหน้าด้วย `starting_after`
2. แปลงข้อมูลดิบ: สตางค์เป็นบาท, สกุลเงินที่ไม่มีทศนิยม และคำนวณ MRR จากรอบบิลต่างๆ
3. ข้อมูลตัวอย่างแบบสุ่มด้วย seed (ได้ผลเหมือนเดิมทุกครั้ง)
4. อ่าน secret จาก env ด้วย `$.env.get` และ cache ข้อมูล
5. คำนวณสถิติแยกตามสกุลเงิน
6. dashboard ในแผง: การ์ดยอดและกราฟแท่ง
7. คำสั่งที่มี subcommand และการส่งออก CSV

## หมายเหตุ

- Mod นี้อ่านข้อมูลอย่างเดียว ไม่สร้าง แก้ไข หรือคืนเงินใน Stripe
- ดึงข้อมูลย้อนหลัง 31 วัน สูงสุด 1,000 รายการ
- ทดสอบกับ Stripe API จำลองแล้ว (pagination, ค่าธรรมเนียม, MRR) แต่ยังไม่ได้ลองกับบัญชี Stripe จริง แนะนำให้ลองด้วย test key (`rk_test_...`) ก่อน
- ไฟล์ CSV มีอีเมลลูกค้า อย่า commit เข้า git
