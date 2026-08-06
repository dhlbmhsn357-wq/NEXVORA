# PM Operating System — Phase 1

منصة إدارة مشاريع VELORA الداخلية. هذا هو الأساس الكامل (Phase 1) المتفق
عليه: تسجيل دخول + قاعدة بيانات + إدارة عملاء محتملين (Leads) + نموذج
اكتشاف ديناميكي + Project Brain. بدون AI Agents بعد — تُضاف في Phase تالية
فوق نفس الأساس دون كسر أي شيء.

## خطوات التشغيل من الصفر

### 1) إنشاء مشروع Supabase
1. ادخل إلى [supabase.com](https://supabase.com) وأنشئ مشروعًا جديدًا.
2. من **Project Settings → API** انسخ:
   - `Project URL`
   - `anon public key`

### 2) تشغيل الـ Schema
1. من لوحة تحكم Supabase، افتح **SQL Editor**.
2. افتح الملف `supabase/migrations/0001_phase1_schema.sql` من هذا المشروع،
   انسخ محتواه بالكامل، والصقه في SQL Editor، ثم اضغط **Run**.
3. تأكد أن الرسالة النهائية "Success. No rows returned" بدون أخطاء.

راجع `docs/01-erd-phase1.md` لشرح كامل لكل جدول وسبب كل قرار تصميم.

### 3) متغيرات البيئة
1. انسخ `.env.local.example` إلى ملف جديد اسمه `.env.local`.
2. املأ القيمتين بالـ URL والـ anon key من الخطوة 1.

```bash
cp .env.local.example .env.local
```

### 4) تثبيت الحزم والتشغيل محليًا

```bash
npm install
npm run dev
```

افتح `http://localhost:3000` — سيظهر زر "تسجيل الدخول". أول مرة تدخل
بريدك الإلكتروني، هيوصلك رابط دخول (Magic Link) على البريد — اضغط عليه
وهتدخل مباشرة على `/dashboard`.

### 5) النشر على Vercel
1. ادفع هذا المشروع إلى مستودع GitHub جديد خاص بك.
2. من [vercel.com](https://vercel.com) اربط المستودع.
3. في إعدادات المشروع على Vercel، أضف نفس متغيرات `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Deploy.

## البنية

```
app/
  page.tsx                      الصفحة الرئيسية
  login/page.tsx                تسجيل الدخول (Magic Link)
  auth/callback/route.ts        استقبال رابط الدخول
  dashboard/
    layout.tsx                  الهيدر والتنقل
    page.tsx                    نظرة عامة (إحصائيات)
    leads/                      إدارة العملاء المحتملين
    projects/
      page.tsx                  قائمة المشاريع
      [id]/
        page.tsx                 تفاصيل المشروع
        discovery-form-editor.tsx  الفورم الديناميكي
        project-brain.tsx          Project Brain

lib/
  supabase/                     عملاء Supabase (browser/server/middleware)
  types/database.ts             أنواع TypeScript مطابقة للـ schema
  discovery-form/questions.ts   تعريفات أسئلة الفورم الديناميكي

supabase/migrations/            ملفات SQL
docs/                           التوثيق (ERD وقرارات التصميم)
proxy.ts                        حماية مسارات /dashboard (يتطلب تسجيل دخول)
```

## أهم القرارات التقنية (وسبب كل واحد)

راجع `docs/01-erd-phase1.md` لتفاصيل كاملة. ملخص سريع:

- **RLS بسيط الآن، قابل للتوسع لاحقًا**: أي مستخدم داخلي مسجّل دخوله يقدر
  يشوف ويعدّل كل شيء. هذا مقصود لأن الفريق كله داخلي حاليًا (حتى 10
  أشخاص). سياسات إضافية (مثل عميل يشوف مشروعه فقط) ستُضاف كسياسات جديدة
  فوق نفس الجداول دون كسر شيء.
- **إجابات الفورم كـ jsonb**: لأن الأسئلة تختلف حسب نوع المشروع (موقع/
  تطبيق/SaaS/Dashboard)، استخدمنا عمود مرن بدل عمود لكل سؤال.
- **Project Brain كمفهوم لا كجدول ضخم**: كل الجداول مرتبطة بـ `project_id`
  واحد؛ صفحة تفاصيل المشروع تجمعها كلها — هذا هو "مصدر الحقيقة الواحد".

## الخطوة التالية (Phase 2)

بعد اعتماد Phase 1 والتأكد من عمله فعليًا مع بيانات حقيقية، الخطوات
التالية المخطط لها (بدون بناء أي منها الآن):

1. جداول الاجتماعات (`meetings`, `transcripts`) ومعالجة التسجيلات.
2. AI Provider Layer (طبقة عزل مزوّدي الذكاء الاصطناعي) — قبل أي Agent فعلي.
3. أول AI Agent فعلي (التحليل الذكي) فوق طبقة الـ Provider.
4. باقي الـ Agents، الـ PRD التوليدي، Prototype Generator، وما بعدها.
