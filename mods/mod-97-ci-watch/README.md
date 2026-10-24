# Mod 97: CI Watch TH

เฝ้า CI ของ GitHub ในแถบสถานะ ไม่เสีย token: ถาม `gh` ทุก 1 นาทีแล้วแสดง ⏳ 3/5 · ✅ 5/5 · ❌ 1 พัง จบแล้วเด้ง toast และหยุดเอง Claude สั่ง `git push` หรือ `gh pr create` สำเร็จจะเริ่มเฝ้าให้อัตโนมัติ ไม่มี PR ก็เฝ้า GitHub Actions run ล่าสุดของ branch แทน

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `/ci` | เฝ้า PR ของ branch ปัจจุบัน |
| `/ci <เลข PR>` | เฝ้า PR นั้น |
| `/ci list` | ดูทุก check |
| `/ci stop` | หยุดเฝ้า |
| `/ci auto on\|off` | เริ่มเฝ้าเองหลัง Claude push |
| `/ci autofix on\|off` | CI พังแล้วส่งงานให้ Claude อ่าน log และแก้ |

## ติดตั้ง

```
/plugin install ci-watch-th --marketplace tksoft11/claude-code-mods-th
```

ต้องตั้ง `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` ก่อนเปิด `claude` (ดู [README หลัก](../../README.md))

## โค้ดสอนอะไร

เปิด [hooks/register.tsx](hooks/register.tsx) แล้วอ่านตามบทที่เขียนไว้ในคอมเมนต์:

1. ถาม `gh pr checks` / `gh run list` ด้วย `$.process.run`
2. วนถามทุก 1 นาทีจนจบ
3. Claude push แล้วเริ่มเฝ้าให้เอง

## หมายเหตุ

ต้องติดตั้ง [GitHub CLI](https://cli.github.com) และ `gh auth login` แล้ว
