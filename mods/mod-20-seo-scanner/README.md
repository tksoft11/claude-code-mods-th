# Mod 20: SEO Scanner TH

ดึงหน้าเว็บจริงมาตรวจ SEO 17 ข้อ แล้วให้คะแนน 0-100 พร้อมวิธีแก้เรียงตามความสำคัญ: title, meta description, H1, alt ของรูป, lang, viewport, canonical, Open Graph (แชร์ Facebook/LINE แล้วมีรูป), Twitter card, JSON-LD, noindex, HTTPS, ความเร็ว, ขนาด HTML, robots.txt และ sitemap.xml ตรวจลิงก์เสียและเทียบคะแนนหลายเว็บได้

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/seo <url>` | ตรวจ SEO ให้คะแนนพร้อมวิธีแก้ |
| `/seo links <url>` | ตรวจลิงก์เสีย (สูงสุด 30 ลิงก์) |
| `/seo compare <url> <url>` | เทียบคะแนนหลายเว็บ |
| `/seo list` | ผลที่ตรวจไว้ |
| `/seo export` | บันทึกรายงานเป็น seo-report.md |

## ติดตั้ง

```
/plugin install seo-scanner-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่านค่าจาก HTML ด้วย regex (Mod ไม่มี DOM)
2. เกณฑ์ตรวจแต่ละข้อ และน้ำหนักคะแนน
3. ดึงหน้าเว็บ, robots.txt, sitemap แล้วรวมคะแนน
4. ตรวจลิงก์ทีละ 5 ลิงก์พร้อมกัน ไม่ยิงเว็บเขาหนักเกิน
5. คำสั่ง /seo

## หมายเหตุ

อ่าน HTML ที่เซิร์ฟเวอร์ส่งมาโดยไม่รัน JavaScript เว็บที่สร้างหน้าด้วย JS ล้วน (SPA) อาจได้คะแนนต่ำกว่าที่ Google เห็นจริง ใช้เป็นการตรวจเบื้องต้น ไม่ได้แทน Google Search Console
