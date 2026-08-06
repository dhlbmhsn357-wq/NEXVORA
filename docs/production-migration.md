# مركز الترحيل الحقيقي — Enterprise Production Migration Engine

المرحلة ٦ من **Migration Intelligence Platform**. تنفيذ الترحيل الحقيقي بأمان.

> **Production Migration is a Mission Critical Operation.** كل عملية:
> Safe · Recoverable · Auditable · Incremental · Repeatable · Zero Data Loss.
> **لا تبدأ إلا بعد محاكاة معتمَدة غير محظورة (المرحلة ٥) + نسخة احتياطية
> إلزامية + اجتياز كل فحوص ما قبل التنفيذ.**

## البناء فوق المراحل ١-٥ (لا إعادة تنفيذ)

| يستهلك | من |
|---|---|
| المحاكاة المعتمَدة غير المحظورة (بوابة البدء) | المرحلة ٥ (0087) |
| الخطة (كيانات + قواعد + علاقات) عبر `buildSimulationPlan` | `lib/simulation/plan-builder` |
| محرّك التحويل المعتمَد (`transformRow`/`decideRow`) | المرحلة ٤ |
| الطابور (checkpoint/resume/retry) | 0073 (`lib/queue`) |
| الإشعارات / RBAC / التخزين | `lib/notifications` · `lib/auth/rbac` · `lib/storage` |
| ترقية الخبرات | الذاكرة المؤسسية (0082) |

## المعمار — `lib/production-migration/`

**نواة نقية حتمية:** `execution-types` · `preflight` (١٢ فحصًا) ·
`dependency-order` (فرز طوبولوجي + كسر دورات) · `chunk-planner` ·
`execution-core` (`executeChunk` يعيد استخدام المرحلة ٤) · `recovery`
(تصنيف الأخطاء + قرار) · `rollback-plan` (ترتيب عكسي) · `audit` (تنقية
الأسرار) · `monitoring` (لقطة + تنبيهات).

**خدمات:** `preflight-service` · `backup-service` (نسخة إلزامية + استرجاع)
· `execution-service` (المحرّك) · `rollback-service` · `monitoring-service`
· `recovery-service` (AI) · `org-memory-integration` · `reports` · `dashboard`
· `storage` · `notify`. **معالج طابور:** `lib/queue/handlers/migration.ts`.

## التدفّق

```
بوابة (محاكاة معتمَدة غير محظورة)
  → نسخة احتياطية إلزامية (Backup)
  → فحوص ما قبل التنفيذ (١٢ فحصًا حاجزًا/تحذيريًا)
  → خطة التبعية + الدفعات + المهام
  → running (خلفي) → دفعات مرتّبة بالتبعية، متوازية داخل المستوى
  → معالجة أخطاء محلية (Retry → Review، دون إيقاف العملية)
  → finalize → إشعار + حزمة تراجع + ترقية خبرات
```

## القدرات المُنفَّذة

- **Pre-Migration Validation** — ١٢ فحصًا: محاكاة معتمَدة · درجة · بلا منع ·
  نسخة احتياطية · تراجع جاهز · قاعدة/تخزين متاحان · قرص/ذاكرة · طابور/عمّال ·
  خدمات. أي فحص حاجز فاشل يمنع الترحيل تمامًا.
- **Mandatory Backup** — قبل أول سجلّ: تعريف الترحيل + القواعد المعتمَدة +
  لقطة بيانات المصدر → تخزين (رشيق: DB fallback) + Backup ID + Restore Command.
- **Chunk Processing** — حجم قابل للتعديل (١٠٠-١٠٬٠٠٠)، لا نقل دفعة واحدة.
- **Dependency Engine** — الأب قبل الابن (Customers → Invoices → Payments)؛
  فرز طوبولوجي مع كسر آمن للدورات.
- **Parallel Execution** — توازٍ داخل نفس مستوى التبعية (حدّ العمّال).
- **Smart Resume** — المهام المكتملة تُتخطّى؛ البيانات تُعاد تغذيتها من النسخة
  الاحتياطية؛ الاستئناف من آخر نقطة ناجحة بعد Pause/Crash.
- **Live Error Recovery** — تصنيف حتمي (عابر/قيد/مورد/بيانات) → Retry أو
  Review دون إيقاف العملية؛ الأخطاء غير المعروفة → **AI Recovery** (اقتراح
  مستند، لا يُطبَّق إلا بموافقة المدير).
- **Safe Stop** — Pause (بعد الدفعة الحالية) · Resume · Abort (→ تراجع آمن).
- **Live Monitoring** — تقدّم/سرعة/متبقٍّ/أخطاء/إعادات + تنبيهات (بطء/إعادات/
  ارتفاع أخطاء).
- **Rollback Package** — يُبنى أثناء التنفيذ، بترتيب عكسي (الأبناء قبل الآباء)،
  قابل للتشغيل في أي لحظة، بلا فقدان.
- **Audit Trail** — كل حدث (من بدأ/وافق/متى/ماذا تم/فشل/أُعيد) بأسرار منقّاة
  ([REDACTED]).
- **Notifications** — Director/Admin عند البدء/الإيقاف/الفشل/الاكتمال/التراجع.
- **Organizational Memory** — أفضل Batch/عمّال/مدّة/دروس → مرشّحات خبرة.
- **Reports** — Migration · Performance · Execution · Validation · Audit ·
  Rollback (تُجمَّع تلقائيًا من المشتقّات).

## قاعدة البيانات (0088)

| الجدول | الغرض |
|---|---|
| `migration_executions` | العملية + التقدّم + الخطة + الحالة |
| `migration_backups` | النسخ الاحتياطية الإلزامية |
| `migration_execution_tasks` | مهمة لكل (كيان × دفعة) — أساس الاستئناف/التوازي |
| `migration_execution_events` | سجلّ التدقيق (أسرار منقّاة) |
| `migration_preflight_checks` | فحوص ما قبل التنفيذ |
| `migration_rollback_packages` | حزم التراجع |

## الأمان والصلاحيات

Director: تحكّم كامل · Admin: تشغيل ومراقبة · Supervisor: قراءة · Executor:
لا وصول. الأسرار لا تُعرَض إطلاقًا ([REDACTED]).

## حدود معمارية معلومة — بصراحة

| البند | الحالة |
|---|---|
| الكتابة المباشرة على قاعدة إنتاج **العميل** | ⏸️ VELORA لا تحمل بيانات اتصال إنتاج العميل ولا تفتح اتصالات صادرة من Serverless (قيد أمني ثابت). المحرّك ينفّذ على البيانات المُقدَّمة عبر المحرّك المعتمَد، ويُنتج مخرَجات مُرحَّلة مُتحقَّقة + حزمة تراجع + تدقيق — الكتابة على وجهة حيّة تتبع **طبقة الاتصال المعزولة** (مثل Live Connection في المرحلة ١). |
| ترحيلات ضخمة تتجاوز مهلة Serverless | ⏸️ التنفيذ الخلفي (`after()`) مناسب للعيّنات؛ للترحيلات الكبيرة يُشغَّل عبر **مسار الطابور** (`migration.execute` على وقت تشغيل العامل 0073) بنفس الاستئناف. |
| Conflict Resolution للتغيّر أثناء الترحيل | ⏸️ يُكتشَف ويُحال للمراجعة (لا قرار تلقائي)؛ الدمج التفاعلي إضافة لاحقة. |

## الجاهزية للمرحلة ٧ (Post-Migration Verification & Business Acceptance)

المرحلة ٦ تُنتج **ترحيلًا مُنفَّذًا ومُدقَّقًا** (مخرَجات + تقارير + حزمة تراجع +
سجلّ تدقيق كامل + خبرات مؤسسية). هذا مدخل التحقّق بعد الترحيل: Phase 7 تقارن
المُرحَّل بالمصدر على أرض الواقع وتُصدر قبول الأعمال. **جاهز للانتقال للمرحلة ٧.**
