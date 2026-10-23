# Claude Code Mods TH 🇹🇭

12 Mod สำหรับ [Claude Code](https://code.claude.com/docs) ฉบับภาษาไทย ทุกตัวมีคอมเมนต์ภาษาไทยอธิบายแบบทีละบท
ใช้ได้ทั้งติดตั้งไว้ใช้งานจริง และเปิดโค้ดอ่านเพื่อเรียนวิธีทำ Mod ของตัวเอง

| # | Mod | คำสั่ง | ทำอะไร | สอนเรื่อง |
|---|---|---|---|---|
| 01 | [Savvy Progress](mods/mod-01-savvy-progress) | `/progress` | แถบเหนือช่องพิมพ์: เวลา, จำนวน tool, token, ค่าใช้จ่ายเป็นบาท | `tool.call`, `turn.complete`, วาดแถบ `AbovePrompt` |
| 02 | [Claude Skins](mods/mod-02-claude-skins) | `/skin`, `/skin-random` | ธีมไทย 5 แบบ สลับโหมดมืด/สว่าง + แถบสีธีม | `$.config.set`, `$.store`, คำสั่งแบบมี argument |
| 03 | [You Should Know](mods/mod-03-you-should-know) | `/tips` | เด้งทิปตามสิ่งที่คุณทำ | `prompt.submit`, `$.ui.toast`, `$.session.usage` |
| 04 | [Filetree](mods/mod-04-filetree) | `/files` | แผงด้านข้างแสดงไฟล์ที่ Claude แตะ | วาดแผง `Pane`, `$.ui.open` |
| 05 | [Cache Tax](mods/mod-05-cache-tax) | `/cache` | ค่า Prompt Cache เป็นบาท + Hit Rate | อ่าน `usage`, ดักคำสั่ง built-in (`/clear`) |
| 06 | [Blast Radius](mods/mod-06-blast-radius) | `/blast` | เตือนก่อนแก้ไฟล์ที่ถูก import หลายที่ | `$.process.run` (git grep), ส่ง `context` ให้ Claude |
| 07 | [Reflect](mods/mod-07-reflect) | `/reflect` | ทบทวนงานแบบ Retrospective | Work log, `$.fs.write` |
| 08 | [Terminal Browser](mods/mod-08-terminal-browser) | `/browser` | เปิดเว็บ สรุปเป็นไทย เว็บโปรด ประวัติ | `$.http.fetch`, `$.prompt.submit` |
| 09 | [Replay Theater](mods/mod-09-replay-theater) | `/replay` | ดูย้อนหลังแบบฉากหนัง ส่งออก HTML | timer `$.clock.every`, แผงเล่นทีละฉาก |
| 10 | [File Manager](mods/mod-10-file-manager) | `/fm` | จัดการไฟล์ มีถังขยะกู้คืนได้ | `$.fs`, `$.process.run` แบบปลอดภัย |
| 11 | [Sweet Alert](mods/mod-11-sweet-alert) | `/alert`, `/confirm`, `/prompt`, `/toast` | Alert สวยๆ แบบ SweetAlert มีปุ่มกดและช่องกรอก | dialog ด้วย `Button`/`Input`, `onPress`/`onSubmit`, คิว + timer |
| 12 | [Flex Message](mods/mod-12-flex-message) | `/flex` | สร้าง LINE Flex Message 6 แบบ ดูตัวอย่าง + JSON ส่ง LINE | template เป็นฟังก์ชัน, วาด JSON แบบ recursive, `$.store` |

## ⚠️ ก่อนใช้: เปิดฟีเจอร์ Mod (early access)

Mod ทั้งหมดเป็นปลั๊กอินแบบ **hooks module** ซึ่งตอนนี้ยังเป็น early access ใน Claude Code
ต้องตั้งตัวแปร environment นี้ก่อนเปิด `claude` ไม่อย่างนั้น Mod จะไม่โหลด:

```bash
# macOS / Linux / Git Bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

```powershell
# Windows PowerShell
$env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1"
```

ทดสอบกับ Claude Code 2.1.304 แล้ว API นี้ยังอาจเปลี่ยนในเวอร์ชันถัดไป

## ติดตั้ง

ในช่องพิมพ์ของ Claude Code (terminal) ติดตั้งทีละตัว:

```
/plugin install savvy-progress-th --marketplace tksoft11/claude-code-mods-th
```

ตอบ `y` เพื่อเพิ่ม marketplace แล้วเลือก scope จากนั้นติดตั้งตัวอื่นต่อได้เลย:

```
/plugin install claude-skins-th@claude-code-mods-th
/plugin install you-should-know-th@claude-code-mods-th
/plugin install filetree-th@claude-code-mods-th
/plugin install cache-tax-th@claude-code-mods-th
/plugin install blast-radius-th@claude-code-mods-th
/plugin install reflect-th@claude-code-mods-th
/plugin install terminal-browser-th@claude-code-mods-th
/plugin install replay-theater-th@claude-code-mods-th
/plugin install file-manager-th@claude-code-mods-th
/plugin install sweet-alert-th@claude-code-mods-th
/plugin install flex-message-th@claude-code-mods-th
```

จาก shell ก็ได้:

```bash
claude plugin install savvy-progress-th --marketplace tksoft11/claude-code-mods-th
```

ในแอป Desktop: กด **+** ข้างช่องพิมพ์ → **Plugins** → **Add marketplace** ใส่ `tksoft11/claude-code-mods-th` → **Add plugin**

## ลองแก้โค้ดเอง (โหมดพัฒนา)

```bash
git clone https://github.com/tksoft11/claude-code-mods-th
cd claude-code-mods-th
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
claude --plugin-dir mods/mod-01-savvy-progress
```

แก้ `hooks/register.tsx` แล้วบันทึก Claude Code จะโหลด Mod ใหม่ให้เอง ตรวจโค้ดก่อนใช้ด้วย:

```bash
claude plugin validate mods/mod-01-savvy-progress
```

## โครงสร้างของแต่ละ Mod

```
mods/mod-01-savvy-progress/
├── .claude-plugin/plugin.json   ← ชื่อ, เวอร์ชัน, คำอธิบาย
├── hooks/hooks.json             ← บอกว่า module หลักคือไฟล์ไหน
├── hooks/register.tsx           ← โค้ดทั้งหมด + คอมเมนต์สอนทีละบท
└── README.md
```

หัวใจของทุก Mod คือ `register.tsx`:

```ts
export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    // ก่อน next: tool ยังไม่รัน
    const ran = await next(e)
    // หลัง next: ได้ผลลัพธ์ของ tool แล้ว
    return ran
  })
}
```

- `on(event, hook)` ดัก event เช่น `session.start`, `tool.call`, `turn.complete`, `command.run`, `ui.render`
- `$` คือ engine ของ Claude Code เรียกแบบ `$.noun.method` เช่น `$.ui.toast(...)` หรือ `$.fs.read(...)`
- `next(e)` คือให้ Claude Code ทำงานต่อตามปกติ

## ข้อควรรู้

- ราคาและอัตราแลกเปลี่ยนใน Mod 01 และ 05 เป็น**ค่าประมาณ** แก้ได้ที่ค่าคงที่ `PRICE` และ `THB_PER_USD` ด้านบนของไฟล์
- ค่าที่ Mod จำไว้ในตัวแปรจะหายเมื่อ Mod ถูกโหลดใหม่ ส่วนค่าที่ต้องจำข้าม session (ธีม, ทิปต้อนรับ, บทเรียนของ Reflect, ถังขยะ, ไฟล์โปรด) เก็บใน `$.store`
- Mod 06 ต้องอยู่ใน git repo เพราะใช้ `git grep` หาไฟล์ที่ import
- Mod 10 ใช้ PowerShell บน Windows และ `sh` บน macOS/Linux ในการย้าย ก็อป และลบไฟล์

## อยากเพิ่ม Mod ใหม่

ดูมาตรฐานของโครงสร้าง รูปแบบโค้ด และขั้นตอนตรวจได้ที่ [CONTRIBUTING.md](CONTRIBUTING.md)

## เครดิต

ได้แรงบันดาลใจจากโปรเจกต์เหล่านี้ (โค้ดใน repo นี้เขียนใหม่ทั้งหมด):
[JohnnyVizz/claude-savvy](https://github.com/JohnnyVizz/claude-savvy) ·
[hellosverre/claude-skins](https://github.com/hellosverre/claude-skins) ·
[data-goblin/claude-filetree](https://github.com/data-goblin/claude-filetree) ·
[karanb192/cache-tax](https://github.com/karanb192/cache-tax) ·
[BayramAnnakov/claude-reflect](https://github.com/BayramAnnakov/claude-reflect) ·
[zenbu-labs/terminal-browser](https://github.com/zenbu-labs/terminal-browser) ·
และตัวอย่างปลั๊กอินของ Anthropic (You Should Know, Blast Radius, Replay)

## License

[MIT](LICENSE)
