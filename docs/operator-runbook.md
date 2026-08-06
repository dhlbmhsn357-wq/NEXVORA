# PM Operating System — دليل التشغيل الداخلي

هذا الملف مرجع سريع لصاحب المنصة عن التوكنات الخارجية والتنبيهات والحدود الأمنية. الجمهور: فريق VELORA الداخلي فقط.

## متغيرات البيئة المطلوبة (Vercel)

| المتغير | مطلوب لـ | ملاحظات |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | كل شيء | من لوحة Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | كل شيء | من لوحة Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhooks + صفحات المشاركة العامة | **لا تعرضه للعميل أبدًا** |
| `GEMINI_API_KEY` | كل توليدات AI | Google AI Studio — يدعم عدة مفاتيح مفصولة بفاصلة أو `GEMINI_API_KEY_2`..`_10` |
| `GEMINI_API_KEY_PAID` | كل توليدات AI | مفتاح Paid Tier (Billing مفعّل) — يُجرَّب أولًا قبل مفاتيح `GEMINI_API_KEY` المجانية، اختياري |
| `GITHUB_TOKEN` | Prototype Review + Developer Handoff | Fine-grained PAT، **Read-Only فقط** |
| `TELEGRAM_BOT_TOKEN` | استقبال تسجيلات الاجتماعات + تنبيهات الدعم | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | حماية Webhook الاجتماعات | اختره بنفسك (نص طويل عشوائي) |
| `TELEGRAM_SUPPORT_CHAT_ID` | استقبال تنبيهات تصعيد الدعم | User ID أو Group ID |
| `SUPPORT_HISTORY_SIGNING_SECRET` | حماية سلامة تاريخ محادثات الـ Widget | اختياري — لو غاب، بيرجع لـ Service Role Key |

## GitHub Token — حدود مقصودة

- التوكن **واحد مشترك** لكل مشاريع VELORA. أي عضو داخلي يقدر يشغّل مراجعة على أي Repository يقدر التوكن يوصله.
- **قرار عملي**: كل عميل بيتربط بـ Repository أو منظمة GitHub مستقلة، والتوكن معاه صلاحية على المجموعة كلها فقط.
- ممنوع منح التوكن أي صلاحية `write`. لو المراجعة محتاجة تكتب على Repo، ده باج — بلّغ فورًا.

## قناة تنبيه التصعيد (Support)

- القناة الوحيدة الشغالة حاليًا: **Telegram**. الرسالة بتوصل على `TELEGRAM_SUPPORT_CHAT_ID`.
- البنية مصممة لتقبل قنوات إضافية (WhatsApp، Slack، Email) بإضافة ملف Provider واحد في `lib/notifications/channels/` وسطر تسجيل في `lib/notifications/registry.ts`. لا تعديل في `EscalationService` مطلوب.
- **مراقبة الفشل الصامت**: افتح جدول `support_observability_log` في Supabase بشكل دوري (أسبوعيًا مثلاً) وابحث عن:
  ```sql
  select event_type, message, created_at
  from public.support_observability_log
  where success = false and event_type in ('notification_delivery','escalation')
  order by created_at desc limit 50;
  ```
- الـ Case بتتحفظ في `support_requests` حتى لو التنبيه فشل — العميل شاف رد "تم تحويل طلبك" لأن الرد ثابت في الكود مش من AI.

## Rate Limiting

- الحدود الحالية على `/api/support/chat`: **20 طلب/دقيقة لكل widget_key + 20 طلب/دقيقة لكل IP**.
- لو حصلت تجاوزات كتير من نفس IP، ابحث في `rate_limit_hits` عن الـ IP وامسحه من عند العميل يدويًا لو محتاج.
- الجدول ينظف نفسه أوتوماتيكيًا (كل ضربة جديدة عندها 2% فرصة تحذف الأقدم من 24 ساعة).

## Widget History Integrity

- كل رد من `/api/support/chat` بيرجّع `historySignature` (HMAC-SHA256). الـ Widget بيرجّعه مع الطلب التالي.
- لو التوقيع مش صالح (يعني حد لعب في history الرسائل)، السيرفر بيتجاهل رسائل `assistant` المُتلاعب بيها ويعتمد بس على رسائل `customer`، وبيسجّل الحادثة في `support_observability_log` (نوع `widget_error`).

## RBAC — إدارة الأدوار

- الأدوار: `owner`, `admin`, `member`. كل مستخدم جديد بيتخلق كـ `member` أوتوماتيكيًا.
- **الأدوار الحساسة (`owner`/`admin`)** مطلوبة لـ: تغيير إعدادات AI، فحص التوكنات، الأرشفة.
- لتغيير دور مستخدم:
  ```sql
  update public.profiles set role = 'admin'
  where email = 'user@example.com';
  ```

## Meeting Retry

- لو فشلت معالجة اجتماع، افتح المشروع → تبويب الاجتماعات → افتح الاجتماع الفاشل → دوس "إعادة المحاولة".
- الـ Retry بيبدأ من آخر مرحلة ناجحة: لو التسجيل موجود بس التفريغ فشل، هيعيد التفريغ كامل. لو التفريغ ناجح والاستخراج فقط فشل، هيعيد الاستخراج بس (أسرع وأرخص).
- لو التسجيل نفسه ضاع من Storage، الـ Retry هيقول لك ترفع الملف من جديد عبر Telegram.

## Health Checks

- افتح صفحة الإعدادات → قسم "صحة التوكنات الخارجية" → دوس "فحص الكل" (متاح لـ `owner`/`admin` فقط).
- المفروض تعمل الفحص ده مرة على الأقل بعد كل تحديث لـ Environment Variables في Vercel.

## النسخ الاحتياطي وخطة الاسترجاع (Disaster Recovery)

- النظام حاليًا بيعتمد بالكامل على النسخ الاحتياطي التلقائي لـ Supabase (Point-in-Time Recovery، حسب خطة الاشتراك). مفيش نسخ احتياطي إضافي مُدار من التطبيق نفسه.
- **لو احتجت استرجاع بيانات**: من لوحة Supabase → **Database** → **Backups**. راجع خطة الاشتراك الحالية لمعرفة أقصى مدة استرجاع متاحة (Free tier عادة أقل من Pro).
- **الأرشفة مش بديل للنسخ الاحتياطي**: أرشفة مشروع (عبر زر "أرشفة" في الواجهة) بتخفيه من القوائم بس، البيانات تفضل في نفس القاعدة. الاسترجاع الحقيقي لازم يكون من نسخة Supabase الاحتياطية.
- **قبل أي عملية خطرة على القاعدة مباشرة** (تعديل SQL يدوي، Migration جديدة): يُفضّل أخذ نسخة يدوية من Supabase Dashboard قبل التنفيذ، خصوصًا لو التعديل بيمس أعمدة موجودة (مش بس إضافة أعمدة جديدة).
- ده قرار مقصود لحجم الفريق الحالي (~10 مستخدمين، عملاء محدودين) — لو عدد العملاء الحقيقيين كبر بشكل ملحوظ، يستحق التفكير في نسخ احتياطي دوري مستقل (مثلاً `pg_dump` مجدول) بدل الاعتماد الكامل على Supabase.
