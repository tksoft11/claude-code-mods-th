# Claude Code Mods TH 🇹🇭

100 Mod สำหรับ [Claude Code](https://code.claude.com/docs) ฉบับภาษาไทย ทุกตัวมีคอมเมนต์ภาษาไทยอธิบายแบบทีละบท
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
| 13 | [Nokia Games](mods/mod-13-nokia-games) | `/game` | เกมงูและ Tetris จอเขียวแบบ Nokia 3310 | game loop ด้วย `$.clock.every`, ปุ่ม `hotkey`, High Score ใน `$.store` |
| 14 | [PromptPay QR](mods/mod-14-promptpay-qr) | `/qr` | สร้าง QR พร้อมเพย์ที่สแกนจ่ายได้จริง ส่งออก SVG | มาตรฐาน EMVCo + CRC16, เขียนตัวสร้าง QR เอง, import ไฟล์ในโฟลเดอร์ Mod |
| 15 | [Cyber Guard](mods/mod-15-cyber-guard) | `/guard` | บล็อกคำสั่ง Bash อันตราย สแกน secret โค้ดเสี่ยง และ package.json | guard ด้วย `{ deny }` + `.catch`, regex, `$.process.run` |
| 16 | [Stripe Dashboard](mods/mod-16-stripe-dashboard) | `/stripe` | ยอดขาย Stripe จริง ค่าธรรมเนียม MRR กราฟ | REST API + pagination, อ่าน secret จาก `$.env` |
| 17 | [Market Tracker](mods/mod-17-market-tracker) | `/market` | ราคาทอง หุ้น คริปโต ค่าเงิน พอร์ต และแจ้งเตือน | รวมหลายแหล่งข้อมูล, cache, แจ้งเตือนด้วย timer |
| 18 | [Dev Painkiller](mods/mod-18-dev-painkiller) | `/pain` | พอร์ตชน, .env, console.log, TODO, git, cache | ใช้คำสั่งของระบบข้าม OS, ยืนยันก่อนลบด้วย `confirm` |
| 19 | [Translate & Docs](mods/mod-19-translate-docs) | `/translate`, `/docgen` | แปลด้วย Claude, i18n หลายภาษา, API.md และ README | `$.model.complete`, ตรวจผล JSON จาก AI |
| 20 | [SEO Scanner](mods/mod-20-seo-scanner) | `/seo` | ตรวจ SEO หน้าเว็บจริง ให้คะแนน 0-100 พร้อมวิธีแก้ | แยก HTML ด้วย regex, ยิงหลาย request แบบจำกัดจำนวน |
| 21 | [Status Page](mods/mod-21-status-page) | `/statuspage` | เช็ค uptime จริง, incident, ส่งออก HTML 5 ธีม | HTTP พร้อม timeout, สร้าง HTML ที่ปลอดภัย |
| 22 | [Smartwatch Notify](mods/mod-22-smartwatch-notify) | `/smartwatch` | แจ้งเตือนไปมือถือ/นาฬิกาเมื่องานเสร็จหรือ Claude รอคุณ | ส่ง push ผ่าน ntfy, `classic.Notification` |
| 23 | [Agent Monitor](mods/mod-23-agent-monitor) | `/agentmon` | Task Manager ของ subagent: สถานะ tool token | `$.agent.list()`, `e.agentId`, `$.turn.abort` |
| 24 | [App Scheduler](mods/mod-24-app-scheduler) | `/autoopen` | ตั้งเวลาเปิดเว็บ แอป หรือไฟล์อัตโนมัติ | คำนวณรอบเวลา, เปิดโปรแกรมของระบบอย่างปลอดภัย |
| 25 | [Booking System](mods/mod-25-booking-system) | `/book` | จองห้อง โต๊ะ สนาม คิว กันจองซ้อน สรุปรายได้ | ตรวจช่วงเวลาซ้อน, ปฏิทินรายวัน, CSV ภาษาไทย |
| 26 | [Network Tool](mods/mod-26-network-tool) | `/net` | ping, DNS, WHOIS, IP, speed test, พอร์ต, Wi-Fi | คำสั่งระบบข้าม OS, DNS-over-HTTPS, RDAP |
| 27 | [Trip Planner](mods/mod-27-trip-planner) | `/trip` | วางแผนทริปด้วย Claude, ลิงก์ค้นตั๋ว, เก็บตั๋วพร้อมนับถอยหลัง | `$.model.complete`, จัดการวันที่ไทย |
| 28 | [Media Playlist](mods/mod-28-media-playlist) | `/playlist` | Playlist จาก YouTube/Spotify/ไฟล์ กดเล่น ถัดไป สุ่ม | oEmbed, คิวสุ่ม, ปุ่มในแผง |
| 29 | [Weather Forecast](mods/mod-29-weather-forecast) | `/weather` | อากาศตอนนี้ รายชั่วโมง 7 วัน PM2.5 เตือนฝน | Open-Meteo, แปลรหัสอากาศเป็นไทย |
| 30 | [Movie Finder](mods/mod-30-movie-finder) | `/movie` | ค้นหนัง/ซีรีส์ watchlist เปิดบน Netflix YouTube ฯลฯ | Wikipedia + TVmaze API, ให้ Claude แนะนำ |
| 31 | [Dev Awake](mods/mod-31-dev-awake) | `/awake` | มุก ควิซ Pomodoro เตือนพัก | timer + status line |
| 32 | [Agent Tips](mods/mod-32-agent-tips) | `/agenttips` | ทิปสั่ง Claude Code วันละข้อ + template prompt | `$.prompt.fill` |
| 33 | [Dev Exercise](mods/mod-33-dev-exercise) | `/exercise` | ท่ายืดเหยียดแก้ Office Syndrome พาทำในแผง | แผงนับถอยหลังด้วย timer |
| 34 | [Daily Figures](mods/mod-34-daily-figures) | `/figure` | บุคคลสำคัญประจำวันจาก Wikipedia สรุปไทย | Wikimedia API + `$.model.complete` |
| 35 | [Spinner](mods/mod-35-spinner) | `/spinner` | เปลี่ยน spinner 20 แบบ รวมแบบไทย | วาด `Spinner` ของ Claude Code ใหม่ |
| 36 | [Drum](mods/mod-36-drum) | `/drum` | กลองชุดในแผง ตีด้วยคีย์บอร์ด อัด เล่นซ้ำ | Button hotkey, เสียง, step sequencer |
| 37 | [Dev Unblock](mods/mod-37-dev-unblock) | `/unblock` | ตันคิดไม่ออก? Claude อ่าน git diff แล้วเสนอขั้นต่อไป | บริบทจาก git + `$.model.complete` |
| 38 | [Trend](mods/mod-38-trend) | `/trend` | เทรนด์จริง: Google ไทย, HN, GitHub, คริปโต, Wikipedia | RSS/XML + หลาย API พร้อมกัน |
| 39 | [GCloud](mods/mod-39-gcloud) | `/gcloud` | ดู project VM Cloud Run billing ผ่าน gcloud | เรียก CLI แล้วอ่าน JSON |
| 40 | [Mockup](mods/mod-40-mockup) | `/mockup` | สร้าง mockup จากโลโก้ + ใบสั่งงานร้านสกรีน | สร้าง SVG + ฝังรูป |
| 41 | [Stamp](mods/mod-41-stamp) | `/stamp` | ตรายางดิจิทัล อนุมัติ/ด่วน/ลับ ส่งออก SVG | สร้าง SVG + filter |
| 42 | [Privacy Shield](mods/mod-42-privacy-shield) | `/shield` | บังจอตอนแชร์หน้าจอ ปิดบัง key/รหัสผ่าน โหมดโฟกัส | แก้ผลลัพธ์ `tool.call` |
| 43 | [Timer](mods/mod-43-timer) | `/timer` | จับเวลาหลายตัว stopwatch บันทึกเวลาทำงาน | หลาย timer + รายงาน |
| 44 | [Kawaii](mods/mod-44-kawaii) | `/kawaii` | มาสคอตเปลี่ยนหน้าตามสถานะ Claude + kaomoji 50 แบบ | ฟังสถานะ turn/tool |
| 45 | [Celebrate](mods/mod-45-celebrate) | `/celebrate` | พลุกระดาษ + แตร ฉลองเมื่อเทสต์ผ่าน/commit/deploy | ดักผลลัพธ์ Bash + แอนิเมชัน |
| 46 | [AI Limit](mods/mod-46-ai-limit) | `/ailimit` | ดูโควตา Claude 5 ชม./7 วันแบบน่ารัก เตือนก่อนเต็ม | event `session.measure` |
| 47 | [SQLite](mods/mod-47-sqlite) | `/sqlite` | เปิดฐานข้อมูล SQLite ดูตาราง รัน SQL ส่งออก CSV | เรียก Python/CLI อย่างปลอดภัย |
| 48 | [Rainbow Friends](mods/mod-48-rainbow-friends) | `/rainbow` | ตัวละครสายรุ้งวิ่งผ่านจอ แมว ยูนิคอร์น ช้าง ปลาทอง | แอนิเมชันหลายเลน |
| 49 | [Ghost Debug](mods/mod-49-ghost-debug) | `/ghost` | ผีไทยมาบอก error พร้อมวิธีแก้ + แปล error เป็นภาษาคน | `$.ui.log` + จับ error จริง |
| 50 | [Tool Timeline](mods/mod-50-tool-timeline) | `/timeline` | จับเวลาทุก tool เติมใต้แถว + กราฟแกนต์ | แต่ง `ToolUse` / `TurnDuration` |
| 51 | [Code Critic](mods/mod-51-code-critic) | `/critic` | AI ตัวที่สองรีวิวโค้ดที่ Claude เพิ่งแก้ | `$.model.complete` + git diff |
| 52 | [Project Memory](mods/mod-52-project-memory) | `/jam` | จดสิ่งที่ Claude ควรจำ แนบให้อ่านทุกครั้ง | event `prompt.context` |
| 53 | [Git Guard](mods/mod-53-git-guard) | `/gitguard`, `/gswitch` | ถามก่อนทิ้งงาน กัน force push สำรองก่อน rm | `$.ui.ask` ใน `tool.call` |
| 54 | [Git Writer](mods/mod-54-git-writer) | `/gitmsg`, `/pr`, `/tweet` | แต่ง commit message, เขียน PR, สรุปงานเป็นโพสต์ | `$.ui.ask` + `$.ui.copy` + gh |
| 55 | [Docker Pilot](mods/mod-55-docker-pilot) | `/docker` | แดชบอร์ด container, log, Pod ที่พัง | เรียก CLI แล้วอ่าน JSON + แผงสด |
| 56 | [Dev Dictionary](mods/mod-56-dev-dictionary) | `/explain` | พจนานุกรมศัพท์ Dev 60 คำ + อธิบายคำใหม่ | `prompt.submit` + คลังในตัว |
| 57 | [Code Insight](mods/mod-57-code-insight) | `/insight` | แผนที่โปรเจกต์ เจ้าของโค้ด hotspot | อ่านประวัติ git |
| 58 | [Port Guard](mods/mod-58-port-guard) | `/portguard` | เตือนเมื่อ server ตายหรือพอร์ตถูกยึด | timer + เทียบ snapshot |
| 59 | [Spinner Arcade](mods/mod-59-spinner-arcade) | `/arcade` | แพคแมนใต้ spinner + สีปลอบใจเมื่อ error | ห่อ `Spinner` เดิม |
| 60 | [File Badges](mods/mod-60-file-badges) | `/badges` | ป้ายสีภาษาหน้าแถวไฟล์ | ห่อแถว `ToolUse` |
| 61 | [Log Fold](mods/mod-61-log-fold) | `/logfold` | พับ output ยาว แต่ดึง error ขึ้นมาให้เห็น | วาด `ToolResult` ใหม่ |
| 62 | [Session Bridge](mods/mod-62-session-bridge) | `/bridge` | ส่งข้อความ/งานล่าสุดข้ามหน้าต่าง Claude | `$.session.send` + `session.receive` |
| 63 | [Progress Plant](mods/mod-63-progress-plant) | `/plant` | ต้นไม้โตตามโค้ดที่เขียนวันนี้ | `$.ui.status` + `$.store` |
| 64 | [Focus Aura](mods/mod-64-focus-aura) | `/aura` | ออร่าโฟกัสพาสเทลระหว่าง Claude ทำงาน | ห่อ `AbovePrompt` |
| 65 | [Prompt Coach](mods/mod-65-prompt-coach) | `/coach` | ถามกลับเมื่อ prompt กำกวมก่อนส่งให้ Claude | แก้ `prompt.submit` + `$.ui.ask` |
| 66 | [Test Fixer](mods/mod-66-test-fixer) | `/fixtests` | รันเทสต์ ให้ Claude แก้ แล้ววนจนผ่าน (มีเบรก) | `turn.complete` + `$.prompt.submit` |
| 67 | [Log Heatmap](mods/mod-67-log-heatmap) | `/heatmap` | แผนที่ความร้อนของ log: พังช่วงไหน error อะไรบ่อย | parse log + แผงสี |
| 68 | [Matrix Rain](mods/mod-68-matrix-rain) | `/matrix` | ฝนตัวอักษรแบบ The Matrix + ถอดรหัสข้อความ | Raster / SVG แอนิเมชัน |
| 69 | [Aquarium](mods/mod-69-aquarium) | `/aquarium` | ตู้ปลาเคลื่อนไหว ให้อาหาร เพิ่มปลา | Raster / SVG แอนิเมชัน |
| 70 | [Screensaver](mods/mod-70-screensaver) | `/screensaver` | ภาพพักหน้าจอ 5 ฉาก เปิดเองเมื่อว่าง | 3D / metaballs / ฟิสิกส์ |
| 71 | [Retro Arcade](mods/mod-71-retro-arcade) | `/arcade-play` | Pong Breakout Flappy เล่นในแผง | game loop + hotkey |
| 72 | [Puzzle Box](mods/mod-72-puzzle-box) | `/puzzle` | 2048 และ Minesweeper ในแผง | อัลกอริทึมเกม + hotkey |
| 73 | [Typing Racer](mods/mod-73-typing-racer) | `/typing` | แข่งพิมพ์โค้ด/ไทย/อังกฤษ วัด WPM | element `Input` + onInput |
| 74 | [Code Diagram](mods/mod-74-code-diagram) | `/diagram` | flowchart / class diagram / ผัง import จากโค้ด | Haiku + กราฟ import |
| 75 | [Image View](mods/mod-75-image-view) | `/view` | ดูรูปในแผง + pixel art + ให้ Claude วิเคราะห์ภาพ | element `Image` / SVG |
| 76 | [Git Graph](mods/mod-76-git-graph) | `/gitgraph` | กราฟ git สีตามเลน + สรุป branch | git log --graph + สี |
| 77 | [System Monitor](mods/mod-77-system-monitor) | `/sysmon` | กราฟ CPU / RAM สด + โปรแกรมที่กินแรม | `$.process.spawn` สตรีม |
| 78 | [Token Map](mods/mod-78-token-map) | `/tokenmap` | ไฟล์ไหนกิน context มาก + ที่ Claude อ่านจริง | ขนาดไฟล์ + ผล Read |
| 79 | [Live Diff](mods/mod-79-live-diff) | `/livediff` | จอแยก: diff สด + ผลลัพธ์คำสั่งล่าสุด | สองแผง `$.ui.open` |
| 80 | [Context Keeper](mods/mod-80-context-keeper) | `/ctx` | % context + นับถอยหลัง cache เย็น, แนะนำ compact, บันทึกส่งต่องาน | `session.measure`, `$.session.compact`, `$.model.fork` |
| 81 | [Prompt Queue](mods/mod-81-prompt-queue) | `/after`, `/aside` | คิวงานส่งต่อเองเมื่อ Claude ตอบเสร็จ + ถามข้างทางในแผง | `$.prompt.submit`, `turn.complete`, `$.model.fork` |
| 82 | [Plan Progress](mods/mod-82-plan-progress) | `/plan` | แถบความคืบหน้าแผนงาน (todo) ของ Claude + เวลาแต่ละข้อ | ดัก `TodoWrite` |
| 83 | [Output Diet](mods/mod-83-output-diet) | `/diet` | ตัด output Bash ยาวก่อนส่งให้ Claude ประหยัด token | แก้ผลของ tool ด้วย `next(e)` |
| 84 | [Time Machine](mods/mod-84-time-machine) | `/tm` | ไทม์ไลน์ทุกการแก้ไฟล์ ดู diff และ undo ทีละขั้น | snapshot ก่อน/หลัง `tool.call` |
| 85 | [Loop Detective](mods/mod-85-loop-detective) | `/detective` | จับคำสั่งพังซ้ำ แก้ไปแก้กลับ แล้วบอก Claude ให้หยุดคิด | `context` ในผลของ tool, `{ deny }` |
| 86 | [Next Steps](mods/mod-86-next-steps) | `/next` | เดา prompt ถัดไป 3 ข้อ กด 1-3 ใช้ได้เลย | `prompt.edit`, `$.prompt.suggest` |
| 87 | [Secret Veil](mods/mod-87-secret-veil) | `/veil` | ปิด secret ในผลของ tool ก่อนถึง Claude ใส่ค่าจริงกลับตอนรัน | แก้ทั้ง input และ result ของ tool |
| 88 | [Session Wrapped](mods/mod-88-session-wrapped) | `/wrapped` | สรุป session แบบ Spotify Wrapped + การ์ด HTML | เก็บสถิติจากหลาย event |
| 89 | [Achievements](mods/mod-89-achievements) | `/badges` | ปลดล็อกความสำเร็จ 31 อย่าง เก็บข้าม session | `$.store` สะสม |
| 90 | [Boss Fight](mods/mod-90-boss-fight) | `/boss` | เทสต์พัง = บอสผีไทยโผล่ แก้ได้ = ฟาด ผ่านหมด = KO | อ่านผลเทสต์ + แถบเคลื่อนไหว |
| 91 | [Where Am I](mods/mod-91-where-am-i) | `/where` | เข็มทิศงาน: เป้าหมาย เสร็จแล้ว รอคุณ ต่อไป | `$.model.complete` หลังจบ turn |
| 92 | [Changes Receipt](mods/mod-92-changes-receipt) | `/receipt` | ใบเสร็จทุกรอบ: สร้าง แก้ ลบ รวมผ่าน shell | `$.ui.log` ลงบทสนทนา |
| 93 | [Collision Guard](mods/mod-93-collision-guard) | `/collision` | ถามก่อนแก้ไฟล์ที่ Claude อีกหน้าต่างเพิ่งแก้ | สมุดกลาง + `$.ui.ask` |
| 94 | [Quick Prefix](mods/mod-94-quick-prefix) | `+` `_` `~` | นำหน้า prompt: คิดเต็มที่ / Haiku / ประหยัด รอบเดียว | `turn.step` async generator |
| 95 | [MD Preview](mods/mod-95-md-preview) | `/md` | ดู Markdown ที่ Claude แก้แบบเรนเดอร์ ก่อน/หลัง | `Markdown` element |
| 96 | [Reminders](mods/mod-96-reminders) | `/remind` | ตั้งเตือนข้าม session ส่งงานให้ Claude ตอนถึงเวลาได้ | `$.clock.every` + `$.store` |
| 97 | [CI Watch](mods/mod-97-ci-watch) | `/ci` | เฝ้า CI ของ GitHub ในแถบสถานะ ไม่เสีย token | `$.process.run` + gh |
| 98 | [Narrator](mods/mod-98-narrator) | `/narrator` | งานนานเสร็จแล้วอ่านออกเสียงสรุปให้ฟัง | `$.audio.speak` |
| 99 | [Thai News](mods/mod-99-thai-news) | `/news` | ข่าวไทยล่าสุดจาก Google News เหนือช่องพิมพ์ | `$.http.fetch` + RSS |
| 100 | [Activity Calendar](mods/mod-100-activity-calendar) | `/calendar` | 🎉 ปฏิทินกิจกรรมแบบ GitHub ข้ามทุก session + streak | ตาราง 7×26 ใน `Pane` |

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
/plugin install nokia-games-th@claude-code-mods-th
/plugin install promptpay-qr-th@claude-code-mods-th
/plugin install cyber-guard-th@claude-code-mods-th
/plugin install stripe-dashboard-th@claude-code-mods-th
/plugin install market-tracker-th@claude-code-mods-th
/plugin install dev-painkiller-th@claude-code-mods-th
/plugin install translate-docs-th@claude-code-mods-th
/plugin install seo-scanner-th@claude-code-mods-th
/plugin install status-page-th@claude-code-mods-th
/plugin install smartwatch-notify-th@claude-code-mods-th
/plugin install agent-monitor-th@claude-code-mods-th
/plugin install app-scheduler-th@claude-code-mods-th
/plugin install booking-system-th@claude-code-mods-th
/plugin install network-tool-th@claude-code-mods-th
/plugin install trip-planner-th@claude-code-mods-th
/plugin install media-playlist-th@claude-code-mods-th
/plugin install weather-forecast-th@claude-code-mods-th
/plugin install movie-finder-th@claude-code-mods-th
/plugin install dev-awake-th@claude-code-mods-th
/plugin install agent-tips-th@claude-code-mods-th
/plugin install dev-exercise-th@claude-code-mods-th
/plugin install daily-figures-th@claude-code-mods-th
/plugin install spinner-th@claude-code-mods-th
/plugin install drum-th@claude-code-mods-th
/plugin install dev-unblock-th@claude-code-mods-th
/plugin install trend-th@claude-code-mods-th
/plugin install gcloud-th@claude-code-mods-th
/plugin install mockup-th@claude-code-mods-th
/plugin install stamp-th@claude-code-mods-th
/plugin install privacy-shield-th@claude-code-mods-th
/plugin install timer-th@claude-code-mods-th
/plugin install kawaii-th@claude-code-mods-th
/plugin install celebrate-th@claude-code-mods-th
/plugin install ai-limit-th@claude-code-mods-th
/plugin install sqlite-th@claude-code-mods-th
/plugin install rainbow-friends-th@claude-code-mods-th
/plugin install ghost-debug-th@claude-code-mods-th
/plugin install tool-timeline-th@claude-code-mods-th
/plugin install code-critic-th@claude-code-mods-th
/plugin install project-memory-th@claude-code-mods-th
/plugin install git-guard-th@claude-code-mods-th
/plugin install git-writer-th@claude-code-mods-th
/plugin install docker-pilot-th@claude-code-mods-th
/plugin install dev-dictionary-th@claude-code-mods-th
/plugin install code-insight-th@claude-code-mods-th
/plugin install port-guard-th@claude-code-mods-th
/plugin install spinner-arcade-th@claude-code-mods-th
/plugin install file-badges-th@claude-code-mods-th
/plugin install log-fold-th@claude-code-mods-th
/plugin install session-bridge-th@claude-code-mods-th
/plugin install progress-plant-th@claude-code-mods-th
/plugin install focus-aura-th@claude-code-mods-th
/plugin install prompt-coach-th@claude-code-mods-th
/plugin install test-fixer-th@claude-code-mods-th
/plugin install log-heatmap-th@claude-code-mods-th
/plugin install matrix-rain-th@claude-code-mods-th
/plugin install aquarium-th@claude-code-mods-th
/plugin install screensaver-th@claude-code-mods-th
/plugin install retro-arcade-th@claude-code-mods-th
/plugin install puzzle-box-th@claude-code-mods-th
/plugin install typing-racer-th@claude-code-mods-th
/plugin install code-diagram-th@claude-code-mods-th
/plugin install image-view-th@claude-code-mods-th
/plugin install git-graph-th@claude-code-mods-th
/plugin install system-monitor-th@claude-code-mods-th
/plugin install token-map-th@claude-code-mods-th
/plugin install live-diff-th@claude-code-mods-th
/plugin install context-keeper-th@claude-code-mods-th
/plugin install prompt-queue-th@claude-code-mods-th
/plugin install plan-progress-th@claude-code-mods-th
/plugin install output-diet-th@claude-code-mods-th
/plugin install time-machine-th@claude-code-mods-th
/plugin install loop-detective-th@claude-code-mods-th
/plugin install next-steps-th@claude-code-mods-th
/plugin install secret-veil-th@claude-code-mods-th
/plugin install session-wrapped-th@claude-code-mods-th
/plugin install achievements-th@claude-code-mods-th
/plugin install boss-fight-th@claude-code-mods-th
/plugin install where-am-i-th@claude-code-mods-th
/plugin install changes-receipt-th@claude-code-mods-th
/plugin install collision-guard-th@claude-code-mods-th
/plugin install quick-prefix-th@claude-code-mods-th
/plugin install md-preview-th@claude-code-mods-th
/plugin install reminders-th@claude-code-mods-th
/plugin install ci-watch-th@claude-code-mods-th
/plugin install narrator-th@claude-code-mods-th
/plugin install thai-news-th@claude-code-mods-th
/plugin install activity-calendar-th@claude-code-mods-th
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
