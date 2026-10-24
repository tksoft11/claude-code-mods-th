# Mod 55: Docker Pilot TH

แดชบอร์ด Docker ในแผงข้าง Claude Code: container ที่รันอยู่และที่พัง (health, CPU, แรม, พอร์ต, กลุ่ม compose) รีเฟรชทุก 10 วินาทีและเด้งเตือนเมื่อ container ตายหรือ unhealthy ระหว่างเปิดแผง ดู log สั่ง start/stop/restart ให้ Claude อ่าน log แล้วบอกสาเหตุ และดู Pod ของ Kubernetes ที่พัง (CrashLoopBackOff, restart บ่อย)

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/docker` | แดชบอร์ด (เฉพาะตัวที่รัน/มีปัญหา) |
| `/docker all` | ทุกตัว รวมที่หยุดปกติ |
| `/docker logs <ชื่อ> [บรรทัด]` | log ล่าสุด |
| `/docker why <ชื่อ>` | ให้ Claude อ่าน log แล้วบอกสาเหตุ |
| `/docker start\|stop\|restart <ชื่อ>` | สั่ง container (stop ถามก่อน) |
| `/docker pods` | Pod ของ Kubernetes ที่มีปัญหา |

## ติดตั้ง

```
/plugin install docker-pilot-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. อ่าน docker ps / docker stats แบบ JSON แล้วเทียบกับรอบก่อน
2. หา Pod ที่มีปัญหาจาก kubectl
3. แผงแดชบอร์ดที่รีเฟรชเฉพาะตอนเปิด
4. คำสั่ง /docker

## หมายเหตุ

ต้องมี Docker (และ kubectl สำหรับ /docker pods) ชื่อ container พิมพ์บางส่วนได้
