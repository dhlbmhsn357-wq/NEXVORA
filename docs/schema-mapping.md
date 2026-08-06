# محرّك الـMapping الذكي والتحويل الدلالي — Schema Mapping & Semantic Transformation

المرحلة ٢ من **Migration Intelligence Platform**. إذا كانت المرحلة ١ «فهم
النظام القديم»، فالمرحلة ٢ «فهم **كيف** يتحوّل القديم إلى الجديد».

> **لا ترحيل بيانات، لا تنظيف، لا إنشاء Migration** — بناء الفهم الكامل
> للانتقال فقط. المخطّط الناتج (Migration Blueprint) هو المرجع الرسمي
> لمراحل الترحيل التالية.

## الفكرة المعمارية: النموذج القياسي (Canonical Model)

الـMapping لا يعتمد على تشابه أسماء الجداول، بل على **المعنى**. «النظام
الجديد» ليس قاعدة محدّدة، بل **نموذج معرفي قياسي** لكل مجال: كيانات قياسية
+ حقولها. فالـMapping = من أي مصدر قديم → هذا النموذج. وده اللي يخلّي
VELORA تتعامل مع أي ERP/CRM/LMS حتى لو لم تره: لا تطابق أسماء، بل تطابق
دلالي مع النموذج القياسي.

`lib/schema-mapping/canonical-model.ts` — يعرّف الكيانات القياسية (Customer،
Invoice، Order، Employee...) وحقول كلٍّ منها بمرادفاتها. قابل للتوسّع بلا
تعديل منطق.

## المعمار — `lib/schema-mapping/`

| المحرّك | الملف | نقي؟ |
|---|---|:--:|
| النموذج القياسي (هدف الـMapping) | `canonical-model.ts` | ✅ |
| مطابقة الكيانات (بالمعنى) | `entity-matcher.ts` | ✅ |
| مطابقة الحقول + split/merge/multi-source | `field-matcher.ts` | ✅ |
| قواعد التحويل (١٧ نوعًا) | `transformation-rules.ts` | ✅ |
| مطابقة العلاقات | `relationship-mapper.ts` | ✅ |
| كشف التعارضات | `conflict-detector.ts` | ✅ |
| عتبة الثقة (٩٠٪) | `confidence.ts` | ✅ |
| قوالب قابلة لإعادة الاستخدام (SAP/Odoo...) | `templates.ts` | ✅ |
| مُركِّب Migration Blueprint | `blueprint.ts` | ✅ |
| خدمة التوليد (+AI +حفظ +إصدار) | `mapping-service.ts` | — |
| سير الاعتماد + التعديل + التراجع | `approval-service.ts` | — |
| تكامل الذاكرة المؤسسية (قوالب) | `org-memory-integration.ts` | — |
| اللوحة | `dashboard.ts` | — |

## تدفّق الـMapping

```
مصدر مُحلَّل (المرحلة ١) → أحدث لقطة بنية
        ↓
buildBlueprint (حتمي بالكامل):
  ├─ matchEntities   (tbl_customer + crm_client → Customer، بالمعنى)
  ├─ matchFields     (customer_name → name، مع نوع التحويل)
  ├─ split/merge     (first+last → name، عبر جداول → multi_source)
  ├─ mapRelationships (parent_child → one_to_many بين الكيانات)
  ├─ transformationRules (date_conversion، phone_formatting، status_mapping...)
  ├─ businessRules   (Status=Closed & Payment=Paid → Completed Order)
  ├─ conflicts       (حقل بلا مقابل / حقل جديد بلا مصدر / جدول غير مستخدم)
  └─ confidence + reviewQueue (< ٩٠٪ → مراجعة بشرية إلزامية)
        ↓
تهذيب الذكاء الاصطناعي (للحقول منخفضة الثقة، ضمن النموذج القياسي فقط)
        ↓
Migration Blueprint (المرجع الرسمي) + إصدار للتاريخ والتراجع
```

## الفصل: حتمي أولًا، ذكاء اصطناعي فوقه

كل المطابقة **حتمية** ومختبَرة (نفس المدخل = نفس المخرَج). الذكاء الاصطناعي
يقترح تطابقات للحقول منخفضة الثقة/غير المطابَقة **من قائمة الحقول القياسية
فقط** — ممنوع اختراع حقول. يُطبَّق اقتراحه فقط لو رفع الثقة، ويظلّ الحقل
في قائمة المراجعة حتى يعتمده المدير.

## المراجعة والاعتماد

- أي تطابق بثقة **أقل من ٩٠٪** يدخل Review Queue ولا يُعتمد تلقائيًا.
- Director/Admin: Approve / Reject / Edit / Replace لكل تطابق.
- اعتماد المخطّط كاملًا مشروط بحسم كل التطابقات المعلّقة.
- كل حدث يُكتب في `migration_blueprint_versions` (تاريخ + تراجع).

## التعارضات (تُعرَض لا تُهمَل)

- `unmapped_old`: حقل قديم بلا نظير جديد.
- `unmapped_new`: حقل **مطلوب** في الجديد بلا مصدر قديم.
- `unused_old`: جدول قديم لم يُطابَق مع أي كيان.

## قواعد التحويل المدعومة

trim · uppercase/lowercase · text_cleaning · date_conversion ·
currency_conversion · boolean_mapping · enum_mapping · status_mapping ·
unit_conversion · encoding_conversion · phone_formatting ·
email_validation · country_normalization · address_parsing · number_parsing.

## التكامل مع الذاكرة المؤسسية

بعد اعتماد مخطّط، يُحفَظ **قالب Mapping قابل لإعادة الاستخدام** +
يُرقَّى كمرشّح خبرة مؤسسية (حاجز مراجعة المدير القائم). فإذا تكرّر نفس
نوع النظام مستقبلًا، يُقترَح القالب — الترحيل يتعلّم من كل مشروع.

## قاعدة البيانات (0084)

| الجدول | الغرض |
|---|---|
| `migration_blueprints` | المخطّط لكل مصدر + الدرجات + الحالة |
| `migration_entity_mappings` | جداول قديمة → كيان قياسي |
| `migration_field_mappings` | عمود قديم → حقل جديد + تحويل + kind |
| `migration_relationship_mappings` | العلاقات المصنَّفة |
| `migration_mapping_rules` | قواعد العمل + التدفّق |
| `migration_mapping_conflicts` | العناصر بلا مقابل |
| `migration_blueprint_versions` | تاريخ/اعتماد/تراجع |
| `migration_mapping_templates` | قوالب قابلة لإعادة الاستخدام |

## الصلاحيات

Director/Admin: توليد/تعديل/اعتماد/ترقية · Supervisor: قراءة · Executor:
لا وصول (مخفيّ في التنقّل + محروس في الإجراءات).

## الأداء

المطابقة الحتمية تعمل على البنية (لا صفوف البيانات) فهي سريعة. التوليد في
الخلفية عبر `after()`، والحفظ على دفعات (٥٠٠ صفّ) لآلاف الحقول.

## الاختبارات

| الملف | العدد | يغطّي |
|---|:--:|---|
| `schema-mapping.test.ts` | ١٦ | النموذج القياسي · مطابقة الكيانات (بالمعنى) · مطابقة الحقول · التحويلات · multi_source · العلاقات · التعارضات · القوالب · العتبة · Blueprint الحتمي |

## ثغرات معلومة — بصراحة

| البند | الحالة |
|---|---|
| مطابقة القيم الفعلية (enum على مستوى القيمة) | ⏸️ التحويل يُقترَح بنيويًا؛ خرائط القيم النهائية تُبنى في مرحلة التنظيف (Phase 3) |
| تعديل split يدوي (حقل → ٣ حقول) في الواجهة | ⏸️ الكشف جاهز؛ محرّر التقسيم اليدوي إضافة UI |
| قوالب مجال جاهزة مُسبقًا (SAP→ERP مكتمل) | ⏸️ البصمة تُكتشَف؛ محتوى القالب يتراكم من المشاريع المعتمَدة |

## الجاهزية للمرحلة ٣ (Data Quality & Cleansing Intelligence)

المخطّط المعتمَد يوفّر لكل حقل: مصدره، هدفه، **قاعدة التحويل المطلوبة**،
والتعارضات. ده بالظبط ما تحتاجه مرحلة التنظيف: تعرف أين البيانات غير
النظيفة (mixed types، القيم غير المتطابقة مع enum القياسي، الحقول الناقصة
المطلوبة) قبل أن تنظّفها. المرحلة ٢ تُنتج **خريطة التحويل**؛ المرحلة ٣
تنفّذ التنظيف وفقها.
