<div dir="rtl">

# دليل تبويبات NEXVORA — من الاكتشاف إلى التسليم

> **الجمهور:** المؤسِّس + فريق العمليات + الشركاء الجدد الذين يحتاجون خريطة سريعة لصفحة المشروع.
> **المرجع:** الكود الفعلي في `app/(platform)/dashboard/projects/[id]/` و `lib/workflow-v2/registry.ts` و `lib/project-readiness/registry.ts` و `nexvora-tab-order.ts`.
> **الحالة الافتراضية:** `product_mode` مفعّل (وضع NEXVORA الكامل)، والفلاغ `extended_technical_delivery` مطفّى (الوضع الأساسي بـ ٨ مراحل).

---

## ١. نظرة عامة على دورة الحياة

### ١.١ الفلسفة
```
مشكلة عميل  →  اكتشاف موثَّق  →  تحليل + عقل مشروع  →  تعريف منتج قابل للبناء
   →  PRD + Prototype  →  مراجعة داخلية  →  عرض للعميل + موافقة  →  حزمة تسليم
```

### ١.٢ الطبقات الثلاث المتوازية داخل الكود
NEXVORA فيها ثلاث خرائط للمراحل، ومن الضروري التمييز بينها لأنها **مصدر جزء كبير من الخلط الظاهر في الترتيب**:

| الطبقة | الملف | عدد العناصر | الاستخدام |
| --- | --- | --- | --- |
| **Workflow v2 Registry** (المرحلة المنطقية للمشروع) | `lib/workflow-v2/registry.ts` | ٧ مراحل | مصدر الحقيقة لتقدّم المشروع، عناصر checklist، جاهزية Readiness. |
| **NEXVORA Tab Phases** (تجميع مرئي فقط) | `app/(platform)/dashboard/projects/[id]/nexvora-tab-order.ts` | ٨ مراحل (٩ مع Extended) | يحكم ترتيب التبويبات في `WorkflowNav`. |
| **STAGE_REGISTRY** (v1 القديم — تبويبات فردية) | `lib/workflow/registry.ts` | ~٢٣ عنصر | مصدر الأسماء والحقوق (RBAC) لكل تبويبة فردية. |

### ١.٣ المراحل السبع في Workflow v2
مصدرها `WORKFLOW_V2_REGISTRY`:

1. **client_and_project** — العميل والمشروع
2. **discovery_and_research** — الاكتشاف والبحث
3. **analysis_and_validation** — التحليل والتحقق
4. **product_definition** — تعريف المنتج
5. **prototype_and_review** — النموذج والمراجعة
6. **client_approval** — موافقة العميل
7. **handoff_and_closure** — التسليم والإغلاق

### ١.٤ مراحل التبويبات الثمانية (كما تظهر في الواجهة)
مصدرها `NEXVORA_TAB_PHASES`:

| # | مفتاح Phase | الاسم في الواجهة | التبويبات (essential/advanced) |
| --- | --- | --- | --- |
| 1 | `discovery` | الاكتشاف | discovery · analysis · research |
| 2 | `meetings` | الاجتماعات | meetings |
| 3 | `knowledge` | المعرفة والدماغ | projectBrain · *knowledgeHub* |
| 4 | `definition` | تعريف المنتج | definition · stories · traceability · decisions |
| 5 | `docs` | المستندات والنموذج | prd · prototypeStudio · *prototypePrompt* · prototypeReview · evaluation |
| 6 | `ops` | التجاري والإدارة | commercial · deliveryMilestones · *support* · *organizationalIntelligence* · *activity* |
| 7 | `approval` | اعتماد العميل | approvals |
| 8 | `delivery` | تسليم العميل | clientDelivery · handoff |
| 9 | `execution` | التنفيذ والجودة (Extended) | promptReview · engineeringQa · productionMonitoring |

*التسميات المائلة = advanced (مخفية خلف زر «إظهار المتقدمة»)*

### ١.٥ مقاييس الجاهزية الستة (Project Readiness)
مصدرها `READINESS_REGISTRY`. كل مقياس مربوط بمرحلة Workflow v2 واحدة:

| المقياس | يقيس | مرحلة v2 |
| --- | --- | --- |
| discovery_completeness | اكتمال الاكتشاف | discovery_and_research |
| problem_validation | التحقق من المشاكل | analysis_and_validation |
| product_definition_ready | جاهزية تعريف المنتج | product_definition |
| prototype_ready | جاهزية الـ Prototype | prototype_and_review |
| client_approval | موافقة العميل | client_approval |
| handoff_ready | جاهزية التسليم | handoff_and_closure |

**ملاحظة مهمة:** لا يوجد Readiness لمرحلة `client_and_project` (البداية) ولا لمرحلة Commercial منفصلة — Commercial موزَّع على أكثر من مقياس (بند `initial_contract` في stage 1، بند `commercial_agreement` في `client_approval`).

---

## ٢. تبويبات الاكتشاف والتحليل (Phase 1: discovery)

### ٢.١ Discovery — «الاكتشاف»
**الغرض:** نقطة الدخول لأي مشروع. تُنشِئ نموذج اكتشاف، ترسله للعميل عبر رابط، ثم تستقبل إجاباته.
**المكوّنات في الكود:**
- `discovery-generator-panel.tsx` — أزرار توليد النموذج + قوالب مبدئية.
- `discovery-sessions-panel.tsx` — سجل الجلسات.
- `discovery-wizard.tsx` + `discovery-form-editor.tsx` — محرر النموذج نفسه.
- `discovery-link-actions.ts` — إرسال رابط.
- `discovery-upload-action.ts` — رفع مستندات وسط الجلسة.

**المخرجات:** نموذج اكتشاف مُعتمد + إجابات العميل + مستندات مرفوعة.
**Upstream:** لا شيء (البداية).
**Downstream:** يغذّي التحليل (تبويب Analysis + Discovery Analysis) وعقل المشروع (Brain v2).
**تقييم:** يعمل جيدًا كنقطة دخول واحدة. الملفات المتعددة تبدو مرهقة عند التصفح لكن المستخدم يراها موحّدة داخل التبويبة.

### ٢.٢ نظرة عامة (Overview) — [حاليًا مفكَّك]
حسب تعليقات `nexvora-tab-order.ts` (سطر ٦٢): «overview اتفكّك: محتواه اتنقل لـ analysis + projectBrain». التبويبة القديمة لا تظهر بعد الآن كتبويبة مستقلة في وضع v2.

### ٢.٣ Analysis — «التحليل»
**الغرض:** تحليل عام للمشروع (ملخّص واحد يعتمد على الاكتشاف الأولي). موجود في `analysis-panel.tsx`.
**المخرجات:** كائن `ProjectAnalysis` — ملخّص للاستخدام كسياق.
**Upstream:** Discovery.
**Downstream:** يُقرأ كسياق للـ PRD/Prototype/Brain.
**تقييم:** هذه التبويبة **تكرار جزئي** مع «التحليل التفصيلي» في `discovery-analysis-panel.tsx` (ذلك الأخير أعمق: ١٧ قسمًا مع أدلة). القديم `analysis-panel` أبسط وأقدم. راجع القسم ١٠ للاقتراح.

### ٢.٤ Research & Validation — «البحث والتحقق»
**الغرض:** بحث السوق + تحقق من المشاكل والافتراضات. `research-panel.tsx` فيه قسمان صريحان:
- **Market Research:** منافسون / اتجاهات / شرائح / تسعير.
- **Problem Validation:** أدلة على وجود المشكلة + مؤشر جاهزية.

**المخرجات:** بنود `market_research_items` + `problem_validation_items` + أدلة موصولة.
**Upstream:** Discovery (مصدر المشاكل الأولية).
**Downstream:** يغذّي `traceability` و`stories` (كأدلة على متطلبات).
**تقييم:** موقع منطقي جدًا داخل مرحلة الاكتشاف. جيّد.

### ٢.٥ Discovery Analysis (subtab أو داخلي)
`discovery-analysis-panel.tsx` — التحليل التفصيلي بـ١٧ قسمًا وثقة لكل قسم. يظهر ضمن تبويبة `analysis` أو داخل Project Brain حسب الإعداد. راجع تعليقات `page.tsx` (Consolidation UX 2026).

---

## ٣. تبويبات الاجتماعات (Phase 2: meetings)

### ٣.١ Meetings — «الاجتماعات»
تبويبة واحدة تحوي **٣ subtabs** حسب `page.tsx:864-899`:

| Subtab | Key | ماذا يفعل | الملف |
| --- | --- | --- | --- |
| قائمة الاجتماعات | `""` | جدول كل الاجتماعات + سجل + بحث | `meetings-panel.tsx` |
| تجهيز الاجتماع | `prep` | توليد أجندة + نقاط للعميل قبل الاجتماع | `meeting-prep-panel.tsx` + `meeting-prep-essentials-panel.tsx` |
| عرض الاجتماع | `deck` | Slide deck تفاعلي + Live mode + مراجعة | `meeting-presentation-panel.tsx` + `meeting-live-mode.tsx` |

**Upstream:** Discovery (السياق) + Project Brain (كملخّص).
**Downstream:** كل اجتماع مُوثَّق → transcript → يُغذّي Project Brain + Timeline.
**تقييم:** التجميع في ٣ subtabs جيد جدًا وأنقذ ٢ تبويبات كانت منفصلة قبل Consolidation UX 2026.

---

## ٤. تبويبات المعرفة والدماغ (Phase 3: knowledge)

### ٤.١ Project Brain — «عقل المشروع»
تبويبة واحدة بـ**٣ subtabs** حسب `page.tsx:903-995`:

| Subtab | Key | ماذا يفعل |
| --- | --- | --- |
| النظرة العامة | `""` | ملخّص العقل + Open items + إعادة مزامنة (`brain-v2-panel.tsx`) |
| التوصيات | `recommendations` | توصيات AI ذكية (`smart-recommendations-panel.tsx`) |
| مراجعة الاعتماد | `review` | ٧ blockers قبل التقدم للمرحلة التالية (`brain-review-panel.tsx`) |

**المخرجات:** إصدار Brain v2 مُعتمد + توصيات مُقبولة/مرفوضة + بوابة اعتماد.
**Upstream:** Discovery + Analysis + Meetings.
**Downstream:** يُستخدم كسياق لكل مولّد AI لاحق (PRD/Prototype/Presentation).
**تقييم:** ممتاز — واحد من أقوى نقاط NEXVORA. تجميع الـ٣ subtabs منطقي.

### ٤.٢ Knowledge Hub — «مركز المعرفة» [متقدم]
**الغرض:** مرجع cross-project (تعلّم من مشاريع سابقة). `knowledge-hub-panel.tsx`.
**Downstream:** يغذّي Smart Recommendations عبر مشاريع مختلفة.
**تقييم:** تصنيفه كـ advanced صحيح — ليس ضروريًا لمشروع مفرد.

---

## ٥. تبويبات تعريف المنتج (Phase 4: definition)

### ٥.١ تعريف المنتج (Definition)
`definition-panel.tsx` — ٣ أقسام: **Personas / User Flows / Requirements (MoSCoW)**.
**المخرجات:** جداول `personas`, `flows`, `requirements`.
**Downstream:** يغذّي Stories/AC وTraceability وPRD وEvaluation.

### ٥.٢ القصص والقبول (Stories & AC)
`stories-panel.tsx` — قصص المستخدم + معايير القبول (nested).
**Upstream:** Definition (Personas/Flows/Requirements).
**Downstream:** Evaluation scenarios تربط بـ stories، PRD يشمل القصص.

### ٥.٣ الأدلة والربط (Traceability)
تبويبة بـ**٢ subtabs** (`page.tsx:1509-1534`):

| Subtab | ماذا يفعل |
| --- | --- |
| الأدلة والربط (`""`) | مصفوفة تغطية الأدلة لكل Requirement/Story/AC |
| أثر التغيير (`impact`) | ماذا يتأثر لو تغيّر شيء (Change Impact) |

**تقييم:** دمج impact كـ subtab قرار جيد — كانا يبدوان تكرارًا للمستخدم.

### ٥.٤ سجل القرارات (Decisions)
**الغرض:** قرارات المنتج + المخاطر + الافتراضات + الأسئلة المفتوحة (Product Decisions Register — 0107).
**Upstream:** كل المراحل السابقة.
**Downstream:** أدلة للاعتماد + سياق لأي إعادة مراجعة.

---

## ٦. تبويبات المستندات والنموذج (Phase 5: docs) ⚠️ **هنا أوّل مشكلة ترتيب**

### ٦.١ PRD
**الغرض:** توليد وتحرير مستند المتطلبات النهائي بأقسام قابلة للتعديل. `prd-panel.tsx`.
**Upstream:** Definition + Stories + Brain.
**Downstream:** يذهب مع Handoff Package + سياق للـ Prototype.

### ٦.٢ Prototype Studio
**الغرض:** الـ studio الحديث لبناء Prototype — Stepper من ٥ خطوات:
1. Config (النوع + المنصّة + Fidelity + Personas + Flows)
2. Design Direction
3. Context Pack (تجميع سياق deterministic)
4. Build Brief (استيراد من ChatGPT + اعتماد بشري)
5. Codex Build Pack (ZIP جاهزة للنقل)

**المخرجات:** حزمة Codex + رابط Prototype (خارجي).
**Upstream:** كل شيء قبله.
**Downstream:** Prototype Review + Client Delivery.

### ٦.٣ Prototype Prompt (Legacy) [متقدم]
**الغرض:** النظام القديم لتوليد prompt واحد كبير للـ Prototype (`prototype-prompt-panel.tsx`). صُنّف advanced لأنه استُبدل بـ Studio.
**تقييم:** تصنيفه advanced صحيح. مرشّح للحذف بعد التأكد من عدم وجود مشاريع تعتمد عليه.

### ٦.٤ Prototype Review
**الغرض:** مراجعة الـ Prototype المُنجَز مقابل القصص/AC — لكل قصة/AC يُحدَّد: منفَّذ / منفَّذ جزئيًا / منفَّذ بطريقة مختلفة / غير منفَّذ. `review-panel.tsx`.
**Upstream:** PRD + Prototype Studio + Stories/AC.
**Downstream:** يُقرأ في: Client Delivery (Presentation)، Developer Handoff، Evaluation.

### ٦.٥ دليل التقييم (Evaluation Guide)
**الغرض:** بناء سيناريوهات تقييم صريحة (Scenarios) + تسجيل نتائج تنفيذها (Runs) لكل سيناريو. `evaluation-panel.tsx`.
**البنية:** سيناريو مربوط بـ story/flow، له خطوات، نتيجة متوقّعة، severity، ثم runs متعددة.
**Upstream:** Stories + Flows.
**Downstream:** جزء من Handoff Package (بند `evaluation_guide_ready` في مرحلة `handoff_and_closure` من Workflow v2).

⚠️ **مشكلة موقع Evaluation** — تفصيلها في القسم ٩.

---

## ٧. تبويبات التجاري والإدارة (Phase 6: ops)

### ٧.١ تجاري (Commercial)
تبويبة بـ**٢ subtabs**:

| Subtab | ماذا يفعل |
| --- | --- |
| دورة الحياة (`""`) | حالة العميل + عقود + جدول دفعات (`commercial-panel.tsx` — P4) |
| العروض والباقات وطلبات التغيير (`proposals`) | Proposals بإصدارات + Change Requests + قوالب Pricing (`commercial-full-panel.tsx` — P10) |

**Upstream:** حالة المشروع بشكل عام.
**Downstream:** بند `commercial_agreement` في checklist الاعتماد + عقد أساس للـ handoff.

### ٧.٢ مراحل التسليم (Delivery Milestones)
تبويبة بـ**٣ subtabs** (`page.tsx:1447-1454`):

| Subtab | ماذا يفعل |
| --- | --- |
| المراحل (`""`) | Timeline الرئيسي + Health + Ownership (`delivery-lifecycle-panel.tsx` → `milestones-panel.tsx`) |
| لوحة المهام (`tasks`) | Kanban للمهام (`work-panel.tsx`) |
| مسؤولو المراحل (`owners`) | Stage owners + قرارات مربوطة (`_panels/stage-owners-panel.tsx`) |

**تقييم:** دمج «المهام» و«مسؤولو المراحل» كـ subtabs قرار جيد.

### ٧.٣ Support Requests [متقدم]
`support-panel.tsx` — طلبات الدعم من widget خارجي + تصعيدها إلى production incidents. مربوطة بمرحلة ما بعد الإطلاق.

### ٧.٤ الذكاء التنظيمي (Organizational Intelligence) [متقدم]
`organizational-intelligence-panel.tsx` — Product Advisor Analysis + Decision Memory (تعلّم من قرارات سابقة).

### ٧.٥ Activity [متقدم]
`activity-panel.tsx` — Timeline خام من كل مصادر التوثيق (Brain/PRD/Prototype/…). سجل عابر للمراجعة.

---

## ٨. تبويبات اعتماد العميل والتسليم (Phases 7-8) ⚠️ **هنا لبّ المشكلة**

### ٨.١ اعتماد العميل (Client Approval) — Phase 7
**الملف:** `_panels/client-approval-panel.tsx` (P11).
**الغرض:** بورتال آمن للعميل يُوقّع فيه على أهداف محدّدة: PRD / Presentation / Proposal.
**العملية:**
1. `createApprovalAction` — إنشاء طلب اعتماد بهدف (target_type + target_id + version).
2. النظام يولّد رابط مع token → يُشارَك مع العميل.
3. العميل يفتح، يقرأ، يوافق أو يرفض عبر portal عام.
4. القرار يُسجَّل مع audit trail.

**Upstream (يعتمد على):** وجود **شيء جاهز للاعتماد** — أي PRD مُنجَز، أو Client Presentation مُولَّدة، أو Proposal.
**Downstream:** بند `scope_approved` + `prototype_approved` في checklist v2 → يُطلق مرحلة Handoff.

**⚠️ ملاحظة حاسمة:** الاعتماد **لا يولّد** ما يُعرَض للعميل — الاعتماد يعتمد على وجوده. أي أن **Client Delivery/Presentation يجب أن يسبق Client Approval منطقيًا**، لكن في الترتيب الحالي `approval` phase = 7 قبل `delivery` phase = 8. هذا **معكوس**.

### ٨.٢ تسليم العميل (Client Delivery) — Phase 8, tab 1
**الملف:** `presentation-panel.tsx` (يظهر عبر مفتاح `clientDelivery`).
**الغرض:** توليد Client Presentation (PPTX + عرض تفاعلي) + رابط مشاركة + تنزيل — للـ **executive delivery meeting** مع العميل.
**العملية:**
1. `generateClientPresentation` — يولّد slides من Brain/PRD/Review.
2. `editPresentationSlide` — تحرير slide بعد التوليد.
3. `generateShareLink` / `revokeShareLink` — مشاركة مع العميل.
4. `downloadPresentationPptx` — تنزيل PPTX نهائي.

**Upstream:** Brain v2 + PRD + Prototype Review.
**Downstream:** هدف اعتماد (Approval target_type = "presentation") → يدخل بورتال Client Approval.

**⚠️ الملاحظة الحاسمة:** هذا التبويب مصنّف اليوم كـ «تسليم» لكنه فعليًا **أداة اعتماد** — العميل يشوف الـ Presentation ثم يعتمد. وضعه بعد «اعتماد العميل» في الترتيب الحالي **مخالف للتدفق الطبيعي**.

### ٨.٣ حزمة التسليم (Handoff Package) — Phase 8, tab 2
تبويبة بـ**٣ subtabs** (`page.tsx:1590-1613`):

| Subtab | ماذا يفعل | الملف |
| --- | --- | --- |
| الحزمة (`""`) | جمع/تجميد بنود Handoff + Questions + Deliveries + Package status | `_panels/handoff-panel.tsx` (P12) |
| الوثيقة التقنية (`document`) | Developer Handoff Document (أقسام قابلة للتحرير — PRD/Architecture/API/…) | `developer-handoff-panel.tsx` |
| الشركاء (`partners`) | إدارة External Partners (دعوات + صلاحيات viewer) | `_panels/partners-panel.tsx` |

**بنود Handoff Package** (من `HANDOFF_ITEM_REGISTRY`): PRD + Prototype Link + Design + Evaluation Guide + Access Credentials Ref + …
**Upstream:** كل شيء قبله (بما فيه Client Approval).
**Downstream:** الحزمة تُسلَّم للشريك التقني → قبوله يُنهي المشروع.

**تقييم:** تجميع Developer Handoff + Partners كـ subtabs قرار جيد. لكن **الحزمة تحتوي «Evaluation Guide» كبند مطلوب** — بينما دليل التقييم نفسه تبويبة منفصلة في مرحلة «المستندات». هذا يخلق **interlock مطلوب بين docs وhandoff** غير واضح للمستخدم.

---

## ٩. تقييم شامل ومشاكل الترتيب الحالي

### ٩.١ ملخّص المشاكل المُكتشَفة

| # | المشكلة | مصدر التشخيص |
| --- | --- | --- |
| **P1** | **«اعتماد العميل» يظهر قبل «تسليم العميل»** رغم أن الـ Presentation هي ما يُعتمَد عليه. | `nexvora-tab-order.ts:107-117` — phase `approval` (7) قبل `delivery` (8). |
| **P2** | **«دليل التقييم» في مرحلة «المستندات»** بينما بند `evaluation_guide_ready` معرَّف في مرحلة **handoff_and_closure** في Workflow v2. | `workflow-v2/registry.ts:160`. |
| **P3** | **«دليل التقييم» بعد «Prototype Review»** — منطقيًا سيناريوهات التقييم مصدر المراجعة. أو على الأقل تُبنى بالتوازي. | `nexvora-tab-order.ts:92`. |
| **P4** | **«تجاري» موزَّع على 3 مراحل v2** (initial_contract في stage 1، commercial_agreement في stage 6) لكن التبويبة كلّها في phase 6 (ops). | مقارنة `checklists` مع `NEXVORA_TAB_PHASES`. |
| **P5** | **فصل `approval` phase و `delivery` phase عن بعض** — مرحلتان لتبويبتَين ثم ثلاث تبويبات. تسليم العميل و اعتماد العميل شيء واحد منطقيًا. | نفس الملف. |
| **P6** | **Handoff Package يستهلك Evaluation Guide** كبند إلزامي دون رابط UI واضح للمستخدم بين التبويبتَين. | `HANDOFF_ITEM_REGISTRY` + `handoff-panel.tsx`. |
| **P7** | **`analysis` و `discovery-analysis` تكرار جزئي** — القديم بسيط، الجديد بـ١٧ قسمًا. | `analysis-panel.tsx` مقابل `discovery-analysis-panel.tsx`. |
| **P8** | **`prototypePrompt` (Legacy) لا يزال ظاهرًا** ولو advanced — تلوّث بصري ومصدر ارتباك. | `nexvora-tab-order.ts:92`. |

### ٩.٢ لماذا P1 مشكلة حقيقية؟

انظر إلى الأهداف الممكنة للاعتماد في الكود:
```ts
CREATE_APPROVAL_TARGET_TYPES = ["prd", "presentation", "proposal"]
```
كل واحد من هذه الأهداف **يجب أن يكون موجودًا قبل** فتح طلب اعتماد. وأهمها فعليًا هو `presentation` — أي مخرج تبويب **Client Delivery**. وضع «اعتماد العميل» **قبل** التبويب الذي يُنتج ما يُعتمَد يُربك المستخدم ويجعله يفتح تبويب فارغ أو يعمل بالترتيب العكسي (يبني الـ presentation في تبويب لاحق ثم يعود للأمام لإنشاء طلب اعتماد).

### ٩.٣ لماذا P2 مشكلة حقيقية؟

Workflow v2 checklist يقول صراحة: `evaluation_guide_ready` بند إلزامي داخل مرحلة `handoff_and_closure`. لكن التبويب موضوع في مرحلة `docs`. هذا يعني أن مؤشر Handoff Readiness يعتمد على شيء بعيد عن تبويب Handoff — المستخدم يفتح Handoff Package، يرى مؤشرًا أحمر عن Evaluation، ولا يجد فيه شيء يفعله؛ يجب أن يقفز مرحلتَين للخلف.

### ٩.٤ لماذا P3 يستحق النقاش؟

منطقيًا هناك رأيان:
- **دليل التقييم قبل المراجعة:** لأن الـ scenarios هي معايير المراجعة. المراجعة تصبح: «امشِ كل scenario على الـ prototype وسجّل النتيجة».
- **دليل التقييم بعد المراجعة:** لأنه أصلًا مخرج تسليم للشريك التقني — «كيف تختبر المنتج بعد ما تبنيه».

**الحقيقة:** الاثنان صحيحان لأن الاستخدام مزدوج. الحل ليس النقل بل **الاعتراف بالاستخدام المزدوج**: التبويب موجود منذ Definition (يُبنى بالتوازي مع Stories/AC) وتُنجَز الـ runs في مرحلة Review.

---

### ٩.٥ الترتيب المقترح الجديد

#### تعديل A — دمج Approval + Delivery في مرحلة واحدة «اعتماد وتسليم العميل»
```
قبل:
  6. ops
  7. approval           → tab: approvals
  8. delivery           → tabs: clientDelivery, handoff

بعد:
  6. ops
  7. client_signoff     → tabs بالترتيب:
        1. clientDelivery   (بناء الـ Presentation)
        2. approvals        (فتح بورتال اعتماد على ما بُني)
        3. handoff          (حزمة التسليم بعد الاعتماد)
```
**المبرر:** التدفق الطبيعي هو (بناء → اعتماد → تسليم) وليس (اعتماد → بناء + تسليم). الدمج يجعل الترتيب داخل الـ phase الواحدة صحيحًا.

#### تعديل B — نقل Evaluation إلى نهاية مرحلة تعريف المنتج
```
قبل:
  docs: prd · prototypeStudio · prototypePrompt · prototypeReview · evaluation

بعد:
  definition: definition · stories · traceability · evaluation · decisions
  docs:       prd · prototypeStudio · prototypeReview
```
**المبرر:** بناء السيناريوهات جزء من تعريف المنتج (مصدرها stories/flows). المراجعة تستخدم الـ scenarios بدل ما تكون قسمًا فرعيًا فيها. وبند handoff `evaluation_guide_ready` يبقى محسوبًا بشكل صحيح لأنه ينظر إلى وجود scenarios بغض النظر عن مكان التبويب.

**بديل أضعف:** ترك evaluation في docs لكن **قبل** prototypeReview بدلًا من بعده.

#### تعديل C — حذف/إخفاء تبويب `prototypePrompt` (Legacy)
Prototype Studio يغطّي كل شيء. إبقاؤه advanced يُبقي الالتباس. **الاقتراح:** حذفه من `NEXVORA_TAB_PHASES` نهائيًا، مع الاحتفاظ بـ deep-link عبر `?tab=prototypePrompt` للمشاريع القديمة.

#### تعديل D — دمج `analysis` القديم داخل `discovery-analysis`
تبويبة `analysis` (v1) أصبحت شاحبة أمام Discovery Analysis (١٧ قسم). **الاقتراح:** إخفاء `analysis` والاعتماد على Discovery Analysis (يظهر داخل Project Brain أو داخل subtab من مرحلة الاكتشاف).

#### تعديل E — إظهار تحذير interlock داخل Handoff Package
عند فتح Handoff Package: لو `evaluation_guide_ready = false`، إظهار شريط علوي فيه:
> «هذه الحزمة تحتاج دليل تقييم مكتمل. اذهب إلى [دليل التقييم]».
مع deep-link مباشر. حل UX يعوّض بُعد التبويبَين مكانيًا.

---

## ١٠. اقتراحات التحسين المُوسَّعة

### ١٠.١ تبويبات مرشَّحة للحذف
| التبويبة | السبب | البديل |
| --- | --- | --- |
| `prototypePrompt` (Legacy) | استُبدلت بـ Prototype Studio بالكامل | حذف مع IPCU deep-link |
| `analysis` (القديم) | يقلّ عن Discovery Analysis | إخفاؤه لصالح Discovery Analysis |

### ١٠.٢ تبويبات مرشَّحة للدمج
| التبويبات | الاقتراح |
| --- | --- |
| approvals + clientDelivery + handoff | مرحلة واحدة «اعتماد وتسليم» بترتيب داخلي صحيح |
| evaluation + traceability | صعب — كلاهما مركّز لكن يمكن ضمّهما إذا صغُر حجمهما |

### ١٠.٣ Subtabs مرشَّحة للترقية أو العكس
| الحالي | الاقتراح | السبب |
| --- | --- | --- |
| Client Presentation (`clientDelivery`) كتبويب top-level | يبقى top-level لكن **يُنقَل إلى قبل approvals** | تدفق منطقي |
| Developer Handoff document كـ subtab داخل handoff | يبقى subtab | جيّد حاليًا |
| Change Impact كـ subtab داخل traceability | يبقى | جيّد |
| Stage Owners كـ subtab داخل deliveryMilestones | يبقى | جيّد |

### ١٠.٤ Empty States ورسائل توجيه ناقصة (اقتراح لا يُعدَّل الآن)
- **Client Approval فارغ:** «لا يوجد ما تعتمده بعد — ابدأ بتوليد Client Presentation من [تسليم العميل]».
- **Handoff Package مع evaluation ناقص:** كما في تعديل E.
- **Evaluation بلا stories:** «سيناريوهات التقييم تُبنى على قصص المستخدم. أنشئ قصة أولًا في [تعريف المنتج]».

---

## ١١. خلاصة تنفيذية (للـ Founder)

1. **الترتيب الحالي بعد Prototype Review معكوس منطقيًا:** الاعتماد قبل التسليم مع أن التسليم هو ما يُعتمَد عليه.
2. **الحلّ الأنظف:** دمج مرحلتَي `approval` و`delivery` في مرحلة واحدة «اعتماد وتسليم العميل» بترتيب داخلي: `clientDelivery → approvals → handoff`.
3. **دليل التقييم في المكان الخطأ:** موجود في «المستندات» لكن Workflow v2 يعتبره جزءًا من التسليم. الأفضل نقله إلى نهاية «تعريف المنتج» ليقترب من مصادره (Stories/Flows).
4. **تلوّث بصري خفيف:** `prototypePrompt (Legacy)` و`analysis` (القديم) مرشَّحان للحذف — كلاهما استُبدل بأفضل.
5. **Interlock غير واضح:** Handoff Package يستهلك مخرجات من ٤ تبويبات بعيدة بلا إشارة UI. تحذير شريطي داخل Handoff يحلّها بدون إعادة هيكلة.
6. **الأخبار الجيدة:** Consolidation UX 2026 أنجزت أغلب التبسيط الصحيح — تجميع meetings/brain/traceability/handoff في subtabs قرارات ممتازة، والمشكلة المتبقية ترتيبية فقط لا هيكلية.
7. **التعديلات مقترَحة كتعديل واحد صغير على `nexvora-tab-order.ts`** بدون لمس أي كود منطق — تجربة أفضل بتغيير سطور معدودة.

---

<div dir="ltr">

## Appendix A — Tab-to-file Map (quick reference)

| Tab key | Panel file | Phase |
| --- | --- | --- |
| discovery | discovery-generator-panel + discovery-sessions-panel | discovery |
| analysis | analysis-panel | discovery |
| research | research-panel | discovery |
| meetings | meetings-panel + meeting-prep-panel + meeting-presentation-panel | meetings |
| projectBrain | brain-v2-panel + smart-recommendations-panel + brain-review-panel | knowledge |
| knowledgeHub | knowledge-hub-panel | knowledge |
| definition | definition-panel | definition |
| stories | stories-panel | definition |
| traceability | traceability-panel + _panels/change-impact-panel | definition |
| decisions | _panels/decisions-panel | definition |
| prd | prd-panel | docs |
| prototypeStudio | prototype-studio-panel | docs |
| prototypePrompt | prototype-prompt-panel | docs (legacy) |
| prototypeReview | review-panel | docs |
| evaluation | evaluation-panel | docs |
| commercial | commercial-panel + commercial-full-panel | ops |
| deliveryMilestones | delivery-lifecycle-panel + work-panel + _panels/stage-owners-panel | ops |
| support | support-panel | ops |
| organizationalIntelligence | organizational-intelligence-panel | ops |
| activity | activity-panel | ops |
| approvals | _panels/client-approval-panel | approval |
| clientDelivery | presentation-panel | delivery |
| handoff | _panels/handoff-panel + developer-handoff-panel + _panels/partners-panel | delivery |

</div>

</div>
