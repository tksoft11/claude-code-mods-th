# Mod 26: Network Tool TH

เครื่องมือเครือข่ายครบในคำสั่งเดียว: ping และ traceroute ด้วยคำสั่งของระบบ, DNS lookup ผ่าน DNS-over-HTTPS, WHOIS ผ่าน RDAP (วันจดทะเบียน วันหมดอายุ ผู้รับจด), IP สาธารณะพร้อม ISP, ตรวจ HTTP header และ security header, วัดความเร็วดาวน์โหลด, เช็คพอร์ต และดูสัญญาณ Wi-Fi ใช้ได้ทั้ง Windows, macOS และ Linux

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/net ping <host>` | ping 4 ครั้ง |
| `/net trace <host>` | เส้นทางไปปลายทาง (สูงสุด 15 hop) |
| `/net dns <domain> [A\|AAAA\|MX\|TXT\|NS\|CNAME\|all]` | ระเบียน DNS |
| `/net whois <domain>` | วันจด วันหมดอายุ ผู้รับจด (รองรับ .co.th) |
| `/net ip` | IP สาธารณะของเรา + ISP + จังหวัด |
| `/net http <url>` | status เวลาโหลด และ security header |
| `/net speed` | วัดความเร็วดาวน์โหลด |
| `/net port <host> <พอร์ต,...>` | เช็คพอร์ต (สูงสุด 10) |
| `/net wifi` | สัญญาณ Wi-Fi ที่ต่ออยู่ |
| `/net history` | คำสั่งที่ใช้ไป |

## ติดตั้ง

```
/plugin install network-tool-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ping/traceroute ข้ามระบบ และตรวจชื่อโฮสต์ก่อนส่งให้คำสั่งระบบ
2. DNS-over-HTTPS และ RDAP (JSON อ่านง่ายกว่า whois เดิม)
3. อ่าน header และเช็ค security header
4. วัดความเร็ว (โหลดหลายรอบเพราะ $.http.fetch รับได้ครั้งละ 4 MB), เช็คพอร์ตด้วย TcpClient/nc, อ่านสัญญาณ Wi-Fi
5. คำสั่ง /net

## หมายเหตุ

เช็คพอร์ตเฉพาะเครื่องที่เป็นของเราหรือได้รับอนุญาต ความเร็วที่วัดได้ผ่าน Claude Code มี overhead จึงต่ำกว่าแอป speedtest เล็กน้อย
