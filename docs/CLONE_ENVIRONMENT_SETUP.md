# NEXVORA — دليل إعداد Environment Variables

**قاعدة صارمة:** كل مفتاح في هذا الملف يجب أن يكون **جديدًا** ومنفصلًا تمامًا عن VELORA/pm-os. لا تنسخ أي قيمة إنتاج من النسخة الأصلية.

---

## 1. Supabase (أساسي — إلزامي)

| المتغير | الوصف | من أين |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عنوان مشروع Supabase | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح Auth عام (آمن للـ client) | نفس الصفحة → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح خدمة (**سرّي جدًا**، خادم فقط) | نفس الصفحة → service_role secret |

**خطوات:**
1. أنشئ مشروع Supabase جديد على [supabase.com](https://supabase.com) باسم `nexvora` (أو ما تختاره).
2. Region: الأقرب لمستخدميك.
3. انسخ القيم الثلاث.
4. طبّق migrations: `supabase db push` أو من SQL Editor.

---

## 2. Gemini AI (أساسي للتحليل)

| المتغير | الوصف |
|---|---|
| `GEMINI_API_KEY` | مفتاح Google AI Studio (Free tier) |
| `GEMINI_API_KEY_PAID` | (اختياري) مفتاح مدفوع لسعة أعلى |

**من أين:** [aistudio.google.com](https://aistudio.google.com) → API Keys → Create.

**قاعدة أمان:** الحصة (quota) لكل مشروع Google Cloud، مش لكل مفتاح. أنشئ مشروع Google Cloud جديد لـ NEXVORA لتفادي مشاركة الحصة مع VELORA.

---

## 3. WhatsApp (اختياري — لو محتاج تنبيهات WhatsApp)

اختر **واحد فقط** من التالي:

### أ) Meta WhatsApp Business
| المتغير | من أين |
|---|---|
| `WHATSAPP_META_ACCESS_TOKEN` | Meta Developer → App → Access Token |
| `WHATSAPP_META_PHONE_NUMBER_ID` | نفس الصفحة → Phone Number ID |
| `WHATSAPP_META_APP_SECRET` | App Settings → App Secret |
| `WHATSAPP_META_VERIFY_TOKEN` | قيمة تختارها بنفسك للـ webhook |

### ب) Twilio
| المتغير | من أين |
|---|---|
| `WHATSAPP_TWILIO_ACCOUNT_SID` | Twilio Console → Dashboard |
| `WHATSAPP_TWILIO_AUTH_TOKEN` | نفس الصفحة |
| `WHATSAPP_TWILIO_FROM` | رقم WhatsApp المرسل |

---

## 4. Secrets عشوائية (حرجة)

هذه القيم **يجب** أن تُولَّد جديدة، ليست منسوخة من أي مكان:

| المتغير | كيف تُولَّد | الاستخدام |
|---|---|---|
| `CRON_SECRET` | `openssl rand -hex 32` | حماية `/api/cron/*` endpoints |
| `MIGRATION_SECRET_KEY` | `openssl rand -hex 32` | **حرج جدًا** — يشفّر أسرار المستخدمين المخزّنة في DB (AES-256-GCM). فقدانه = فقدان قدرة فكّ تشفير كل الأسرار المخزّنة. |

**⚠️ `MIGRATION_SECRET_KEY`:** احتفظ بنسخة من هذا المفتاح في مكان آمن (Password manager). لو ضاع أو تغيّر، لن تستطيع فكّ تشفير أي سرّ مخزّن.

---

## 5. إعدادات النشر (لاحقًا)

عند ربط Vercel و Railway بمستودع NEXVORA، **يجب** إضافة كل المتغيرات أعلاه في:

- **Vercel:** Project Settings → Environment Variables (اختر Production + Preview)
- **Railway:** Service → Variables

---

## قائمة تحقق سريعة قبل التشغيل

- [ ] مشروع Supabase جديد ومنفصل تمامًا
- [ ] `NEXT_PUBLIC_SUPABASE_URL` مختلف عن URL مشروع VELORA
- [ ] مفتاح Gemini جديد (يفضّل من مشروع Google Cloud جديد)
- [ ] `MIGRATION_SECRET_KEY` جديد ومحفوظ في مكان آمن
- [ ] `CRON_SECRET` جديد
- [ ] لا يوجد أي مفتاح مشترك بين `.env.local` هذا وبين VELORA
- [ ] `.env.local` مضاف في `.gitignore` (مضاف بالفعل ✅)
