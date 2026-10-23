# Mod 14: PromptPay QR TH

สร้าง QR พร้อมเพย์ที่สแกนจ่ายได้จริง จากเบอร์โทร บัตรประชาชน หรือ e-Wallet จะล็อคยอดเงินหรือให้ลูกค้ากรอกยอดเองก็ได้ QR จะแสดงในแผงด้านข้าง (ดำบนพื้นขาว) และส่งออกเป็นไฟล์ SVG ไปพิมพ์แปะหน้าร้านได้ ก่อนสร้างจะตรวจเบอร์โทรและ check digit ของเลขบัตรประชาชนให้ด้วย

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/qr 0812345678 100 ร้านส้มตำ` | QR จากเบอร์โทร ยอด 100 บาท พร้อมชื่อร้าน |
| `/qr 0812345678` | ไม่ระบุยอด (ลูกค้ากรอกเองตอนสแกน) |
| `/qr id 1101700207030 500` | QR จากเลขบัตรประชาชน |
| `/qr wallet 123456789012345 200` | QR จากเลข e-Wallet 15 หลัก |
| `/qr list` | ดูรายการ QR ที่สร้างไว้ |
| `/qr show <id>` | แสดง QR ในแผง |
| `/qr payload <id>` | ดู payload (ข้อความที่อยู่ใน QR) |
| `/qr export <id>` | บันทึกเป็น `promptpay-<id>.svg` และ `.txt` |
| `/qr validate <เบอร์หรือเลขบัตร>` | ตรวจว่าเลขถูกต้องไหม |
| `/qr delete <id>` / `/qr clear` | ลบ / ลบทั้งหมด |
| `/qr demo` | สร้างตัวอย่างด้วยเบอร์สมมติ |

## ติดตั้ง

```
/plugin install promptpay-qr-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

Mod นี้แบ่งเป็น 3 ไฟล์:

1. [hooks/promptpay.ts](hooks/promptpay.ts) สร้าง payload ตามมาตรฐาน EMVCo: TLV, CRC16-CCITT, แปลงเบอร์ 08x เป็น 0066 และตรวจ check digit ของบัตรประชาชน
2. [hooks/qr.ts](hooks/qr.ts) ตัวสร้าง QR ที่เขียนเองทั้งหมด (Reed-Solomon, ลวดลาย finder/timing/alignment, วางข้อมูลแบบซิกแซก, เลือก mask) เพราะ Mod ใช้ library จาก npm ไม่ได้
3. [hooks/register.tsx](hooks/register.tsx) คำสั่ง `/qr` และการวาด QR ในแผงด้วยตัวอักษรครึ่งบล็อก (▀ ▄ █) ให้ได้ช่องสี่เหลี่ยมจัตุรัส

และสอนการ import ไฟล์อื่นของ Mod เอง (`import { encodeQR } from './qr'`)

## หมายเหตุ

- ทดสอบแล้วว่า payload ตรงกับ library [promptpay-qr](https://github.com/dtinth/promptpay-qr) และ QR ทุกขนาด (เวอร์ชัน 1–10) ถอดกลับด้วย OpenCV ได้ถูกต้อง แต่ยังไม่ได้ลองสแกนจ่ายจริงด้วยแอปธนาคาร ควรลองโอนยอดเล็กๆ ก่อนใช้จริง
- ถ้าสแกน QR จากหน้าจอไม่ติด ให้ขยายหน้าต่างหรือใช้ไฟล์ SVG จาก `/qr export` แทน
- เลขในแผงจะซ่อนบางหลักไว้ (เช่น `1xxxxxxxx7030`) แต่ใน QR และไฟล์ `.txt` เป็นเลขเต็ม
