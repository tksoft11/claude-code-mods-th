# Mod 102: Mermaid Inline TH

วาด Mermaid ในคำตอบเป็นภาพ: Claude ชอบตอบเป็นบล็อก ```mermaid แต่ใน terminal เห็นเป็นโค้ดดิบ Mod นี้วาดเป็นภาพกล่องและลูกศรสีตรงตำแหน่งเดิม รองรับ flowchart/graph (แนวตั้ง TD และแนวนอน LR), sequenceDiagram และ pie คิดความกว้างตัวอักษรไทยให้กล่องตรง (สระบน-ล่างและวรรณยุกต์ไม่กินช่อง) แบบที่ยังวาดไม่ได้จะแสดงโค้ดเดิม

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/mermaid on\|off` | เปิด/ปิด |
| `/mermaid raw on\|off` | แสดงโค้ดเดิมใต้ภาพด้วย |
| `/mermaid demo` | ดูตัวอย่าง |
| `/mermaid draw <โค้ด>` | วาดโค้ดที่พิมพ์เอง ใช้ `;` แทนขึ้นบรรทัด เช่น `graph LR; A-->B` |

## ติดตั้ง

```
/plugin install mermaid-inline-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ความกว้างบนจอของตัวอักษรไทย, emoji, CJK
2. อ่าน flowchart: เก็บข้อความในวงเล็บออกก่อน แล้วตัดตามลูกศร
3. จัดชั้น (BFS) แล้ววาดกล่องตามรูปทรง
4. sequenceDiagram และ pie
5. วาด `AssistantMessage` ใหม่ แทนที่เฉพาะบล็อก mermaid (ส่วนอื่นใช้ `Markdown`)

## หมายเหตุ

เปลี่ยนแค่ภาพที่เราเห็น ข้อความที่ Claude ได้รับยังเป็นโค้ด mermaid เหมือนเดิม ลูกศรที่มีป้ายหรือข้ามชั้นแสดงเป็นรายการใต้กล่อง
