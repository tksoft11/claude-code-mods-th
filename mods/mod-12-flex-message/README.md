# Mod 12: Flex Message TH

สร้าง LINE Flex Message จากคำสั่งภาษาไทยสั้นๆ แทนการเขียน JSON เอง มี template 6 แบบ (สินค้า, ใบเสร็จ, โปรไฟล์, เมนูอาหาร, บัตรสมาชิก, carousel) ดูตัวอย่างได้ในแผงด้านข้างซึ่งวาดจาก JSON จริง กดปุ่มในตัวอย่างเพื่อดูว่า LINE จะส่งข้อความอะไร แล้วเอา JSON ไปส่งผ่าน LINE Messaging API ได้ทันที Flex ที่สร้างไว้จะจำไว้ข้าม session

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/flex product เสื้อยืดลายไทย 299 399` | สินค้า: ชื่อ ราคา [ราคาเดิม] [https://รูป] |
| `/flex receipt ร้านส้มตำ ส้มตำ:60,ลาบ:70` | ใบเสร็จ รวมยอดให้เอง (หรือ `/flex receipt ร้าน 350`) |
| `/flex profile สมชาย ใจดี \| นักพัฒนา` | โปรไฟล์: ชื่อ \| ตำแหน่ง |
| `/flex menu ร้านป้าแดง ส้มตำ:60,ลาบ:70` | เมนูอาหาร กดแต่ละแถวเพื่อสั่ง |
| `/flex member สมชาย 1250 [Gold]` | บัตรสมาชิก มีแถบความคืบหน้าไประดับถัดไป |
| `/flex carousel เสื้อ:299,หมวก:199` | หลายสินค้าเลื่อนดูได้ (2-12 ชิ้น) |
| `/flex demo` | สร้างตัวอย่างครบ 6 แบบ |
| `/flex list` | ดูรายการที่สร้างไว้ |
| `/flex show <id>` | ดูตัวอย่างในแผง |
| `/flex json <id>` | JSON พร้อมส่ง LINE Messaging API |
| `/flex export <id>` | บันทึกเป็น `flex-<id>.json` |
| `/flex delete <id>` / `/flex clear` | ลบ / ลบทั้งหมด |

## ติดตั้ง

```
/plugin install flex-message-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. โครงสร้าง Flex Message: bubble, carousel และ component (box, text, button, image, separator)
2. ทำ template เป็นฟังก์ชันที่คืน bubble
3. แปลงข้อความที่พิมพ์ เช่น `ส้มตำ:60,ลาบ:70` เป็นข้อมูล
4. เก็บข้อมูลข้าม session ด้วย `$.store`
5. ทำตัวอย่างแบบข้อความไว้ใช้ตอนเปิดแผงไม่ได้
6. วาด JSON เป็น element ของ Claude Code แบบ recursive และทำปุ่มเลื่อน carousel
7. ทำคำสั่งที่มี subcommand หลายตัว

## หมายเหตุ

- ตัวอย่างในแผงเป็นการจำลองหน้าตาคร่าวๆ ใน terminal ไม่ได้เหมือน LINE จริง 100% ก่อนส่งจริงให้ตรวจกับ [Flex Message Simulator](https://developers.line.biz/flex-simulator/)
- รูปจะใส่ให้เฉพาะเมื่อมี URL แบบ `https://` (LINE บังคับ) ถ้าไม่ใส่ การ์ดจะไม่มีรูป
- Mod นี้ยังไม่ส่งเข้า LINE ให้เอง วิธีส่งเขียนไว้ในส่วน "การบ้าน / ต่อยอด" ท้ายไฟล์ `register.tsx`
