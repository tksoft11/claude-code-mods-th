/**
 * ============================================================================
 * MOD 49: Ghost Debug TH - ผีไทยมาบอก Error (ฉบับสอนทำ)
 * ============================================================================
 * แรงบันดาลใจจาก: ความเชื่อเรื่องผีไทย/อีสาน + ความหลอนของบั๊ก
 * "บ่แม่นผีหลอก แต่บั๊กหลอก!"
 *
 * หน้าที่ของ Mod นี้:
 * 1. ดูผลลัพธ์คำสั่ง Bash ที่ Claude รัน ถ้าพัง จะจับคู่ข้อความ error กับ "ผีประจำบั๊ก" 13 ตน
 *    แล้วเขียนบรรทัดเตือนลงแชต (คุณเห็น แต่ไม่ส่งให้โมเดล) พร้อมสาเหตุและวิธีแก้
 * 2. ปราบผีได้: ถ้าคำสั่งเดิมรันผ่านในภายหลัง นับเป็น "ปราบสำเร็จ" ได้บุญ
 * 3. /ghost explain - ให้ Claude (Haiku) แปล error ล่าสุดเป็นภาษาคน สั้นๆ
 * 4. ทำเนียบผี + ค่าบุญบารมี
 */

import type { EngineInterface, Register } from 'claude-code'

interface Ghost {
  name: string
  bug: string
  emoji: string
  color: string
  patterns: RegExp
  symptom: string
  cause: string
  fix: string
  chant: string
  isan: string
  debug: string
}

// ==========================================================================
// บทที่ 1: ทำเนียบผี - แต่ละตนผูกกับรูปแบบข้อความ error จริง
// ==========================================================================
const GHOSTS: Record<string, Ghost> = {
  krasue: {
    name: 'กระสือ',
    bug: 'Memory Leak / หน่วยความจำหมด',
    emoji: '🫀',
    color: '#ff4757',
    patterns: /heap out of memory|JavaScript heap|MemoryError|OOMKilled|Cannot allocate memory|out of memory|std::bad_alloc/i,
    symptom: 'แรมไหลบ่หยุด คือกระสือกินไก่ตอนกลางคืน โปรแกรมบวมขึ้นเรื่อยๆ จน OOM!',
    cause: 'ลืม unsubscribe, ลืม clearInterval, cache บ่มี TTL, useEffect บ่ cleanup คือเฮ็ดนาแล้วบ่ถอนหญ้า',
    fix: 'ใส่ cleanup function, ใช้ WeakRef, ใส่ LRU cache, ถ่าย heap snapshot เทียบกัน เหมือนหมอผีตรวจรอยเท้า',
    chant: 'โอม มะโม มา มะมา ปิดหู ปิดตา ปิดปาก memory!',
    isan: 'กระสือมันหิวหลาย กินแรมบ่จักอิ่ม!',
    debug: 'node --inspect + Chrome heap snapshot | npx memlab',
  },
  krahang: {
    name: 'กระหัง',
    bug: 'Build / Deploy ล้ม',
    emoji: '🧹',
    color: '#3742fa',
    patterns: /deploy(?:ment)? failed|build failed|failed to compile|Build error occurred|error during build|Command "[^"]*build[^"]*" exited/i,
    symptom: 'ในเครื่องรันได้ แต่ build/deploy แล้วตาย คือกระหังเอากระด้งบินหนีตอนกลางคืน!',
    cause: 'env บ่ตรงกัน, ลืม build arg, Dockerfile cache เก่า คือเฮือนคนละหลัง คาถาคนละบท',
    fix: 'ล็อกเวอร์ชัน Node/Python, build แบบ reproducible, docker --no-cache, ปล่อย canary ก่อน',
    chant: 'โอม กระหังเอ้ย กลับมาเด้อ กลับมา deploy โอมเพี้ยง!',
    isan: 'มันบินไปแล้วอ้าย บินไปไสแล้วบ่ฮู้!',
    debug: 'ดู log ของ CI/แพลตฟอร์ม | เทียบ node -v และ env ทั้งสองฝั่ง',
  },
  phi_pop: {
    name: 'ผีปอบ',
    bug: 'ค้าง / Timeout / ลูปไม่จบ',
    emoji: '🍽️',
    color: '#8e8e8e',
    patterns: /timed? ?out|timeout of \d+ms exceeded|ETIMEDOUT|exceeded the timeout|took too long|Killed\s*$/im,
    symptom: 'CPU ขึ้น 100% รอแล้วรออีก ผีปอบเข้าสิงลูปบ่มีทางออก วนไปจนตาย!',
    cause: 'ลูปบ่มีเงื่อนไขออก, recursion ลืม base case, ลืม await, รอ network ที่บ่ตอบ',
    fix: 'ใส่ทางออกให้ลูป ใส่ timeout ที่สมเหตุสมผล ใส่ yield ให้ Event Loop หายใจ',
    chant: 'นะโม ปราบปอบ ถอนปอบ ออก ออก ออก! Break! Break! Break!',
    isan: 'ปอบเข้าหม้อแล้ว กินบ่เซา!',
    debug: 'top / Task Manager ดู CPU | node --cpu-prof | py-spy dump',
  },
  nang_tani: {
    name: 'นางตานี',
    bug: 'API / Network หลอน',
    emoji: '🍌',
    color: '#2ed573',
    patterns: /ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|getaddrinfo|ENOTFOUND|Connection refused|Could not resolve host|\b(?:HTTP|status)\s*(?:code\s*)?(?:429|5\d\d)\b|Too Many Requests|Bad Gateway|Service Unavailable/i,
    symptom: 'เรียก API เทือเดียวกัน แต่ผลบ่คือกัน บางเทือได้ บางเทือบ่ได้ วันดีคืนดีกะหลอก!',
    cause: 'ต้นทางบ่เสถียร, ปลายทางยังบ่เปิด, DNS ผิด, โดนจำกัด rate',
    fix: 'เช็คว่าเซิร์ฟเวอร์เปิดอยู่ไหม, ใส่ retry + backoff, เคารพ 429 (Retry-After), ใส่ circuit breaker',
    chant: 'แม่ตานีเอ้ย ขอ API ดีๆ ให้ลูกหลานแหน่เด้อ สาธุ!',
    isan: 'API มื้อนี้คือผีนางตานี งามแต่ใจบ่ดี!',
    debug: 'curl -v <url> | nslookup <host> | ดู status page ของผู้ให้บริการ',
  },
  pret: {
    name: 'เปรต',
    bug: 'Stack Overflow',
    emoji: '📏',
    color: '#ff6b81',
    patterns: /Maximum call stack size exceeded|RecursionError|StackOverflowError|stack overflow|too much recursion/i,
    symptom: 'Stack สูงคือเปรต สูงลิบลิ่ว แต่ปากนิดเดียว recursion บ่มีที่จบ กรรมหนักหลาย!',
    cause: 'เรียกตัวเองบ่หยุด, JSON/object วนเป็นวง, setter เรียกตัวเอง',
    fix: 'ใส่เงื่อนไขหยุด, เปลี่ยน recursion เป็น loop, จำกัดความลึก',
    chant: 'อโหสิกรรม เปรตเอ้ย ลงมาเด้อ ลงมา iterative!',
    isan: 'สูงปานเปรต แต่กินบ่ได้จักเทือ!',
    debug: 'ดู stack trace ว่าฟังก์ชันไหนซ้ำ | console.trace()',
  },
  phi_am: {
    name: 'ผีอำ',
    bug: 'Deadlock',
    emoji: '🛌',
    color: '#5352ed',
    patterns: /deadlock|all goroutines are asleep|Lock wait timeout exceeded/i,
    symptom: 'โปรแกรมค้าง ขยับบ่ได้ คือถูกผีอำนั่งทับหน้าอก! ล็อกสองตัวแย่งกัน!',
    cause: 'ล็อกไขว้กัน A รอ B, B รอ A คือเกวียนสองเล่มเจอกันทางแคบ บ่มีไผยอมถอย',
    fix: 'กำหนดลำดับการล็อกให้ตรงกัน, ใส่ timeout, ลดขอบเขตของ transaction',
    chant: 'อย่าอำเด้อ ปล่อยเด้อ ตื่น! ตื่น! ตื่น!',
    isan: 'อำคักอำแหน่ ขยับบ่อได้!',
    debug: 'jstack | SELECT * FROM pg_locks | SHOW ENGINE INNODB STATUS',
  },
  phi_tai_hong: {
    name: 'ผีตายโหง',
    bug: 'Crash / Segfault / Panic',
    emoji: '💀',
    color: '#ffa502',
    patterns: /Segmentation fault|SIGSEGV|core dumped|panicked at|Abort trap|SIGABRT|fatal error:|Fatal Python error|EXC_BAD_ACCESS/i,
    symptom: 'ดับปุ๊บปั๊บ บ่ทันได้ร่ำลา! ตายกลางโค้ด บ่ได้สั่งเสีย!',
    cause: 'native module พัง, Rust panic, C/C++ ลืมเช็ค null, version ของ binary บ่ตรงกับระบบ',
    fix: 'ติดตั้ง native module ใหม่ (npm rebuild), อ่าน backtrace, ใส่ RUST_BACKTRACE=1, ใช้ gdb/lldb',
    chant: 'ไปสู่ที่ชอบที่ชอบเด้อ อย่ามา crash แถวนี้อีก สาธุ!',
    isan: 'ตายโหงคักๆ บ่มีไผตั้งโตทัน!',
    debug: 'RUST_BACKTRACE=1 | gdb ./app core | npm rebuild',
  },
  phi_phong: {
    name: 'ผีโพง',
    bug: 'ทรัพยากรหมด (ดิสก์ / ไฟล์ที่เปิด)',
    emoji: '🔥',
    color: '#ff7f50',
    patterns: /ENOSPC|No space left on device|EMFILE|too many open files|ENFILE|System limit for number of file watchers/i,
    symptom: 'เครื่องร้อนคือไฟโพง! ดิสก์เต็มหรือเปิดไฟล์ค้างไว้จนระบบบ่ไหว',
    cause: 'log/cache บวม, node_modules หลายชุด, watcher เปิดไฟล์เยอะเกิน',
    fix: 'ลบ cache/log ที่บ่ใช้, เพิ่ม ulimit / fs.inotify.max_user_watches, ปิด watcher ที่บ่จำเป็น',
    chant: 'ดับไฟ ดับไฟ ผีโพงเอ้ย ดับซะ!',
    isan: 'ฮ้อนคัก ฮ้อนแหน่ คือผีโพงลง!',
    debug: 'df -h | du -sh * | ulimit -n',
  },
  nang_takian: {
    name: 'นางตะเคียน',
    bug: 'Race Condition / ไฟล์ถูกล็อก',
    emoji: '🌳',
    color: '#7bed9f',
    patterns: /race condition|DATA RACE|ThreadSanitizer|EBUSY|resource busy or locked|database is locked|another git process|index\.lock|being used by another process/i,
    symptom: 'บางทีได้บางทีบ่ได้ รันเครื่องเฮาได้ รันเครื่องเพื่อนตาย คือนางตะเคียนเลือกคนสิง!',
    cause: 'สองงานแย่งไฟล์/ตัวแปรเดียวกัน, ลืม lock, โปรแกรมอื่นเปิดไฟล์ค้าง',
    fix: 'ใส่ lock / transaction, รันทีละงาน, ปิดโปรแกรมที่จับไฟล์ไว้, ลบ .git/index.lock ถ้าไม่มี git ตัวอื่นรันอยู่',
    chant: 'แม่ตะเคียนเอ้ย ให้โค้ดมันเรียงกันแหน่ อย่าแย่งกัน!',
    isan: 'แย่งกันคือผีแย่งผ้า!',
    debug: 'go test -race | ดูว่า process ไหนจับไฟล์ (Resource Monitor / lsof)',
  },
  phi_phrai: {
    name: 'ผีพราย',
    bug: 'Port ถูกยึด / Zombie Process',
    emoji: '👶',
    color: '#70a1ff',
    patterns: /EADDRINUSE|address already in use|Only one usage of each socket address|port \d+ is (?:already )?in use|defunct/i,
    symptom: 'โปรเซสเก่าตายแล้วแต่บ่ไปเกิด ยังยึดพอร์ตไว้อยู่!',
    cause: 'dev server ตัวเก่ายังรันค้าง, ปิด terminal แต่ process ลูกยังอยู่',
    fix: 'หา process ที่ใช้พอร์ตแล้วปิด (Mod 18: /pain port) หรือเปลี่ยนพอร์ต',
    chant: 'ไปเกิดเด้อลูก ไปสู่สุคติเด้อ อย่ามาลอยอยู่นี่!',
    isan: 'ตายแล้วบ่ไปไส ลอยอยู่นี่หละ!',
    debug: 'netstat -ano | findstr :3000 | lsof -i :3000',
  },
  kongkoi: {
    name: 'ผีกองกอย',
    bug: 'หาไฟล์/โมดูล/คำสั่งไม่เจอ',
    emoji: '🦶',
    color: '#a29bfe',
    patterns: /ENOENT|No such file or directory|Cannot find module|Module not found|ModuleNotFoundError|No module named|command not found|is not recognized as an internal or external command|cannot find the path/i,
    symptom: 'ผีกองกอยขาเดียวกระโดดหลงป่า หาทางบ่เจอ! path ผิด หรือของยังบ่ได้ติดตั้ง',
    cause: 'ยังบ่ npm install / pip install, พิมพ์ path ผิด, รันจากโฟลเดอร์ผิด, ลืม activate venv',
    fix: 'ติดตั้ง dependency, เช็ค cwd และตัวสะกด path, เช็คว่าคำสั่งอยู่ใน PATH',
    chant: 'กองกอยเอ้ย กระโดดกลับทางเก่าเด้อ ทางนี้แหละ!',
    isan: 'หลงป่าแล้วอ้าย บ่ฮู้ทางออก!',
    debug: 'pwd | ls | npm ls <pkg> | which <cmd> / where <cmd>',
  },
  fao_sap: {
    name: 'ผีเฝ้าทรัพย์',
    bug: 'ไม่มีสิทธิ์ (Permission / Auth)',
    emoji: '🗝️',
    color: '#ffd32a',
    patterns: /EACCES|EPERM|Permission denied|Access is denied|Unauthorized|\b401\b|\b403\b|Forbidden|authentication failed|invalid api key/i,
    symptom: 'ผีเฝ้าทรัพย์ขวางประตู บ่ให้เข้า! ไม่มีสิทธิ์อ่าน/เขียน หรือ token ใช้บ่ได้',
    cause: 'สิทธิ์ไฟล์บ่พอ, token หมดอายุหรือผิด, ไฟล์ถูกเปิดค้างโดยโปรแกรมอื่น (Windows)',
    fix: 'เช็คเจ้าของไฟล์/สิทธิ์, login ใหม่หรือเปลี่ยน token, อย่าแก้ด้วย sudo/chmod 777 แบบเหวี่ยงแห',
    chant: 'ขออนุญาตเจ้าที่เจ้าทาง ลูกช้างมาดีเด้อ!',
    isan: 'บ่ได้รับอนุญาต อย่าซิเข้าเด้อ!',
    debug: 'ls -l / icacls <file> | gh auth status | เช็ค env ของ token',
  },
  mae_nak: {
    name: 'แม่นาค',
    bug: 'null / undefined',
    emoji: '🫳',
    color: '#e84393',
    patterns: /Cannot read propert(?:y|ies) of (?:undefined|null)|undefined is not (?:a function|an object)|is not a function|NoneType' object|null pointer|NullPointerException|nil pointer dereference|AttributeError/i,
    symptom: 'แม่นาคยื่นมือยาวไปเก็บมะนาวที่บ่มี! เรียกใช้ของที่ยังเป็น null/undefined',
    cause: 'ข้อมูลยังโหลดบ่เสร็จ, ชื่อ property ผิด, API ตอบรูปแบบบ่คือที่คิด',
    fix: 'เช็คค่าก่อนใช้ (?. หรือ if), log ค่าจริงออกมาดู, กำหนด type ให้ชัด',
    chant: 'พี่มากขา ของบ่มี อย่าเอื้อมไปเอาเด้อ!',
    isan: 'เอื้อมไปเอาของบ่มี มือยาวปานใดกะบ่ได้!',
    debug: 'console.log(JSON.stringify(x)) ก่อนบรรทัดที่พัง | เปิด strictNullChecks',
  },
}

interface Stats {
  seen: Record<string, number>
  exorcised: number
}

let stats: Stats = { seen: {}, exorcised: 0 }
let enabled = true
// คำสั่งที่ยังมีผีสิงอยู่ (ถ้ารันผ่านภายหลัง = ปราบสำเร็จ)
let haunted = new Map<string, string>()
let lastError: { command: string; text: string; ghost?: string } | undefined

function detect(text: string): string | undefined {
  return Object.keys(GHOSTS).find(id => GHOSTS[id]?.patterns.test(text))
}

function karmaTitle(): string {
  const k = stats.exorcised
  if (k >= 50) return '🙏 หมอธรรมระดับเซียน'
  if (k >= 20) return '📿 หมอผีประจำหมู่บ้าน'
  if (k >= 5) return '🕯️ ลูกศิษย์หมอธรรม'
  return '🌱 มือใหม่หัดไล่ผี'
}

function log($: EngineInterface, text: string): void {
  try {
    $.ui.log(text)
  } catch {}
}

async function save($: EngineInterface): Promise<void> {
  await $.store.set('stats', stats)
}

// ==========================================================================
// บทที่ 2: ผีปรากฏตัว - บรรทัดเดียวพอ ไม่รก รายละเอียดดูด้วย /ghost <ชื่อ>
// ==========================================================================
function apparition(id: string, g: Ghost): string {
  return `${g.emoji} ${g.name}มาแล้ว! (${g.bug}) ${g.isan}\n   อาการ: ${g.symptom}\n   แก้: ${g.fix}\n   ดูเพิ่ม: /ghost ${id} · ให้ Claude แปล error: /ghost explain`
}

function detail(id: string, g: Ghost): string {
  return [
    `${g.emoji} ${g.name} — ${g.bug}`,
    `   พบแล้ว ${stats.seen[id] ?? 0} ครั้ง`,
    '',
    `😱 อาการ: ${g.symptom}`,
    `🔍 สาเหตุ: ${g.cause}`,
    `🛠️ วิธีแก้: ${g.fix}`,
    `🧪 คำสั่งช่วย: ${g.debug}`,
    `📿 คาถา: ${g.chant}`,
    `🗣️ อีสาน: ${g.isan}`,
  ].join('\n')
}

const HELP = `👻 Ghost Debug TH (Mod 49)
========================================
/ghost                 ทำเนียบผี + ค่าบุญ
/ghost <ชื่อผี>         รายละเอียด เช่น /ghost krasue
/ghost last            error ล่าสุดที่ผีมาสิง
/ghost explain         ให้ Claude แปล error ล่าสุดเป็นภาษาคน
/ghost on|off          เปิด/ปิดผี (ตอนนี้: STATE)
/ghost reset confirm   ล้างสถิติ`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    stats = { seen: {}, exorcised: 0, ...((await $.store.get('stats')) as Stats | undefined) }
    enabled = ((await $.store.get('enabled')) as boolean | undefined) ?? true
    haunted = new Map()
    await $.command.register({ name: 'ghost', description: 'ผีไทยมาบอก error: อาการ สาเหตุ วิธีแก้ และแปล error เป็นภาษาคน (/ghost help)', argumentHint: '[ชื่อผี]|last|explain|on|off' })
    return next(e)
  })

  // ==========================================================================
  // บทที่ 3: ดูผลลัพธ์ Bash - พังเมื่อไหร่ ผีมาเมื่อนั้น / ผ่านเมื่อไหร่ ปราบได้
  // ==========================================================================
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (!enabled || r.deny !== undefined) return r
    const key = e.command.trim()
    if (!r.isError) {
      const id = haunted.get(key)
      if (id) {
        haunted.delete(key)
        stats = { ...stats, exorcised: stats.exorcised + 1 }
        await save($)
        log($, `🙏 ปราบ${GHOSTS[id]?.name ?? 'ผี'}สำเร็จ! ได้บุญ +1 (รวม ${stats.exorcised}) ${karmaTitle()}`)
      }
      return r
    }
    const text = r.text ?? ''
    const id = detect(text)
    lastError = { command: key, text: text.slice(-4000), ghost: id }
    const g = id ? GHOSTS[id] : undefined
    if (id && g) {
      stats = { ...stats, seen: { ...stats.seen, [id]: (stats.seen[id] ?? 0) + 1 } }
      haunted.set(key, id)
      await save($)
      log($, apparition(id, g))
      $.ui.toast(`${g.emoji} ${g.name}: ${g.bug}`)
    }
    return r
  })

  on('command.run', { command: 'ghost' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case '': {
        const rows = Object.entries(GHOSTS).map(([id, g]) => `${g.emoji} ${g.name.padEnd(12)} ${g.bug.padEnd(30)} พบ ${stats.seen[id] ?? 0}  (${id})`)
        const total = Object.values(stats.seen).reduce((s, n) => s + n, 0)
        return { text: [`👻 ทำเนียบผีประจำบั๊ก — พบผี ${total} ครั้ง ปราบได้ ${stats.exorcised} ครั้ง ${karmaTitle()}`, '', ...rows, '', 'รายละเอียด: /ghost <id>'].join('\n') }
      }
      case 'help':
        return { text: HELP.replace('STATE', enabled ? 'เปิด' : 'ปิด') }
      case 'on':
      case 'off':
        enabled = sub === 'on'
        await $.store.set('enabled', enabled)
        return { text: enabled ? '👻 ผีกลับมาเฝ้าแล้ว' : '🙏 ผีไปพักแล้ว (/ghost on เพื่อเรียกกลับ)' }
      case 'last': {
        if (!lastError) return { text: 'ยังไม่มี error ใน session นี้ 🙏' }
        const g = lastError.ghost ? GHOSTS[lastError.ghost] : undefined
        return { text: `$ ${lastError.command}\n${lastError.text.slice(-1500)}\n\n${g ? `${g.emoji} ผีที่สิง: ${g.name} (${g.bug})` : '❓ ผีบ่ฮู้จัก — ลอง /ghost explain'}` }
      }
      case 'explain': {
        // ==================================================================
        // บทที่ 4: แปล error เป็นภาษาคนด้วย Haiku (ใช้ token นิดหน่อย จึงเรียกเมื่อสั่งเท่านั้น)
        // ==================================================================
        if (!lastError) return { text: 'ยังไม่มี error ให้แปล' }
        const system = 'คุณเป็นผู้ช่วยนักพัฒนา อธิบาย error เป็นภาษาไทยที่เข้าใจง่าย ตอบไม่เกิน 5 บรรทัด: 1) error นี้หมายความว่าอะไร 2) สาเหตุที่น่าจะเป็น 3) สิ่งที่ควรลองทำก่อน ห้ามเดาเกินข้อมูลที่ให้มา'
        const prompt = `คำสั่ง: ${lastError.command}\n\nผลลัพธ์:\n${lastError.text.slice(-3000)}`
        const g = lastError.ghost ? GHOSTS[lastError.ghost] : undefined
        for (const model of ['haiku', await $.session.model()]) {
          const r = await $.model.complete({ model, system, prompt, maxTokens: 400 }).catch(() => undefined)
          if (r?.isAnswered) return { text: `${g ? `${g.emoji} ${g.name}กระซิบว่า…` : '🔍 ถอดรหัส error'}\n\n${r.text.trim()}` }
        }
        return { text: '❌ ถาม Claude ไม่สำเร็จ ลองใหม่อีกครั้ง' }
      }
      case 'reset':
        if (rest[0] !== 'confirm') return { text: 'ล้างสถิติทั้งหมด? พิมพ์ /ghost reset confirm' }
        stats = { seen: {}, exorcised: 0 }
        await save($)
        return { text: '🧹 ล้างสถิติแล้ว' }
      default: {
        const g = GHOSTS[sub]
        return { text: g ? detail(sub, g) : `บ่ฮู้จักผี "${sub}"\n${HELP.replace('STATE', enabled ? 'เปิด' : 'ปิด')}` }
      }
    }
  })
}

/**
 * ========================================================================
 * การบ้าน / ต่อยอด
 * ========================================================================
 * 1. เพิ่มผีของคุณเอง เช่น ผีกะ = Dependency Hell (เวอร์ชันชนกัน)
 * 2. ให้ผีตามดู error ในผลลัพธ์ของ tool อื่นด้วย (เช่น MCP)
 * 3. เปิดแผงวาดผีตัวใหญ่แบบ ASCII ตอนเจอผีระดับหลอนจัด (crash, OOM)
 */
