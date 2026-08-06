# NEXVORA — Independent Clone Report

## معلومات الاستنساخ

- **تاريخ الاستنساخ:** 2026-08-06
- **الاسم الجديد:** NEXVORA
- **الاسم الأصلي:** VELORA PM Operating System (pm-os)
- **طريقة الاستنساخ:** الخيار A — Fresh Independent Repository (تاريخ نضيف من الصفر)
- **Source commit المرجعي:** `19f0a26` (fix(discovery-analysis): self-repair empty evidence arrays)
- **Source branch:** `feat/executive-delivery`
- **Source path:** `C:\Users\Muhsin Dahlab\Downloads\product manager\pm-os-phase1`
- **Destination path:** `C:\Users\Muhsin Dahlab\Downloads\NEXVORA`
- **Source repo (للمرجع فقط، غير مربوط):** `github.com/teachermohsenashraf-hue/pm-os`
- **New repo:** `github.com/teachermohsenashraf-hue/NEXVORA`

## ما تم نسخه

كل ملفات الكود والتوثيق والاختبارات والـ migrations وconfig:
- `app/`, `lib/`, `components/`, `public/`, `docs/`, `scripts/`, `services/`
- `supabase/migrations/` (116 migration)
- `.claude/` (سياق التطوير)
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.*`, `vercel.json`
- `.gitignore`, `.env.local.example`

## ما لم يُنسخ (بقصد)

| البند | السبب |
|---|---|
| `.git/` | خيار A: تاريخ نضيف من الصفر |
| `node_modules/` | يُعاد التثبيت بـ `npm install` |
| `.next/` | build artifact |
| `.vercel/`, `.turbo/` | ربط منصات النشر — يجب أن يُعاد من الصفر |
| `.env.local`, `.env`, `.env.production` | أسرار حقيقية — ممنوع نقلها |
| `backups/` | نسخ احتياطية لبيانات إنتاج |
| `*.log` | سجلات تشغيل محلية |

## الهوية البصرية

- **قرار مبدئي:** الحفاظ على هوية "VELORA" في الشعار والاسم البصري.
- **يُعاد النظر لاحقًا:** لو النسخة الجديدة ستُطلق كمنتج مستقل بهوية مختلفة.

## الخدمات التي يجب فصلها قبل التشغيل الفعلي

جميع الخدمات التالية **يجب** أن تكون مستقلة تمامًا عن VELORA:

1. **Supabase** — مشروع جديد كامل (Database + Auth + Storage + Realtime)
2. **Vercel** — مشروع نشر جديد
3. **Railway** — مشاريع Workers جديدة
4. **Gemini API** — مفتاح جديد (لتفادي مشاركة الحصة)
5. **WhatsApp** — تطبيق Meta جديد أو رقم Twilio جديد
6. **CRON_SECRET** و **MIGRATION_SECRET_KEY** — قيم جديدة تولَّد بـ `openssl rand -hex 32`

تفاصيل كل متغير في `docs/CLONE_ENVIRONMENT_SETUP.md`.

## قواعد أمان دائمة

- **ممنوع** استخدام أي مفتاح من مفاتيح VELORA في NEXVORA.
- **ممنوع** تشغيل migrations على قاعدة بيانات VELORA من هذا المجلد.
- **ممنوع** ربط `origin` هذا المجلد بمستودع pm-os الأصلي.
- عند أي شك في تسرّب مفتاح: دوّره فورًا (rotate) في مصدره الأصلي.

## طريقة التشغيل المحلي (بعد إعداد المفاتيح الجديدة)

```bash
cd C:\Users\Muhsin Dahlab\Downloads\NEXVORA
npm install
# املأ .env.local بقيم مشروع Supabase الجديد
npm run dev
```

## Isolation Verification

قبل أول push، تم التحقق من:

- [x] لا يوجد `.git` مربوط بأي remote (بعد `git init`)
- [x] لا توجد ملفات `.env` حقيقية في المجلد
- [x] لا يوجد `node_modules` (يُعاد التثبيت)
- [x] لا يوجد `backups/`
- [ ] `git remote -v` يشير فقط لـ NEXVORA — **يُتحقق بعد `git init` و `remote add`**

## Rollback

لو أردت التخلي عن هذا المجلد لأي سبب:
```bash
# آمن تمامًا — لا يمس النسخة الأصلية
rm -rf "C:\Users\Muhsin Dahlab\Downloads\NEXVORA"
# ثم على GitHub: احذف المستودع من الواجهة أو
# gh repo delete teachermohsenashraf-hue/NEXVORA --confirm
```
