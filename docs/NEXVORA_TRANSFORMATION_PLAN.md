# خطة تحويل NEXVORA — من Full-Lifecycle SaaS إلى Product Discovery & Handoff OS

**التاريخ:** 2026-08-07 (v3 بعد المراجعة الثانية)
**المصدر:** brief كامل من المالك + مراجعتين معتمدتين
**الهدف:** تحويل المنصّة الحالية إلى **NEXVORA Product Discovery, Definition, Prototype & Handoff Operating System**، بدون حذف تدميري وبدون كسر البيانات الحالية.

## سجل التعديلات (v3)

- ⬅️ **الصلاحيات:** 4 رتب عامة فقط (owner/admin/supervisor/member) — **بدون رتبة خامسة**. `external_partner` عضوية على مستوى المشروع حصريًا.
- ⬅️ **Handoff Package = حاوية، مش قسم:** الأقسام الإلزامية 7 (Problem Brief / Scope & MVP / User Stories / Acceptance Criteria / Prototype / PRD / Evaluation Guide). الـ Handoff Package هو **الناتج النهائي اللي يجمعهم**.
- ⬅️ **ترتيب Phases (v3):** Market Research + Problem Validation ينتقلان لـ **P4** (قبل Product Definition، لأن التعريف يبني عليهم). Evidence Traceability ينتقل لـ **P7** (مع User Stories/AC — أساس جودة الـ PRD مش تجميلي). Commercial Administration ينقسم — Payments/Contracts مبكرًا مع تحويل Lead لمشروع، Proposals/Pricing قبل Client Approval، Change Requests بعد اعتماد Scope. الترتيب النهائي في القسم ٥.
- ⬅️ **Old Projects:** لا يتم تحويل بياناتها للـ 7 مراحل. تبقى على Workflow v1 (24 stage) مع Adapter للعرض فقط. المشاريع الجديدة فقط تُنشأ على Workflow v2.
- ⬅️ **Internal Checklists:** كل مرحلة من الـ 7 تحوي داخليًا Checklist لعناصرها (مثال: Product Definition = Personas + Scope + MVP + Flows + Stories + Requirements + AC). المستخدم يشوف مرحلة واحدة، النظام يتابع الاكتمال الداخلي.
- ⬅️ **Information Classification default:** `unclassified` (أو `legacy` أو `needs_review`) للبيانات القديمة — **مش `inference`**.
- ⬅️ **User Stories Migration:** ينشئ Stories في حالة **Draft فقط** بدون استبدال نصّ PRD القديم.
- ⬅️ **Client Portal:** تشديد أمني كامل (Token منتهي الصلاحية، إلغاء، تدقيق، تثبيت نسخة).
- ⬅️ **تقديرات الساعات:** تقريبية، ليست التزامًا.

---

## ١. خريطة KEEP / MODIFY / ADD / HIDE / RENAME / FUTURE

### 🟢 KEEP — يبقى كما هو (قيمة أساسية للنسخة الجديدة)

| المكوّن | المسار | ملاحظة |
|---|---|---|
| Leads | `lib/leads`, `app/(platform)/dashboard/leads` | نقطة البدء |
| Clients | `app/(platform)/dashboard/clients` | جهات العميل |
| Discovery Forms + Templates | `lib/discovery-form`, `lib/discovery-templates`, `lib/discovery-generator` | جوهر مرحلة الاكتشاف |
| Discovery Links + Portal | `lib/discovery-portal` | استقبال العميل |
| Discovery Analysis | `lib/discovery-analysis` | 17 قسم |
| Project Brain v2 | `lib/brain-v2` | جوهر معرفة المشروع |
| Brain Review | `lib/review` | البوّابة الإجبارية |
| Smart Recommendations | `lib/organizational-intelligence` | التوصيات المستمدّة |
| Meeting Preparation | `lib/meeting-prep` | تجهيز 13 مولّد |
| Live Meetings | `lib/meetings` | Session + Timer + Capture |
| Meeting Intelligence Pipeline | `lib/meetings` (v2 extraction) | 13 فئة استخراج |
| Meeting Presentation (PPTX) | `lib/meeting-presentation`, `lib/presentation` | 17 شريحة عربية RTL |
| PRD | `lib/prd` | مع تعديل ليكون input للـ Handoff |
| Prototype Prompt V2 | `lib/prototype-prompt` | Pipeline متعدّد المراحل |
| Prototype Review | (داخل review/) | يُعاد تسميته → Product Review |
| Tasks + Workspace | `lib/work`, `lib/workspace-tasks` | إدارة المهام |
| Collaboration | `lib/collaboration` | تشات داخلي |
| Knowledge Hub | `lib/knowledge-hub` | مستودع المعرفة |
| Organizational Intelligence | `lib/organizational-intelligence`, `lib/organizational-memory` | تعلّم من المشاريع |
| Notifications | `lib/notifications` | تنبيهات |
| Auth + Permissions | `lib/auth` | **4 رتب عامة فقط** — بدون توسيع. `external_partner` عضوية داخل مشروع (project_memberships) |
| Versioning + Change Records | `lib/increments`, versioning tables | نبني عليها |
| AI Configuration | `lib/ai`, `lib/ai-platform` | مفاتيح ومزوّدين |
| i18n | `lib/i18n` | ترجمة |

### 🟡 MODIFY — يبقى موجود لكن يتغيّر جوهره

| المكوّن | التغيير المطلوب |
|---|---|
| **Developer Handoff** → **Product Handoff Package** | إعادة تسمية. الـ Handoff Package هو **الحاوية النهائية** (مش قسم من الأقسام) اللي تجمّع الأقسام الإلزامية والاختيارية. **الإلزامي = 7 أقسام** (Problem Brief / Scope & MVP / User Stories / Acceptance Criteria / Prototype / PRD / Evaluation Guide) + حتى 18 قسم اختياري حسب نوع المشروع + إشعارات الاستلام + External Technical Partner flow |
| **Workflow Registry (24 stage)** | إنشاء **Workflow v2 بـ 7 مراحل** جوهرية للمشاريع الجديدة فقط: Client → Discovery/Research → Analysis/Validation → Product Definition → Prototype/Review → Client Approval → Handoff. **المشاريع القديمة تبقى على v1** (24 stage) — Adapter للعرض فقط، لا تحويل تدميري لتاريخها. كل مرحلة من الـ 7 تحوي **Internal Checklist** لعناصرها الفرعية (مثال: Product Definition = Personas + Scope + MVP + Flows + Stories + Requirements + AC) — المستخدم يشوف مرحلة واحدة، النظام يتابع اكتمال العناصر داخليًا |
| **Brain v2 Sections** | إزالة/تعطيل الأقسام التقنية (Final DB Schema, API Architecture, Infra, Tech Stack) — إبقاء **Product Truth فقط**. الأقسام التقنية تنقل لـ "Non-Binding Technical Notes" (اختيارية، موسومة بوضوح) |
| **PRD** | يقرأ من Product Definition الجديد (Scope & MVP, Structured User Stories, Structured AC) — لا يُعامل كـ Deliverable نهائي بل كـ input للـ Handoff Package |
| **Prototype Review** → **Product Review** | إعادة تسمية + تعديل المعايير: تغطية User Stories/Requirements/User Flows، حالات الفراغ والخطأ، تجربة الموبايل والـ RTL، وضوح الاستخدام. **يمنع فحص الكود أو الإنتاج** |
| **Project Memberships** | لا رتبة عامة جديدة. **External Technical Partner** يبقى صلاحية على مستوى المشروع فقط عبر `project_memberships.role = 'external_partner'` — لا يورث صلاحيات خارج المشروع |
| **Navigation** | إعادة ترتيب حسب المراحل الجديدة، إخفاء كل عناصر Migration/Production من الـ Core |
| **Project Readiness Metrics** | استبدال: Engineering Readiness / Publishing / Support ← بـ: Discovery Completeness / Problem Validation / Product Definition Readiness / Prototype Readiness / Client Approval / Handoff Readiness |

### 🟢 ADD — إضافات جديدة كاملة

| المكوّن | الوصف |
|---|---|
| **Market Research** | جدول `market_research_items` — competitors, sources, notes, current solutions, complaints, assumptions. كل عنصر بمصدر (interview/answer/meeting/file/website) |
| **Problem Validation** | جدول `problem_validations` — 11 حقل لكل مشكلة + 5 حالات (Hypothesis → Validated) |
| **Information Classification Tagging** | Enum `information_class` بقيم: `fact / inference / assumption / hypothesis / decision / legacy / unclassified / needs_review`. البيانات القديمة تحصل على `legacy` أو `unclassified` — **مش `inference`** حتى لا يوحي بأنها موثّقة. AI outputs الجديدة تلتزم بواحد من الخمس الأصلية. UI badges + Prompt updates |
| **Product Definition Module** | Namespace جديد `lib/product-definition` — يحوي: Goal, Personas, Flows, Scope & MVP (Must/Should/Could/Won't), Features, Business Rules, Requirements, Risks, Assumptions, Dependencies, Success Metrics, Open Questions |
| **Structured User Stories** | جدول `user_stories` — ID, Title, Persona, As/I want/So that, Priority, Linked Feature/Requirement/Screen, AC, Evidence, Status, Client Approval, Version. **لا تستبدل النص داخل PRD**؛ إنشاء Stories في حالة `Draft` تلقائيًا مع الاحتفاظ الكامل بنسخ PRD القديمة لأي مراجعة أو استئناف يدوي |
| **Structured Acceptance Criteria** | جدول `acceptance_criteria` — Given/When/Then أو descriptive. مربوطة بـ Story/Feature/Requirement/Prototype Screen. AI review للغموض/التكرار/التعارض |
| **Product Evaluation Guide** | Deliverable جديد — Scenario ID, User, Preconditions, Steps, Expected Result, Failure Conditions, Related Story/AC/Screen, Priority, Evaluation Result. **مش Engineering QA** — دليل لتقييم المنتج |
| **Client Approval Portal** | صفحة عميل خارجية بروابط توقيع — يرى Prototype/Scope/Features، يضيف ملاحظات، يعتمد Scope/Prototype/Package. كل موافقة مسجّلة مع اسم/تاريخ/نسخة/نوع/سجل تدقيق |
| **External Technical Partner Membership + Portal** | **صلاحية على مستوى المشروع** (project_memberships.role='external_partner') لا Role عام. Portal يعرض Handoff Package للمشروع المُدعى إليه فقط + طرح أسئلة + تأكيد استلام + قبول/رفض. لا يورث أي صلاحية خارج المشروع |
| **Commercial / Project Administration** | **موديول جديد أساسي، منقسم على المراحل حسب طبيعتها التجارية:**<br>• **Payments/Contracts/Client Status** ← مبكرًا مع تحويل Lead لمشروع (P3 Navigation stage).<br>• **Proposals/Pricing** ← قبل Client Approval (P10 مباشرة قبل موافقة العميل على النطاق).<br>• **Change Requests** ← بعد اعتماد Scope (تتبّع طلبات التعديل مع أثر على السعر/الزمن). |
| **Client Portal — Security Hardening** | Token منتهي الصلاحية (TTL افتراضي 7 أيام قابل للتعديل)، **زر إلغاء فوري**، **سجل تدقيق** لكل فتح/موافقة (IP + timestamp + user-agent)، عدم عرض أي بيانات داخلية (ملاحظات فريق، هوامش، prompts)، **موافقة مثبَّتة على نسخة محددة** (version-pinned approval — لا يمكن الادّعاء لاحقًا بأن الموافقة كانت على شيء آخر) |
| **Project Role Assignment** | جدول `project_role_assignments` — لكل مرحلة: Owner, Reviewer, Due Date, Status. يدعم Product/Client Lead + Operations/QA Lead |
| **Evidence Traceability UI** | زر "Show Evidence" جنب أي Requirement/Story/AC — يعرض المصدر/كلام العميل/الاجتماع/التاريخ/الدليل/الثقة/المعتمِد. Full traceability chain |
| **Change Impact View** | لأي تعديل على Scope/Requirement/Story/Decision/Prototype/PRD — يعرض تأثيره على PRD/Prototype/Stories/AC/Evaluation Guide/Handoff **مع مراجعة بشرية** (لا re-generate تلقائي) |
| **Feature Flags System** | `lib/feature-flags` — يخفي "Extended Technical Delivery" modules من Core |
| **Non-Binding Technical Notes** | قسم اختياري داخل Brain — موسوم بوضوح كملاحظات تقنية غير مُلزِمة |

### 🔴 HIDE — مستمر في DB والكود لكن مخفي خلف Feature Flag تحت قسم "Extended Technical Delivery"

| المكوّن | المسار |
|---|---|
| Claude Execution | `lib/claude-exec`, `app/.../dashboard/projects/[id]/code-execution-*` |
| Engineering QA | `lib/engineering-qa`, panels |
| Architecture Review | `lib/architecture-review`, `lib/architecture-validation` |
| Code Quality Review | `lib/code-quality-review` |
| Database Review | `lib/database-review` |
| Security Review | `lib/security-review`, `lib/security` |
| PRD Compliance Review | `lib/prd-compliance-review` |
| Performance Review | `lib/performance-review` |
| Production Monitoring | `lib/production-monitoring` |
| Production Validation | `lib/production-validation` |
| Static Review | `lib/static-review` |
| Go-Live | `lib/go-live` |
| Hypercare | `lib/hypercare` |
| Migration Suite | `lib/migration`, `lib/migration-discovery`, `lib/transformation`, `lib/load-bridge`, `lib/schema-mapping`, `lib/simulation`, `lib/production-migration` |
| Data Quality (as production tool) | `lib/data-quality` |
| Fix Prompt | (داخل production-monitoring) |
| Release Certificate | (داخل engineering-qa) |
| Deployment Validation | (داخل production-monitoring) |

**قرار:** ما اتحذفش أي كود/جدول. مجرد إخفاء من Navigation + Router guard + Feature Flag. تظهر كلها تحت قسم واحد "Extended Technical Delivery" لمن يفعّله من Settings.

### 🔵 RENAME

| القديم | الجديد |
|---|---|
| Developer Handoff | **Product Handoff Package** |
| Prototype Review | **Product Review** |
| Engineering Readiness | **Product Definition Readiness** |
| Publishing Readiness | **Client Approval** |
| Support Readiness | **Handoff Readiness** |
| Delivery Lifecycle Panel | **Product Delivery Progress** |

### ⚪ FUTURE — لا تُنفّذ الآن، لكن الأساس محفوظ

- Cross-project analytics على مستوى الـ Product Definition
- Automated benchmarking من Handoff Packages سابقة
- Marketplace للـ Domain Packages

---

## ٢. تغييرات قاعدة البيانات (Backward Compatible)

جميع الـ Migrations هتبقى **إضافات فقط** — بدون DROP، بدون ALTER destructive:

الترقيم يتبع ترتيب Phases الجديد (v3):

| Migration | Phase | المحتوى |
|---|---|---|
| `0095_feature_flags` | P1 | جدول `feature_flags` (name, enabled_globally, enabled_per_user) + seed لـ `product_mode=enabled`, `extended_technical_delivery=disabled` |
| `0096_workflow_v2_seven_stages` | P2 | جدول `workflow_stages_v2` + `workflow_stage_checklists` (internal items لكل stage) + `project_workflow_version` (v1 أو v2) + adapter view للعرض. **المشاريع القديمة تبقى على v1** |
| `0097_project_readiness_metrics` | P3 | جداول `project_readiness_snapshots` (Discovery/Problem Validation/Product Definition/Prototype/Client Approval/Handoff) + `commercial_lifecycle_status` أولي (Contracts/Payments مع تحويل Lead) |
| `0098_market_research` | P4 | جداول `market_research_items`, `research_sources`, `customer_interviews`, `competitor_notes` |
| `0099_problem_validation` | P4 | جدول `problem_validations` + enum `validation_status` (Hypothesis/Weak Evidence/Partially Validated/Validated/Rejected) |
| `0100_information_classification` | P4 | Enum `information_class` (fact/inference/assumption/hypothesis/decision/legacy/unclassified/needs_review) + عمود `classification` على AI outputs — **default = 'unclassified'** |
| `0101_product_definition` | P5 | جداول `product_definitions`, `product_scope_items` (Must/Should/Could/Won't), `product_personas_extended`, `product_flows`, `product_business_rules`, `product_risks_assumptions_deps`, `product_success_metrics`, `product_open_questions` |
| `0102_user_stories` | P6 | جدول `user_stories` + `user_story_versions` + FK to features/requirements/prototypes/AC. **Script بيولّد Draft rows من نصوص PRD القديمة بدون حذف النص** |
| `0103_acceptance_criteria` | P6 | جدول `acceptance_criteria` + `ac_reviews` (AI + human) |
| `0104_evidence_traceability` | P7 | جداول `evidence_links` (source_type/source_id → target_type/target_id) + `evidence_snapshots` (نصوص العميل/الاجتماع محفوظة كـ pinned) + views لعرض traceability chain |
| `0105_product_evaluation_guide` | P8 | جدول `product_evaluation_guides` + `evaluation_scenarios` + `evaluation_results` |
| `0106_commercial_admin_full` | P9 | إكمال جداول `proposals`, `pricing_items`, `payment_schedules`, `contracts` (توسيع)، `change_requests` (مع أثر على السعر/الزمن) — البدء الأولي من P3 |
| `0107_client_approvals` | P10 | جدول `client_approvals` + `client_approval_events` + `client_portal_tokens` (expires_at، revoked_at، revoked_by، last_accessed_ip، access_log JSON، pinned_version_id، pinned_version_hash) |
| `0108_product_handoff_packages` | P11 | جدول `product_handoff_packages` (الحاوية) + `handoff_sections` مع `is_mandatory` (7 قيم إلزامية افتراضية) + `package_versions` + `package_deliveries` |
| `0109_project_memberships_external` | P11 | إضافة قيمة `external_partner` لـ `project_memberships.role` (لا يمس `profiles.role` العام) + `handoff_partner_invites` + `handoff_questions` |
| `0110_project_role_assignments` | P11 | جدول `project_role_assignments` (project_id, stage_key, owner_id, reviewer_id, due_date, status) |

**إجمالي:** 16 migration جديدة، كلها آمنة تمامًا على البيانات الحالية.

---

## ٣. تغييرات AI Pipelines

| Task Type | حالته |
|---|---|
| DISCOVERY_ANALYSIS | يبقى — يضيف classification tagging |
| BRAIN_GENERATION | يبقى — يزيل الأقسام التقنية القسرية، يضيف Non-Binding Notes optional |
| MARKET_RESEARCH_ANALYSIS | **جديد** — يستخرج من مصادر متعددة |
| PROBLEM_VALIDATION_ANALYSIS | **جديد** — يقيّم دليل كل مشكلة |
| USER_STORIES_STRUCTURING | **جديد** — يحوّل نصّ PRD إلى Structured Stories |
| ACCEPTANCE_CRITERIA_STRUCTURING | **جديد** — يولّد Given/When/Then |
| ACCEPTANCE_CRITERIA_REVIEW | **جديد** — يكتشف الغموض/التكرار/التعارض |
| EVALUATION_GUIDE_GENERATION | **جديد** — يولّد سيناريوهات تقييم |
| HANDOFF_PACKAGE_ASSEMBLY | **جديد** — يجمّع 26 قسم + validation |
| PRD_GENERATION | يبقى بس يقرأ من Product Definition الجديد |
| PROTOTYPE_PROMPT_V2 | يبقى — لا تغيير |
| Extended Technical (FIX_PROMPT, PRODUCTION_INCIDENT, ...) | يبقى في الكود، لكن endpoints خلف feature flag |

---

## ٤. تغييرات الصلاحيات

**قبل:** 4 رتب عامة (owner, admin, supervisor, member)
**بعد:** 4 رتب عامة **بدون إضافة رتبة جديدة** + **عضوية على مستوى المشروع** (`project_memberships.role`) تشمل قيمة جديدة `external_partner`.

المبرمج الخارجي **لا يظهر في قائمة المستخدمين العامّة**، ولا يستطيع رؤية أي مشروع خارج اللي اتدعى إليه.

### Permission Matrix للـ external_partner (per-project membership)

| Resource | يرى | يعدّل |
|---|---|---|
| Handoff Package | ✅ | ❌ |
| PRD | ✅ | ❌ |
| Prototype | ✅ | ❌ |
| User Stories | ✅ | ❌ |
| Acceptance Criteria | ✅ | ❌ |
| Product Evaluation Guide | ✅ | ❌ |
| Open Technical Questions | ✅ | ✅ (يضيف سؤال جديد) |
| Handoff Status | ✅ | ✅ (Accept/Reject/Ask) |
| Internal Notes | ❌ | ❌ |
| Prompts, Margins, Team Chat | ❌ | ❌ |
| Competitor Research (sensitive) | ❌ | ❌ |

### Client Approval Portal (تشديد أمني كامل)
- **بدون login** لكن **Token-based قوي** (على غرار Discovery Portal لكن أشد):
  - **TTL افتراضي 7 أيام** قابل للتعديل من واجهة PM.
  - **زر Revoke** يلغي الرابط فورًا مع سبب.
  - **سجل تدقيق شامل:** كل فتح، كل صفحة، كل موافقة → IP + User-Agent + Timestamp.
  - **لا يُعرض أي بيانات داخلية:** ملاحظات فريق، هوامش تسعير، prompts AI، مناقشات، أبحاث منافسين حساسة.
  - **موافقة مثبَّتة على نسخة (Version-Pinned Approval):** الموافقة تُحفظ مع hash النسخة، لا يمكن الادّعاء لاحقًا بأنها كانت على نسخة أخرى.
- يرى: Prototype (مقفول على النسخة)، Scope، Features Overview، PPTX Presentation.
- يعمل: ملاحظات، طلب تعديل، اعتماد Scope/Prototype/Package.

---

## ٥. خطة التنفيذ — 12 Phase (v3 مُعادة الترتيب النهائي)

كل Phase منفصل، مختبر، commit + push مستقل، ينتظر موافقتك قبل التالي.
**التقديرات تقريبية وليست التزامًا** — Product Definition, Handoff, Market Research, Evidence قد تحتاج وقت أطول حسب البنية الفعلية.

| Phase | الاسم | تقدير مبدئي | الاعتماد | ملاحظة |
|---|---|---|---|---|
| **P1** | Feature Flags + Product Mode | ~3-4h | — | الأساس، لا تغيير UI ظاهر |
| **P2** | Workflow v2 (7 مراحل) + Internal Checklists + Adapter لـ v1 القديم | ~5-7h | P1 | مشاريع جديدة على v2، قديمة تبقى v1 |
| **P3** | Navigation + New Readiness Metrics + Commercial Foundations (Payments/Contracts/Client Status مع Lead conversion) + إخفاء Extended Technical Delivery | ~5-7h | P2 | أول تغيير UI ظاهر |
| **P4** | Market Research + Problem Validation + Information Classification (unclassified/legacy/needs_review) | ~6-9h قد تزيد | P3 | **قبل Product Definition** — البحث أساس التعريف |
| **P5** | Product Definition + Scope & MVP (Must/Should/Could/Won't) + Personas + Flows + Requirements | ~6-9h قد تزيد | P4 | يبني على البحث والتحقق |
| **P6** | Structured User Stories (Draft من PRD القديم) + Structured Acceptance Criteria + AI Review | ~6-8h | P5 | نصّ PRD القديم يبقى محفوظًا |
| **P7** | Evidence Traceability (Show Evidence buttons + traceability chain) + Product Review (rename من Prototype Review) | ~5-7h قد تزيد | P6 | **أساس جودة PRD** مش تجميلي |
| **P8** | Product Evaluation Guide (Scenarios + Steps + Expected Results — مش Engineering QA) | ~5-7h | P7 | Deliverable مستقل |
| **P9** | Commercial Administration الكامل (Proposals + Pricing + Contracts + Payments). بنية Change Requests **تُبنى هنا لكن تُفعَّل بعد Client Approval في P10** | ~5-7h | P8 | Proposals/Pricing **قبل** Client Approval |
| **P10** | Client Approval Portal (Token hardened + Audit log + Version pinning + Revoke) | ~5-7h | P9 | تشديد أمني كامل |
| **P11** | Product Handoff Package (7 إلزامي + حتى 18 اختياري) + External Technical Partner (per-project membership) + Partner Portal | ~7-10h قد تزيد | P10 | المخرج النهائي |
| **P12** | التوثيق النهائي + i18n keys + **Change Impact View الكامل** (تحسين النسخة الجزئية اللي اتعملت في P7/P9) + اختبارات شاملة + Verify + تقرير التسليم | ~5-7h | P11 | إغلاق |

**ملاحظة على Change Impact View:** نسخة أولية تظهر مع Evidence Traceability في P7 (تأثير تعديل Story/AC على PRD القديم)، تتوسّع في P9 (تأثير Scope change على Pricing)، وتكتمل في P12 (كل الروابط بين Requirement/Story/AC/Prototype/Evaluation Guide/Handoff).

**إجمالي تقريبي:** ~65-90 ساعة موزّعة على 12 خطوة آمنة.
**مقترح:** Phase واحد لكل جلسة. ما ننتقلش قبل ما يعدّي Verify (tsc + eslint + tests + build) + Commit + Push + موافقتك.

### قاعدة الحفاظ على المشاريع القديمة (مهمة)

**المشاريع الموجودة في قاعدة البيانات قبل P2 تبقى على Workflow v1 (24 stage) بالكامل** — لا تحويل تدميري لتاريخها. عمود `project_workflow_version` (v1 default، v2 للجديدة) يحدّد أي واجهة تُعرض. الـ 24 stage القديم يبقى موجود في الكود والـ DB، وAdapter يعرضه بترجمة بسيطة للـ 7 مراحل للمستخدم إذا أراد.

### سبب تقديم Market Research و Validation لـ P4 (قبل Product Definition)

تعريف المنتج (Product Definition) يجب أن **يبني على بحث سوق وتحقق مشاكل موثّقين مسبقًا** — لا العكس. لو Product Definition جاء قبل، النتيجة ستكون: PRD مبني على افتراضات غير محقّقة.

### سبب تقديم Evidence Traceability لـ P7 (مع Stories/AC)

Evidence Traceability ليست إضافة تجميلية بل **أساس جودة الـ PRD**. زر "Show Evidence" على كل User Story و Acceptance Criterion يجب أن يعمل من اللحظة الأولى — لا يُترك لآخر مرحلة.

### سبب تقسيم Commercial على P3 و P9

- **P3 (مع Lead conversion):** Payments/Contracts/Client Status ضرورية من البداية عشان تعرف تشغّل العميل تجاريًا.
- **P9 (قبل Client Approval):** Proposals/Pricing/Change Requests ترتبط بموافقة العميل على النطاق والتكلفة.

---

## ٦. قواعد صارمة أثناء التنفيذ

1. ✅ **لا حذف** — كل جدول قديم يبقى، مجرد إخفاء.
2. ✅ **Backward-compatible migrations فقط** — بدون DROP/ALTER destructive.
3. ✅ **Feature Flags** — كل ميزة جديدة أو مخفية تُوَجَّه من ملف flags مركزي.
4. ✅ **Verify بعد كل Phase** — tsc + eslint + vitest + build. ما ننتقلش قبل ما تعدّي.
5. ✅ **Commit + Push بعد كل Phase** — على `dhlbmhsn357-wq/NEXVORA` عبر SSH.
6. ✅ **تقرير Phase قبل التالي** — ما تم/ما اتغيّر/ما فُتح للنقاش.
7. ✅ **إعادة استخدام الموجود** قبل إنشاء جديد — components/services/models.
8. ✅ **RTL + i18n keys** — بدون keys خام في الـ UI.
9. ✅ **بيانات المشاريع القديمة سليمة** — لا Migration تكسر UI موجود.

---

## ٧. المطلوب منك دلوقتي

**اعتماد الخطة v3 قبل ما أبدأ Phase 1.**

**Phase 1 v3 = Feature Flags + Product Mode (الأساس فقط):**
- Migration `0095_feature_flags` — إضافة الجدول + seed لـ `product_mode=enabled`, `extended_technical_delivery=disabled`.
- إنشاء `lib/feature-flags/index.ts` — helper بسيط للقراءة (isEnabled).
- إنشاء واجهة إدارة flags في Settings > Feature Flags (Owner فقط).
- **لا يتم تغيير Navigation في P1** (مؤجّل لـ P3 بعد Workflow).
- Verify + Commit + Push.

الإخفاء الفعلي من Navigation هيتم في **P3** بعد ما نظبّط Workflow في P2.

---

**ابعتلي واحدة من دي:**
- **"موافق"** → أبدأ Phase 1 v3 فورًا.
- **"عدّل X"** → أعدّل قبل ما نبدأ.
- **"استفسار"** → اسأل.
