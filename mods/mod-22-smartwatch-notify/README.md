# Mod 22: Smartwatch Notify TH

สั่ง Claude ทำงานยาวแล้วลุกไปทำอย่างอื่นได้เลย Mod นี้ส่งแจ้งเตือนไปที่แอป ntfy บนมือถือเมื่อ Claude ทำงานเสร็จ รออนุญาตหรือรอคำตอบ หรือเกิด error ถ้านาฬิกา (Apple Watch, Wear OS, Galaxy Watch, Mi Band) จับคู่กับมือถืออยู่ ข้อมือจะสั่นตามเอง มีช่วงห้ามรบกวนและหน้าปัดสรุปในแผงด้านข้าง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/smartwatch setup` | สร้าง topic ส่วนตัว + วิธีติดตั้งแอปบนมือถือ |
| `/smartwatch setup new` | สร้าง topic ใหม่ (ถ้าชื่อเดิมหลุด) |
| `/smartwatch test` | ส่งข้อความทดสอบ |
| `/smartwatch on / off` | เปิด/ปิดการแจ้งเตือน |
| `/smartwatch min <วินาที>` | แจ้งงานเสร็จเฉพาะงานที่นานกว่านี้ (ค่าเริ่มต้น 30, 0 = ทุกงาน) |
| `/smartwatch dnd 22:00-07:00 / dnd off` | ช่วงห้ามรบกวน |
| `/smartwatch preview on / off` | ส่งตัวอย่างคำตอบไปด้วย (ค่าเริ่มต้น: ปิด) |
| `/smartwatch server <url>` | ใช้ ntfy server ของตัวเอง |
| `/smartwatch hook add <url>` | ส่งต่อไปห้องแชต Discord หรือ Slack (Incoming Webhook URL) |
| `/smartwatch hook list` / `hook remove <เลข>` | ดู / ลบ webhook |
| `/smartwatch status` | ดูการตั้งค่า + หน้าปัดในแผง |

## ติดตั้ง

```
/plugin install smartwatch-notify-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. สุ่มชื่อ topic ด้วย crypto.getRandomValues
2. ช่วงห้ามรบกวนที่ข้ามเที่ยงคืน
3. ส่งแจ้งเตือนแบบ JSON ไป ntfy (ภาษาไทยไม่เพี้ยน)
4. ฟัง turn.start, turn.complete และ classic.Notification (ตอน Claude รออนุญาต)
5. หน้าปัดนาฬิกาในแผง

## หมายเหตุ

ใครรู้ชื่อ topic ก็อ่านแจ้งเตือนได้ Mod จึงสุ่มชื่อยาวให้ และค่าเริ่มต้นไม่ส่งเนื้อหาคำตอบ ถ้าต้องการความเป็นส่วนตัวเต็มที่ ให้ตั้ง ntfy server ของตัวเอง แนวคิดเดิมที่อ่านแจ้งเตือน LINE/Gmail และข้อมูลสุขภาพจากมือถือ Mod ทำไม่ได้ เพราะไม่มีทางเข้าถึงข้อมูลเหล่านั้น จึงกลับทิศเป็นส่งแจ้งเตือนจาก Claude Code ไปที่มือถือและนาฬิกาแทน
