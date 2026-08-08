# الفصل الأول: مقدمة تنفيذية

## ما هو NEXVORA؟

NEXVORA منصة متكاملة لإدارة دورة حياة المنتج (Product Lifecycle Management) داخل شركات الاستشارات والوكالات الرقمية التي تصمم منتجاً للعميل ثم تُسلّمه لشريك تقني ينفّذه. المنصة ليست أداة إدارة مهام عامة، وليست CRM، وليست نظام محاسبة. هي نظام رأسي (Vertical) يركز حصراً على المسافة الفاصلة بين «فكرة العميل الخام» و«حزمة منتج جاهزة للتسليم للمطور».

النظام مبني على Next.js + Supabase (PostgreSQL + Auth + RLS)، ويعمل من داخل مساحة عمل واحدة (workspace) تحتوي على مستخدمين، عملاء (clients)، وليدز (leads)، ومشاريع (projects). كل مشروع يمرّ عبر دورة عمل من سبع مراحل رسمية (Workflow v2) ويُقاس بستة مقاييس جاهزية (Project Readiness Metrics).

## من هم المستخدمون؟

- **صاحب النظام (Owner)**: الشريك المؤسس. صلاحيات كاملة على المساحة (workspace)، بما فيها إدارة المستخدمين، Feature Flags، الأرشفة، والحذف.
- **مسؤول (Admin)**: يشارك Owner كل الصلاحيات ما عدا العمليات الحساسة جداً (إدارة النظام على مستوى Owner).
- **مشرف (Supervisor)**: مستوى إشرافي أقل من Admin، أعلى من Member. يُستخدم للتحكم في فِرق فرعية.
- **عضو (Member)**: مسؤول تشغيل مشروع أو مجموعة مشاريع. ينفّذ العمل اليومي (اكتشاف، تعريف، Prototype).
- **شريك تقني خارجي (External Partner)**: **ليس دوراً عاماً في النظام** بل عضوية على مستوى مشروع واحد فقط. يستقبل حزمة التسليم ويطّلع على ما يخصّه فقط.
- **العميل (Client)**: **لا يملك حساباً داخل النظام**. يتفاعل حصراً عبر روابط عامة مؤقّتة (Discovery Portal، Client Approval Portal) محمية بـ Token وصلاحية زمنية.

## دورة المشروع الكلية

كل مشروع في NEXVORA يمر بسبع مراحل رسمية (Workflow v2) بالترتيب:

1. **العميل والمشروع (Client & Project)** — تأهيل Lead وتحويله لمشروع، تعيين مسؤول، ميزانية ومدة.
2. **الاكتشاف والبحث (Discovery & Research)** — نموذج اكتشاف للعميل، جلسات، بحث سوق، بحث منافسين، مقابلات مستخدمين.
3. **التحليل والتحقق (Analysis & Validation)** — تحليل الاكتشاف (17 قسم)، بناء عقل المشروع (Brain v2)، تحقق المشاكل، اعتماد Brain Review.
4. **تعريف المنتج (Product Definition)** — Problem Brief، Personas، Scope & MVP (MoSCoW)، User Flows، Requirements، User Stories، Acceptance Criteria.
5. **النموذج الأولي والمراجعة (Prototype & Review)** — Prototype Prompt V2، توليد Prototype، Product Review، إصلاح ملاحظات.
6. **موافقة العميل (Client Approval)** — عرض العميل عبر Portal آمن، اعتماد Scope، اعتماد Prototype، توثيق القرار.
7. **التسليم والإغلاق (Handoff & Closure)** — تجميع Handoff Package (7 عناصر إلزامية)، Evaluation Guide، تسليم للشريك التقني، قبول رسمي.

## الفروق الجوهرية التي يجب فهمها منذ اليوم الأول

| المصطلح | ليس هو |
| --- | --- |
| Product Discovery | ليس Software Requirements |
| Product Definition | ليس Wireframing |
| Prototype | ليس MVP جاهز للإطلاق |
| Product Review | ليس Engineering QA |
| Client Approval | ليس توقيع عقد |
| Handoff | ليس تسليم كود |
| UI Groups (Phases في التبويبات) | ليست Workflow Stages |
| information_class (طبيعة معلومة) | ليس confidentiality (مستوى سرّية) |

هذه الفروق ليست شكلية. كل واحدة منها تحمي المستخدم من خطأ عملي كبير (مثلاً: عدم الخلط بين مراجعة المنتج قبل التسليم للعميل، ومراجعة الجودة الهندسية التي تحصل داخل قسم Extended Technical Delivery المخفي خلف Feature Flag).

## ما لا يفعله NEXVORA (تحديد النطاق بدقّة)

- **لا يُرسل بريداً إلكترونياً تلقائياً** إلى العميل أو الشريك. المستخدم يشارك الروابط يدوياً (WhatsApp، Slack، بريد يدوي).
- **لا يُصدر ملفات PDF جاهزة** للتنزيل من داخل النظام كسير عمل رسمي. التصدير يدوي (طباعة المتصفح، أو نسخ إلى Word).
- **لا يشغّل خطوط أنابيب AI تلقائية** تُنتج User Stories أو PRD كامل من فراغ. توليد Prompt V2 موجود لكن التنفيذ الفعلي على أدوات خارجية.
- **لا يوجد Public Partner Portal** يفتح رابطاً عاماً للشريك التقني بدون تسجيل دخول. الشريك يستلم عضوية داخل المشروع.
- **ليس نظام محاسبة**: قسم Payments موجود كسجلّ (log)، لا يتصل ببوابات دفع.

# الفصل الثاني: خريطة النظام العامة

## أولاً: Workflow v2 — المراحل السبع الرسمية

مصدر التعريف: `lib/workflow-v2/registry.ts` — `WORKFLOW_V2_REGISTRY` و `WORKFLOW_V2_STAGES_ORDERED`. المصدر ثابت (single source of truth) في الكود ومكرَّر seed في migration `0096_workflow_v2.sql`.

### 1) العميل والمشروع (client_and_project)

- **الهدف**: تحويل «العميل المحتمل» لمشروع مسجَّل بأدنى قدر من المعرفة اللازمة (قطاع، نوع خدمة، ميزانية تقريبية، مسؤول واضح).
- **متى تبدأ**: لحظة تحويل Lead إلى Project من صفحة Leads.
- **مدخلات**: بيانات Lead (اسم، تواصل، احتياج مبدئي).
- **مخرجات**: صفّ في جدول `projects` مع مسؤول (`owner_user_id`) وميزانية ومدة.
- **المسؤول**: Operations Lead عادةً.
- **معيار الاكتمال**: العناصر الإلزامية الخمسة في Checklist (`lead_qualification`, `project_created`, `industry_and_service`, `budget_and_duration`, `owner_assigned`).
- **العلاقة بالسابق/اللاحق**: لا سابق (نقطة البداية). اللاحق يعتمد عليها لأن جميع المراحل تحتاج `projectId` صحيح.

### 2) الاكتشاف والبحث (discovery_and_research)

- **الهدف**: جمع معلومات كافية من العميل والسوق قبل الحكم أو التصميم.
- **مدخلات**: بيانات المشروع من المرحلة (1).
- **مخرجات**: نموذج اكتشاف مُقدَّم، محاضر جلسات، مصفوفة منافسين، مقابلات مستخدمين اختيارية.
- **المسؤول**: Product Lead (بمساعدة Ops).
- **معيار الاكتمال**: العناصر الإلزامية الثلاثة (`discovery_form_created`, `discovery_link_sent`, `discovery_submitted`). البحث السوقي والمقابلات اختيارية.
- **العلاقة**: تعتمد على وجود مشروع. تُغذّي مرحلة التحليل والتحقق.

### 3) التحليل والتحقق (analysis_and_validation)

- **الهدف**: تحويل البيانات الخام إلى فهم (Brain) وتحقّق من افتراضاتها.
- **مدخلات**: نتائج الاكتشاف، البحث، الجلسات.
- **مخرجات**: تحليل 17 قسم لنموذج الاكتشاف، Project Brain مكتمل، اعتماد Brain Review (7 blockers).
- **المسؤول**: Product Lead.
- **معيار الاكتمال**: الأربعة الإلزامية (`discovery_analysis`, `project_brain_built`, `problem_validation`, `brain_review_approved`).
- **العلاقة**: بدونها لا يجوز البدء في تعريف المنتج.

### 4) تعريف المنتج (product_definition)

- **الهدف**: تحويل الفهم إلى «مواصفة منتج» عملية.
- **مدخلات**: Brain المعتمد.
- **مخرجات**: Problem Brief، Personas، Scope & MVP بـ MoSCoW، User Flows، Requirements، User Stories، Acceptance Criteria.
- **المسؤول**: Product Lead بالكامل.
- **معيار الاكتمال**: الخمسة الإلزامية (`problem_brief`, `target_users_and_personas`, `scope_and_mvp`, `user_flows`, `features_and_requirements`).

### 5) Prototype والمراجعة (prototype_and_review)

- **الهدف**: تحويل التعريف إلى نموذج تفاعلي قابل للعرض على العميل.
- **مدخلات**: تعريف منتج مكتمل.
- **مخرجات**: Prototype Prompt (خطة + Prompts)، رابط Prototype جاهز، Product Review مكتمل.
- **المسؤول**: Product Lead + مصمم/مطوّر Prototype.
- **معيار الاكتمال**: الأربعة الإلزامية (`prototype_plan`, `prototype_prompts_generated`, `prototype_link_available`, `product_review_completed`).

### 6) موافقة العميل (client_approval)

- **الهدف**: الحصول على موافقة موثَّقة من العميل على نسخة محدّدة من Scope و Prototype قبل التسليم.
- **مدخلات**: Prototype معتمد داخلياً + عرض عميل جاهز.
- **مخرجات**: قرار مسجَّل (`approved` / `changes_requested` / `rejected`) مرتبط بنسخة (`target_version`).
- **المسؤول**: Operations Lead يدير Portal، Product Lead يتلقّى القرار.
- **معيار الاكتمال**: `client_presentation_ready`, `client_portal_link_shared`, `scope_approved`, `prototype_approved`.

### 7) التسليم والإغلاق (handoff_and_closure)

- **الهدف**: تسليم رسمي للشريك التقني مع قبول موثَّق.
- **مدخلات**: موافقة العميل + كل ما سبق.
- **مخرجات**: Handoff Package بسبعة عناصر إلزامية + Evaluation Guide + قبول شريك.
- **المسؤول**: Product Lead يجمّع، Ops يدعو الشريك ويوثّق القبول.

## ثانياً: UI Groups (تنظيم واجهة فقط)

مصدر التعريف: `app/(platform)/dashboard/projects/[id]/nexvora-tab-order.ts` — `NEXVORA_TAB_PHASES`.

**قاعدة ذهبية**: هذه المجموعات هي «كيف نرتّب التبويبات على شاشة المشروع»، وليست مراحل عمل. المستخدم قد يعمل في تبويبتين من مجموعتين مختلفتين في نفس اليوم.

المجموعات الثمانية الأساسية:

| # | مفتاح | العنوان | التبويبات |
| --- | --- | --- | --- |
| 1 | discovery | الاكتشاف | overview, discovery, analysis, research |
| 2 | meetings | الاجتماعات | meetingPreparation, meetingPresentation, meetings |
| 3 | knowledge | المعرفة والدماغ | projectBrain, knowledgeHub*, brainReview, smartRecommendations* |
| 4 | definition | تعريف المنتج | definition, stories, traceability, impact |
| 5 | docs | المستندات والنموذج | prd, prototypePrompt, prototypeReview, evaluation |
| 6 | ops | التجاري والإدارة | commercial, commercial-full, deliveryMilestones, tasks, support*, organizationalIntelligence*, activity* |
| 7 | approval | اعتماد العميل | approvals |
| 8 | delivery | تسليم العميل | clientDelivery, developerHandoff, handoff, partners |

المجموعة التاسعة (execution — التنفيذ والجودة) لا تظهر إلا إذا كان `extended_technical_delivery` Feature Flag مفعّلاً. تضمّ: promptReview, engineeringQa, engineeringQaReview, fixPrompt, productionMonitoring, productionMonitoringPrompt, productionMonitoringReview. كل هذه محمية أيضاً من جهة الخادم (server-side redirect + `requireExtendedTechnical()` على كل server action).

النجمة (*) تعني «متقدّم» (advanced): مخفي خلف زر «إظهار المتقدمة»، ولا يظهر افتراضياً.

# الفصل الثالث: شرح لوحة المشروع (Project Dashboard)

## البانر العلوي

- **اسم المشروع + العميل**: عنوان واضح وربط سريع للعميل.
- **المسؤول (Owner)**: صورة/اسم مالك المشروع.
- **المرحلة الحالية (Current Stage)**: badge يعرض واحدة من المراحل السبع.
- **آخر نشاط (Last Activity)**: تاريخ آخر تحديث فعّال.

## Phase Pills (شريط المراحل)

صف من الأزرار الصغيرة يمثّل مجموعات التبويبات (UI Groups، وليس Workflow Stages). عند الضغط على pill، يقفز الشريط للتبويبة الأولى في المجموعة. الغرض: التنقّل السريع في مشروع كبير بدون التمرير على 25+ تبويبة.

## Six Readiness Metrics (بطاقات الجاهزية الست)

مصدر الحساب: `lib/project-readiness/compute.ts`. كل بطاقة تعرض:

- اسم المقياس (اكتمال الاكتشاف / التحقق من المشاكل / جاهزية تعريف المنتج / جاهزية Prototype / موافقة العميل / جاهزية التسليم).
- نسبة مئوية 0–100.
- شريط تقدّم لوني.

**كيف تُحسب النسبة**: (عناصر إلزامية مكتملة / إجمالي إلزامية) × 80 + (اختيارية مكتملة / إجمالي اختيارية) × 20. الحالة `skipped` تُعامَل كمكتملة (المستخدم قرّر تخطّيها بوعي).

**مؤشر أم Gate؟** — كل الستة **مؤشرات (indicators)** وليست بوابات. لا يمنعك النظام من الانتقال لمرحلة تالية لو النسبة أقل من 100%. هذه سياسة عن قصد: النضج المنتَجي يحدث بالتوازي أحياناً.

## شريط التبويبات

يعرض التبويبات مرتبة حسب `orderTabsByNexvora` من الـ tab order، مع فواصل بين المجموعات. زر «إظهار المتقدمة» يكشف تبويبات فئة `advanced`. Deep-link عبر `?tab=<key>` يفتح أي تبويبة حتى لو advanced (يتفوّق على toggle).

## Essential vs Advanced

- **Essential**: التبويبات التي يحتاجها Product Lead يومياً (Discovery, Definition, Stories, Approvals, Handoff).
- **Advanced**: تبويبات مرجعية أو تشغيلية (Support, Organizational Intelligence, Activity، knowledgeHub، smartRecommendations).

## Activity / Tasks / Collaboration / Notifications

- **Activity**: سجلّ عابر لأحداث المشروع (audit-like، مقصور على القراءة).
- **Tasks**: قائمة مهام داخل المشروع (لا تُستبدل بمنتج خارجي).
- **Collaboration**: تعليقات وحوارات على عناصر النظام.
- **Notifications**: إشعارات النظام للأحداث المهمة.

# الفصل الرابع: شرح تفصيلي لكل تبويب

يستخدم كل تبويب أدناه القالب:  
الاسم — الوظيفة — المستخدم — المرحلة — المدخلات — المخرجات — العلاقات — خطوات الاستخدام — مثال (أكاديمية تعليمية) — معيار الاكتمال — أخطاء شائعة — ما لا يستخدم فيه — وظائف مؤجّلة.

## 4.1 Discovery (الاكتشاف)

- **الوظيفة**: إنشاء نموذج اكتشاف يُرسَل للعميل عبر رابط عام، ثم استقبال إجاباته.
- **المستخدم**: Operations Lead ينشئ الرابط، Product Lead يستقرئ الإجابات.
- **المرحلة**: discovery_and_research.
- **المدخلات**: قالب اكتشاف + معلومات مشروع.
- **المخرجات**: نموذج مقدَّم مع إجابات مرتّبة حسب أقسامها.
- **العلاقات**: يُغذّي تبويب Analysis وتبويب Project Brain.
- **الخطوات**: أنشئ نموذجاً → انسخ رابط Discovery Portal → أرسله يدوياً للعميل → تابع الإكمال.
- **مثال**: مؤسّس «أكاديمية تعليمية» يجيب عن أسئلة: من طلابك المستهدفون؟ ما مشاكلك الحالية في التسجيل والدفع؟ ما بدائل السوق التي تعرفها؟
- **الاكتمال**: `discovery_submitted` = true.
- **أخطاء شائعة**: إرسال نموذج فارغ بدون تخصيص للقطاع؛ إغلاق النموذج قبل استلام كل الإجابات.
- **لا يُستخدم**: كأداة استبيان مستخدمين نهائيين (له تبويب مستقل: Problem Validation).
- **مؤجّل**: إرسال بريد تذكيري تلقائي.

## 4.2 Meetings (الاجتماعات)

- **الوظيفة**: تجهيز لأي اجتماع، توليد شرائح عرض، توثيق محضر.
- **المستخدم**: Product Lead بشكل أساسي.
- **المرحلة**: discovery_and_research (اجتماع أول) وأي مرحلة لاحقة.
- **المدخلات**: بيانات المشروع + Brain (إن وجد).
- **المخرجات**: Meeting Prep Document + Presentation (شرائح) + Meeting Notes.
- **الخطوات**: افتح Meeting Preparation → ولّد الأجندة → افتح Meeting Presentation عند بدء الاجتماع → وثّق النتائج في Meetings.
- **مثال**: قبل اجتماع أكاديمية → أجندة (١) عرض ملخص Brain (٢) تأكيد المستخدمين المستهدفين (٣) استعراض قائمة الميزات المقترحة.
- **الاكتمال**: `discovery_meeting_held` (اختياري).
- **أخطاء شائعة**: عدم توثيق قرارات الاجتماع؛ الاعتماد على الذاكرة.
- **لا يُستخدم**: كنظام دعوات (Calendar).
- **مؤجّل**: تكامل مع Zoom/Meet.

## 4.3 Project Brain (عقل المشروع / Brain v2)

- **الوظيفة**: التجميع الذكي لكل ما نعرفه عن المشروع في مكان واحد (سياق العميل، المستخدمون، المشاكل، الأدلة، القرارات).
- **المستخدم**: Product Lead.
- **المرحلة**: analysis_and_validation.
- **المدخلات**: Discovery + Research + Interviews.
- **المخرجات**: Brain Document مرجعي + Brain Review Blockers (7 قيود يجب حلّها).
- **العلاقات**: كل تبويبات Product Definition تسحب سياق من هنا.
- **مثال**: Brain الأكاديمية = «مستخدمون أساسيون: أولياء أمور 30–45، مشاكل: إدارة دفعات + متابعة تقدّم، أدلة: 6 مقابلات + 40 استبيان، قرار: التركيز على تجربة الموبايل».
- **الاكتمال**: `project_brain_built` + `brain_review_approved`.
- **أخطاء شائعة**: كتابة Brain كسرد إنشائي بدل نقاط قابلة للاستشهاد.
- **لا يُستخدم**: كمساحة تخزين ملفات (له knowledgeHub).

## 4.4 Knowledge Hub (مركز المعرفة) — advanced

- **الوظيفة**: مكتبة معرفة عرضية (لا خاصة بمشروع واحد) تُشارَك بين المشاريع.
- **المستخدم**: كل الأدوار.
- **المرحلة**: مساندة (لا مرحلة محدّدة).
- **مثال**: قوالب سؤال اكتشاف لقطاع «التعليم»؛ ملخّصات كتب منتجات.

## 4.5 Market Research (بحث السوق)

- **الوظيفة**: إدارة عناصر بحث سوق (منافس مباشر / غير مباشر / اتجاه / شريحة / نموذج تسعير / SWOT).
- **المستخدم**: Product Lead.
- **المرحلة**: discovery_and_research.
- **المدخلات**: بحث يدوي + مراجع.
- **المخرجات**: قائمة `MarketResearchItem` مع confidence + informationClass + confidentiality.
- **الحقول المهمّة**: `informationClass` (طبيعة: fact/inference/assumption/hypothesis/decision — إلى جانب legacy/verified/needs_review للتوافق) و **`confidentiality`** (public / internal / confidential). كل واحد **مستقلّ عن الآخر** — قد تكون معلومة `verified` لكنها `confidential`.
- **مثال**: منافس مباشر: «نور أكاديمي» - رسوم اشتراك شهري 99 ريال - نقاط الضعف: تجربة موبايل ضعيفة - confidence 80 - internal.
- **أخطاء شائعة**: خلط طبيعة المعلومة بسريّتها؛ إضافة منافس بدون رابط أو مصدر.

## 4.6 Problem Validation (تحقّق المشاكل)

- **الوظيفة**: توثيق أدلّة الألم (Evidence) من مقابلات، استبيانات، جلسات مسجّلة.
- **المستخدم**: Product Lead.
- **المرحلة**: analysis_and_validation.
- **المدخلات**: مقابلات، استبيانات، بيانات تحليلية، تذاكر دعم.
- **المخرجات**: قائمة `ProblemValidationItem` مع painPoint + quote + strength + confidentiality.
- **مثال**: مقابلة مع ولي أمر: «أدفع كل شهر لخمسة معلّمين مختلفين وأنسى المواعيد» — strength 90 — user_interview.
- **الاكتمال**: `problem_validation` = true (في Checklist المرحلة).

## 4.7 Product Definition (تعريف المنتج)

- **الوظيفة**: كتابة Problem Brief + Scope & MVP باستخدام MoSCoW.
- **المستخدم**: Product Lead.
- **المرحلة**: product_definition.
- **العلاقات**: يقود إلى Personas → User Flows → Requirements → Stories → AC.
- **مثال**: MVP الأكاديمية Must = تسجيل طالب، جدول أسبوعي، دفع اشتراك، إشعار ولي أمر. Should = تقارير تقدّم شهرية. Could = شارات تحفيزية. Won't = تطبيق موبايل مستقل في هذه المرحلة.

## 4.8 Personas (شرائح المستخدمين)

- **الوظيفة**: تعريف كل شريحة (اسم، دور، JTBD، Goals، Pains، قنوات، techSavviness 0–100، isPrimary).
- **المستخدم**: Product Lead.
- **المرحلة**: product_definition.
- **مثال Persona أساسية**: «سارة أم لطالبين، 38 سنة، تتواصل عبر WhatsApp، تفتقر لوقت المتابعة الأسبوعية». isPrimary = true.

## 4.9 User Flows (رحلات المستخدم)

- **الوظيفة**: توثيق الرحلات (primary / secondary / edge) بخطوات ذات نتائج متوقعة.
- **العلاقات**: مرتبطة اختيارياً بـ Persona.
- **مثال**: Flow «تسجيل طالب جديد» — Trigger: يفتح ولي الأمر رابط التسجيل → Steps: إدخال بيانات → اختيار مدرس → دفع → استلام إيصال → Success: رسالة تأكيد + إشعار في التطبيق.

## 4.10 Requirements (المتطلبات)

- **الوظيفة**: قائمة متطلبات وظيفية/غير وظيفية مع MoSCoW (must / should / could / wont) وحالة (draft/approved/…).
- **مثال**: REQ-001 - «نظام دفع Apple Pay» - must - approved - مرتبط بـ Flow «التسجيل».

## 4.11 User Stories (قصص المستخدم)

- **الوظيفة**: قصص بصيغة «كـ [persona] أستطيع [X] لكي [Y]» مرتبطة بـ AC.
- **مثال**: STORY-005 - «كوليّ أمر، أستطيع دفع اشتراك شهري مرة واحدة بحيث يتجدّد تلقائياً، لكي أتجنّب النسيان».

## 4.12 Acceptance Criteria (معايير القبول)

- **الوظيفة**: شروط قبول قابلة للاختبار لكل قصة (Given/When/Then أو قائمة).
- **مثال**: AC-005-01 - «Given ولي أمر مسجَّل، When ينشّط الاشتراك التلقائي، Then تُخصَم القيمة كل 30 يوم بدون تدخل».

## 4.13 Evidence Traceability (تتبّع الأدلّة)

- **الوظيفة**: ربط كل عنصر منتج (Persona/Flow/Requirement/Story/AC) بالدليل المصدر (Interview/Survey/…).
- **العلاقات**: يسحب من Problem Validation + Market Research.
- **مثال**: STORY-005 ← Evidence #12 (مقابلة ولي أمر) + Evidence #17 (استبيان 40 ولي أمر: 82% يريد تجديد تلقائي).

## 4.14 Prototype Prompt (توليد Prompt للنموذج)

- **الوظيفة**: توليد خطة Prompt V2 لأداة تصميم Prototype (خارجياً) بناءً على Stories + AC.
- **المخرجات**: نص Prompt جاهز للنسخ.

## 4.15 Prototype Review (مراجعة النموذج)

- **الوظيفة**: تسجيل ملاحظات المراجعة على Prototype ومتابعة إصلاحها.
- **المستخدم**: Product Lead + Ops Lead + Owner. **ليست QA هندسية**.
- **مثال**: ملاحظة «شاشة الدفع لا تعرض المبلغ قبل الضغط» — severity: high — resolved.

## 4.16 PRD

- **الوظيفة**: تجميع Product Requirement Document نهائي معتمَد.
- **المخرجات**: `prd_final` (أحد الـ 7 عناصر الإلزامية في Handoff).

## 4.17 Product Evaluation Guide

- **الوظيفة**: كتابة سيناريوهات تقييم منتَجية (وليست اختبار كود). الفئات الحديثة: usability, empty_states, error_states, mobile_rtl, ux_clarity, accessibility, user_outcomes.
- **العلاقات**: مرتبطة بـ Story أو Flow (اختياري).
- **مثال**: EVAL-01 - mobile_rtl - «تحقق أن شاشة الدفع تعمل يميناً لليسار على iPhone SE بدون قصّ» - severity: high.

## 4.18 Commercial (تجاري)

- **الوظيفة**: تسجيل معلومات تجارية للمشروع (تسعير مبدئي، عرض).
- **المرحلة**: يبدأ من client_and_project وقد يستمر.

## 4.19 Commercial Full / Proposals & Pricing / Contracts / Payments / Change Requests

- **الوظيفة**: توسّع تجاري كامل — عروض مفصّلة، عقود، دفعات (كسجلّ)، طلبات تغيير (Change Requests).
- **المستخدم**: Ops Lead بشكل رئيسي.
- **مؤجّل**: تصدير PDF رسمي، بوابة دفع، توليد عقد تلقائي.

## 4.20 Client Approval (اعتماد العميل)

- **الوظيفة**: إنشاء طلب اعتماد مرتبط بنسخة (`targetType` + `targetVersion`) وإرسال رابط Portal.
- **الحالات**: pending / decided / expired / revoked.
- **القرارات**: approved / rejected / changes_requested.
- **العلاقات**: يُثبَّت على «هدف» (prd, presentation, proposal, brain).

## 4.21 Handoff Package (حزمة التسليم)

- **الوظيفة**: حاوية (Container) تجمع 7 عناصر إلزامية (product-focused) + عناصر اختيارية.
- **العناصر الإلزامية السبعة** (من `MANDATORY_HANDOFF_KEYS`): problem_brief, scope_mvp, user_stories, acceptance_criteria, prototype_link, prd_final, product_evaluation_guide.
- **الحالات**: draft / ready / finalized / superseded.
- **ملاحظة مهمة**: هذه حاوية وليست «قسماً إضافياً». تسحب محتواها من التبويبات الأخرى.

## 4.22 External Partners (الشركاء الخارجيون)

- **الوظيفة**: دعوة شريك تقني على مستوى المشروع بدور `viewer` (الـ `editor` مهجور — لا صلاحيات فعّالة له).
- **الحالات**: invited / active / suspended / revoked / expired.
- **مؤجّل**: Public Partner Portal بدون تسجيل دخول.

## 4.23 Tasks / Activity / Collaboration / Support Requests

- **Tasks**: مهام داخل المشروع.
- **Activity**: سجلّ عابر للأحداث (audit view للمستخدم).
- **Collaboration**: تعليقات على العناصر.
- **Support Requests**: طلبات دعم من داخل المشروع (advanced).

## 4.24 Advanced / Extended

- تبويبات فئة advanced مخفية خلف toggle.
- تبويبات Extended Technical Delivery محمية بـ Feature Flag + server-side guard.

# الفصل الخامس: العلاقات بين التبويبات

## جدول العلاقات

| المصدر | ينتج | يستخدمه |
| --- | --- | --- |
| Discovery | إجابات العميل | Analysis, Brain, Market Research |
| Market Research | منافسون + شرائح | Brain, Product Definition, Personas |
| Problem Validation | أدلة الألم | Brain, Evidence Traceability, Personas |
| Brain v2 | ملخّص فهم موحّد | Product Definition, PRD, Handoff |
| Product Definition | Problem Brief + MVP | Personas, Flows, Requirements |
| Personas | شرائح | User Flows, Stories, Evidence |
| User Flows | خطوات | Requirements, Stories, Evaluation |
| Requirements | متطلبات MoSCoW | Stories, PRD |
| User Stories | قصص | AC, Evaluation, Prototype Prompt, Handoff |
| Acceptance Criteria | شروط قبول | Prototype Review, Evaluation, Handoff |
| Prototype Prompt | نصّ Prompt | Prototype خارجي |
| Prototype (رابط) | نموذج تفاعلي | Product Review, Client Approval, Handoff |
| Product Review | ملاحظات مراجعة | إصلاح Prototype |
| Product Evaluation Guide | سيناريوهات تقييم | Handoff |
| Client Approval | قرار موثّق على نسخة | Handoff (شرط) |
| Handoff Package | حزمة تسليم | External Partner |
| External Partner | استلام | إغلاق المشروع |

## مخطط بصري

```
Discovery ──┐
Meetings ───┼──► Brain v2 ──► Product Definition ──► Personas
Research ───┤                                    └──► User Flows ──► Requirements
Validation ─┘                                                     └──► User Stories ──► AC
                                                                                      │
                                                              Prototype Prompt ◄──────┤
                                                                    │                 │
                                                                    ▼                 ▼
                                                                Prototype ──► Product Review
                                                                    │                 │
                                                                    └──► Client Approval ──► Handoff Package ──► External Partner
                                                                                       (7 mandatory)
```

# الفصل السادس: الأدوار وتقسيم العمل بين شخصين

## Product Lead

- **المسؤوليات**: تعريف المنتج بالكامل — Discovery Analysis، Brain، Personas، Flows، Requirements، Stories، AC، Prototype Prompt، Product Review، Evaluation Guide، PRD.
- **الأدوات اليومية**: Discovery (قراءة الإجابات)، Brain v2، Product Definition، Stories، Traceability، PRD، Evaluation.
- **يحتاج مراجعة الطرف الآخر**: قبل إرسال أي شيء للعميل، قبل تجميد Handoff.

## Operations Lead

- **المسؤوليات**: تشغيل العلاقة مع العميل والشريك — Client & Project setup، Meetings، Discovery Form dispatch، Client Portal، Commercial، Contracts، Payments، Handoff dispatch، Partner invites، Tasks.
- **الأدوات اليومية**: Overview، Meetings، Commercial، Approvals، Handoff، Partners، Tasks.
- **يحتاج مراجعة Product Lead**: قبل إرسال Portal، قبل الرد على تعديل من العميل.

## منع تضارب القرارات

- **قرار تقني/منتَجي**: Product Lead (Requirements، Scope، Personas).
- **قرار تجاري/عقدي/زمني**: Operations Lead (Pricing، Contracts، مواعيد).
- **قرار مشترك**: أي تغيير في Scope بعد Approval (يحتاج تسجيل Change Request + إعادة توقيع).

## دور Tasks/Collaboration/Activity في التنسيق

- **Tasks**: من ينفّذ ماذا ومتى.
- **Collaboration**: نقاش داخل عنصر (Story، Persona) بدل قنوات خارجية.
- **Activity**: سجلّ «من غيّر ماذا متى» — يحلّ نزاعات الذاكرة.

# الفصل السابع: سيناريو عملي كامل «أكاديمية تعليمية»

**السياق**: عميل مؤسّس أكاديمية تعليمية أونلاين، يريد منصّة تسجيل ودفع للطلاب مع تجربة موبايل قوية. المشروع مدّته ثمانية أسابيع للتعريف والاعتماد ثم يُسلَّم لشريك تقني للتنفيذ.

1. **Ops Lead** يدخل Lead جديد من قائمة Leads → يحوّله لمشروع «أكاديمية النور». في: Leads → «تحويل». مخرَج: صف في projects.
2. **Ops** يفتح Overview → يحدّد القطاع (تعليم)، الميزانية (150k)، المدة (8 أسابيع)، يعيّن نفسه Owner. اكتمال: 5 عناصر client_and_project إلزامية.
3. **Ops** يفتح Discovery → ينشئ نموذج اكتشاف من قالب تعليم → ينسخ رابط Portal.
4. **Ops** يرسل الرابط للعميل عبر WhatsApp (يدوياً — لا يوجد إرسال تلقائي).
5. **العميل** يفتح الرابط ويجيب على 17 قسم (Discovery Portal).
6. **Ops** يستلم الإشعار → يعلّم `discovery_submitted`.
7. **Product Lead** يفتح Meetings → يجهّز أجندة اجتماع أول باستخدام Meeting Preparation.
8. **Product Lead + Ops** يعقدان الاجتماع مع العميل، يوثّقان القرارات في Meetings.
9. **Product Lead** يفتح Market Research → يضيف 4 منافسين (مباشر + غير مباشر)، اتجاهين، نموذج تسعير مقترح — مع informationClass=fact و confidentiality=internal.
10. **Product Lead** يفتح Problem Validation → يوثّق 6 مقابلات مع أولياء أمور (evidenceType=user_interview) + مسح صغير من 40 ولي أمر.
11. **Product Lead** يفتح Project Brain → يبني Brain باستخدام كل ما سبق. يعتمد Brain Review (7 blockers محلولة).
12. **Product Lead** يفتح Product Definition → يكتب Problem Brief (فقرة واحدة) + Scope & MVP (Must/Should/Could/Won't).
13. **Product Lead** ينشئ 3 Personas في Personas — واحدة isPrimary (سارة ولي أمر).
14. **Product Lead** يفتح User Flows → 5 flows أساسية (تسجيل، دفع، متابعة تقدّم، تواصل معلّم، تجديد اشتراك).
15. **Product Lead** يفتح Requirements → 24 متطلب مقسّم MoSCoW (14 must، 6 should، 3 could، 1 wont).
16. **Product Lead** يفتح User Stories → 18 قصة مرتبطة بـ Personas.
17. **Product Lead** يفتح Acceptance Criteria → 3–5 AC لكل قصة.
18. **Product Lead** يفتح Evidence Traceability → يربط كل Story بأدلّة (من Problem Validation).
19. **Product Lead** يفتح Prototype Prompt → يولّد Prompt V2 → ينسخه لأداة التصميم الخارجية.
20. **مصمم/Product Lead** يبني Prototype خارجياً → يضع رابطه في تبويب Prototype.
21. **Product Lead + Owner** يفتحان Prototype Review → يسجّلان ملاحظات (11 ملاحظة) → يحلّانها.
22. **Product Lead** يكتب PRD نهائي في تبويب PRD → يعتمده.
23. **Product Lead** يكتب Product Evaluation Guide (14 سيناريو تركّز على mobile_rtl و usability و empty_states).
24. **Ops Lead** يفتح Client Approval → ينشئ طلب اعتماد على النسخة الحالية للـ Prototype + Scope → يرسل رابط Portal للعميل يدوياً.
25. **العميل** يفتح Portal → يعاين → يعتمد (decision=approved) → يُختم بـ decidedAt + audit.
26. **Ops Lead** يفتح Handoff → ينشئ حزمة (draft) → يعبّئ الـ 7 عناصر الإلزامية + عناصر اختيارية (source_repo، env_config_template).
27. **Ops Lead** يفتح External Partners → يدعو شريك تقني (بريد + دور viewer).
28. **الشريك** يستلم Access Token → يفتح مساحته → يستعرض الحزمة → يطرح 4 أسئلة عبر Collaboration.
29. **Product Lead** يجيب على الأسئلة.
30. **Ops Lead** يعلّم `package_delivered` + `handoff_accepted`. المشروع يُعتَبر مكتمل التسليم.

# الفصل الثامن: المخرجات النهائية (Deliverables)

- **Problem Brief**: فقرة/فقرتان تلخّص المشكلة، من يعانيها، والدليل. تُكتَب في Product Definition، تُصدَّر كعنصر من Handoff.
- **Scope & MVP**: قائمة MoSCoW كاملة تحدّد ما داخل النطاق وما خارجه.
- **User Stories**: بصيغة موحّدة مرتبطة بـ Personas.
- **Acceptance Criteria**: شروط قابلة للاختبار لكل قصة.
- **Prototype**: رابط تفاعلي (Figma / Framer / أداة خارجية) — يُخزَّن كرابط.
- **PRD**: وثيقة تعريف منتج نهائية معتمَدة.
- **Product Evaluation Guide**: سيناريوهات تقييم منتَجية (وليست QA هندسية).
- **Handoff Package**: **حاوية**، ليست قسماً إضافياً. تسحب من العناصر السابقة وتُلبس تسمية «مُسلَّم». العناصر الإلزامية سبعة (`MANDATORY_HANDOFF_KEYS` في `lib/handoff/types.ts`): problem_brief, scope_mvp, user_stories, acceptance_criteria, prototype_link, prd_final, product_evaluation_guide.

# الفصل التاسع: Client Approval Portal

## كيف يُنشأ الرابط

من تبويب Client Approval داخل المشروع → «طلب اعتماد جديد» → اختيار الهدف (`targetType`: prd / presentation / proposal / brain) + النسخة (`targetVersion`) + بريد العميل + مدة الصلاحية. النظام يولّد `publicToken` عشوائياً ويحفظ `expiresAt`.

## الأمان

- **Token**: طويل وعشوائي، جزء من URL.
- **Expiry**: تاريخ انتهاء إلزامي (`expiresAt`).
- **Revoke**: إلغاء يدوي بأي وقت (`revokedAt` + `revokeReason`).
- **Version Pinning**: القرار مثبَّت على `targetVersion` — لا يمكن اعتبار موافقة قديمة موافقة على نسخة جديدة.
- **Audit Trail** (`approval_audit`): كل حدث (viewed, decided, revoked, link_shared, expired) يُسجَّل مع actor + eventMeta.

## ما يراه العميل

- عنوان + ملخّص + محتوى الهدف (Prototype embed / PRD summary / صور Presentation).
- زر «اعتمد» / «اطلب تعديلات» / «رفض» + حقل ملاحظات.
- **لا يرى**: بيانات مالية داخلية، مصادر التسعير، عناصر Advanced، Handoff Package التفصيلية، أسماء الشركاء الآخرين.

## كيف يوافق العميل

يختار قراراً واحداً (`approved` / `changes_requested` / `rejected`) ويضيف ملاحظة اختيارية. النظام يختم `decidedAt` وينقل الحالة من `pending` إلى `decided`.

## رفض العميل / طلب تعديل

- `changes_requested`: يفتح دورة تعديلات، الحالة تعود عملياً لمرحلة Prototype/Definition.
- `rejected`: قرار موثَّق برفض، Ops يفتح محادثة استعادة.

## منع خلط الموافقات

Version Pinning يضمن: لو تم اعتماد النسخة 3 من Prototype، ثم أنشأنا نسخة 4 بعد ملاحظات جديدة، فإن الموافقة على 3 **لا تنسحب** على 4. يجب إنشاء طلب اعتماد جديد.

# الفصل العاشر: External Technical Partner

## عضوية على مستوى المشروع

الشريك التقني ليس **دوراً عاماً** في المنصة. لا يظهر في قوائم Team Members. يُدعى إلى **مشروع واحد فقط** من تبويب External Partners.

## ما يراه/لا يراه

- **يراه**: Handoff Package الخاصة بمشروعه، PRD النهائي، Stories/AC/Flows/Requirements، Evaluation Guide، Prototype، الأسئلة والأجوبة (Collaboration).
- **لا يراه**: تفاصيل تجارية (Pricing، Contracts، Payments)، مشاريع أخرى، مستخدمو المنصّة، Discovery الأصلي (بيانات العميل الحساسة).

## دور `viewer` فقط

`role='viewer'` هو المستخدَم فعلياً. القيمة `editor` **مهجورة** (لا صلاحيات فعّالة لها) وموجودة فقط لتوافق بيانات قديمة. الشركاء الجدد يجب أن يكونوا viewer.

## لا يوجد Public Partner Portal حالياً

الشريك يستخدم Access Token خاص، لكن لا يوجد بوابة عمومية مستقلّة (Deferred).

# الفصل الحادي عشر: Readiness Metrics (المقاييس الستة)

مصدر التعريف: `lib/project-readiness/registry.ts` — مصدر الحساب: `lib/project-readiness/compute.ts`. الستة **مؤشرات وليست بوابات**.

| # | المفتاح | العنوان | يقيس | مرحلة Workflow |
| --- | --- | --- | --- | --- |
| 1 | discovery_completeness | اكتمال الاكتشاف | Discovery + Meetings + Interviews | discovery_and_research |
| 2 | problem_validation | التحقق من المشاكل | Analysis + Brain + Validation | analysis_and_validation |
| 3 | product_definition_ready | جاهزية تعريف المنتج | Brief + MVP + Personas + Flows + Reqs + Stories + AC | product_definition |
| 4 | prototype_ready | جاهزية Prototype | Plan + Prompts + Link + Product Review | prototype_and_review |
| 5 | client_approval | موافقة العميل | Presentation + Portal + Scope + Prototype approved | client_approval |
| 6 | handoff_ready | جاهزية التسليم | Package + Evaluation + Partner accepted | handoff_and_closure |

**كيفية الحساب**: لكل مقياس، نأخذ عناصر Checklist المرحلة المرتبطة (`lib/workflow-v2/registry.ts`):
- الإلزامية = 80% من الوزن.
- الاختيارية = 20% من الوزن.
- `skipped` تُعامل كمكتملة.
- `blocked` لا تُعدّ اكتمالاً.
- لو ما فيه إلزامية أصلاً، الاختيارية تأخذ 100%.

**معنى النسبة**: 0% = لم يبدأ، 50% = نصف العناصر الإلزامية، 100% = كل الإلزامية والاختيارية مكتملة.

**خطوات الرفع العملية**: افتح المرحلة → افتح Checklist → أكمل العنصر الإلزامي التالي (لا تقفز للاختياري قبل الإلزامي). لو عنصر لا ينطبق فعلاً على المشروع، استخدم `skipped` مع ملاحظة سبب.

# الفصل الثاني عشر: الصلاحيات والأمان

## الأدوار العامة (من `lib/auth/rbac.ts` + `lib/auth/roles.ts`)

- **owner**: أعلى مستوى. إدارة النظام كاملة.
- **admin**: إدارة مساحة العمل باستثناء عمليات owner-only (مثل حذف نهائي).
- **supervisor**: مستوى إشرافي، أعلى من member.
- **member**: تشغيل يومي.

الفحص هرمي: `roleSatisfies(role, allowed)` — أي دور أعلى يعبر تلقائياً. Status الحساب يُفحَص مركزياً: أي حالة غير `active` (locked/inactive/suspended/pending/deleted) = رفض فوري لكل العمليات.

## external_partner

**ليس دوراً عاماً**. عضوية مشروع فقط (`external_partners` table). لا يظهر في `profiles.role`.

## حماية Client Portal

- Token عشوائي طويل + expiresAt + revoke.
- Version pinning يمنع اعتبار موافقة قديمة موافقة على نسخة جديدة.

## RLS + RBAC معاً

- **RLS**: طبقة أمان أخيرة داخل PostgreSQL — تمنع أي غير مسجَّل من الوصول لأي صف.
- **RBAC** (server actions): طبقة أولى — تعطي رسائل خطأ واضحة قبل ما يصل الطلب لـ DB. لا نعتمد على RLS لتعرض رسائل «مرفوض» (RLS ترجع فراغاً).

## Feature Flags

- `product_mode`: يُفعّل واجهة NEXVORA الجديدة (Workflow v2, Readiness Metrics).
- `extended_technical_delivery`: يُظهر مجموعة التبويبات التاسعة (execution — QA هندسية). محمي **server-side**: page.tsx يرفض `?tab=<execution-key>` ويعيد التوجيه للـ overview، وكل server action يُفحَص بـ `requireExtendedTechnical()`.

القاعدة: `enabled_per_user` يعكس السلوك عن `enabled_globally` — لو الفلاغ Global=true فالمستخدم في القائمة يُستَثنى (disable له)، والعكس بالعكس. Fail-safe: أي فشل في القراءة = false.

## Tokens + Audit Logs + Version Pinning + Deep-link Protection

- كل token يُخزَّن hashed (حيث يمكن) ومحدود الصلاحية.
- Audit tables: `approval_audit`, وسجلات مشابهة.
- Deep-links إلى تبويبات extended لا تعمل بدون flag — server يعيد التوجيه.

# الفصل الثالث عشر: ما هو موجود مقابل مؤجَّل

## Implemented (موجود ومكتمل)

| الوظيفة | التفاصيل |
| --- | --- |
| Workflow v2 (7 مراحل) | registry.ts + migration 0096 |
| 6 Readiness Metrics | registry.ts + compute.ts |
| Discovery Form + Portal | discovery-form/, discovery-portal/ |
| Discovery Analysis (17 قسم) | discovery-analysis/ |
| Project Brain v2 | brain-v2/ |
| Market Research + Problem Validation | market-research/types.ts (0098) |
| information_class + confidentiality منفصلين | market-research/types.ts (0106) |
| Product Definition | product-definition/ (0099) |
| Personas / Flows / Requirements | product-definition/types.ts |
| User Stories + AC | user-stories/ (0100) |
| Evidence Traceability | evidence/ (0101) |
| Product Evaluation Guide (فئات UX جديدة) | evaluation/types.ts (0102 + 0106) |
| Prototype Prompt V2 | prototype-prompt/ |
| Product Review | review/ |
| PRD | prd/ |
| Commercial + Commercial Full | commercial/, commercial-full/ (0097, 0103) |
| Client Approval Portal | client-approval/ (0104), app/approve/[token] |
| Handoff Package (7 إلزامية product-focused) | handoff/types.ts (0105 + 0106) |
| External Partners (project-level, viewer) | handoff/types.ts (0105) |
| Feature Flags + Extended Guard | feature-flags/ (0095) |
| RBAC هرمي + Status check | auth/rbac.ts |
| Tasks / Activity / Collaboration | workspace-tasks/, collaboration/ |

## Partially Implemented / Manual

| الوظيفة | ماذا يعني عملياً |
| --- | --- |
| مشاركة الروابط (Discovery / Approval) | يدوي عبر WhatsApp/بريد |
| تصدير PDF | غير مدعوم رسمياً — طباعة متصفح |
| Meeting Presentation | شرائح داخل التطبيق، لا تصدير PPTX جاهز |
| Prototype | رابط خارجي فقط — التوليد على أدوات أخرى |

## Deferred

| الوظيفة | الحالة |
| --- | --- |
| Email Sending تلقائي | مؤجَّل |
| PDF Export رسمي | مؤجَّل |
| AI Pipelines (توليد Stories/PRD تلقائي) | مؤجَّل (Prompt فقط) |
| Public Partner Portal | مؤجَّل (Access Token فقط داخل المشروع) |
| بوابات الدفع الفعلية | مؤجَّل (Payments سجلّ فقط) |
| Zoom / Meet integration | مؤجَّل |

## Extended Technical Delivery (خلف Flag)

- Prompt Review / Code Execution
- Engineering QA + Review
- Fix Prompt
- Production Monitoring + Prompt Studio + Review

# الفصل الرابع عشر: دليل التشغيل اليومي (SOP)

## قبل المقابلة مع العميل

1. Ops يفتح Meeting Preparation → يولّد أجندة.
2. Product Lead يراجع الأجندة + يفتح Brain (لو موجود).
3. Product Lead يجهّز 3 أسئلة أساسية للاجتماع.

## أثناء المقابلة

1. فتح Meeting Presentation على الشاشة المشتركة.
2. تدوين قرارات لحظياً في نافذة Meetings الأخرى.
3. عدم تأجيل التوثيق «لبعدين».

## بعد المقابلة

1. Product Lead يدخل قرارات المقابلة إلى Brain.
2. تحديث حالات Checklist في Workflow.
3. إنشاء Tasks لأي إجراء لاحق.

## قبل توليد Prototype

1. تأكّد أن Requirements + Stories + AC مكتمَلة (Readiness 3 ≥ 80%).
2. راجع 3 قصص عالية الأولوية مع Owner.
3. افتح Prototype Prompt → ولّد Prompt V2.

## قبل Client Approval

1. راجع الإصلاحات على Prototype كلها resolved.
2. تأكّد أن PRD نهائي معتمَد.
3. حدّد expiresAt واقعي (72 ساعة عادةً).

## قبل Handoff

1. تحقّق أن العناصر السبعة الإلزامية جاهزة.
2. Evaluation Guide مكتمل بسيناريوهات UX.
3. تحقّق أن Client Approval موجود على النسخة الحالية.

## بعد التسليم للمطور

1. ادع الشريك في External Partners.
2. راقب Collaboration لأي أسئلة.
3. علّم `handoff_accepted` بعد التأكيد الرسمي.

# الفصل الخامس عشر: الأخطاء الشائعة

1. **الخلط بين UI Groups و Workflow Stages** — التنقل بين تبويبات مجموعة «الاكتشاف» لا يعني أنك تنتقل بين مراحل Workflow.
2. **اعتبار Readiness Metric bad = بوّابة** — النظام لا يمنعك، فلا تجمّد المشروع بانتظار 100%.
3. **إرسال Discovery Form بدون تخصيص للقطاع**.
4. **كتابة Brain كسرد إنشائي بدون نقاط قابلة للاستشهاد** — يستحيل الرجوع لها لاحقاً.
5. **الخلط بين informationClass و confidentiality** — طبيعة المعلومة (fact/assumption) شيء، ومستوى السرّية (public/internal/confidential) شيء آخر.
6. **معاملة Product Review كأنه QA هندسية** — Product Review يركّز على المنتج (وضوح، UX، empty states)، وليس اختبار كود.
7. **إنشاء Approval بدون Version Pinning صريح** — النظام يفرض `targetVersion` لكن قد ينسى المستخدم إنشاء طلب جديد بعد تعديل.
8. **دعوة شريك بدور editor** — القيمة مهجورة. استخدم viewer فقط.
9. **توقع أن النظام يرسل بريداً تلقائياً** — كل الروابط تُشارَك يدوياً.
10. **إضافة تبويب Extended من deep-link ظنّاً أنه سيعمل** — server يرفض ويعيد التوجيه.
11. **الاعتقاد أن Handoff Package قسم منفصل** — هي حاوية تسحب من التبويبات الأخرى، ليست إعادة كتابة.
12. **إغفال Evidence Traceability** — قصص بدون أدلة تنهار عند سؤال العميل «ليه؟».

# الفصل السادس عشر: قاموس المصطلحات

- **Workflow v2**: نظام المراحل السبع الرسمية للمشاريع.
- **UI Groups / Phases**: مجموعات تجميع للتبويبات على شاشة المشروع (٨ + ١ خلف flag).
- **Readiness Metric**: مؤشر (لا بوّابة) لنسبة اكتمال مرحلة.
- **Product Discovery**: جمع فهم من العميل والسوق.
- **Product Definition**: تحويل الفهم إلى مواصفة قابلة للتنفيذ.
- **Prototype**: نموذج تفاعلي (رابط خارجي).
- **Product Review**: مراجعة منتَجية داخلية قبل العميل.
- **Product Evaluation Guide**: سيناريوهات تقييم UX/منتَجية.
- **PRD**: Product Requirement Document.
- **Handoff Package**: حاوية التسليم للشريك (7 إلزامية).
- **Client Approval Portal**: بوابة موافقة العميل عبر Token عام.
- **External Partner**: عضوية مشروع لشريك تقني (viewer فقط).
- **MoSCoW**: Must / Should / Could / Won't.
- **Persona**: شريحة مستخدم بـ JTBD + Goals + Pains.
- **User Flow**: رحلة استخدام (primary/secondary/edge).
- **User Story**: قصة «كـ X أستطيع Y لكي Z».
- **Acceptance Criteria (AC)**: شروط قبول قابلة للاختبار.
- **Evidence**: دليل مصدر (مقابلة، استبيان…).
- **Traceability**: ربط عنصر منتج بدليله.
- **Brain v2**: عقل المشروع — تجميع فهم موحّد.
- **Brain Review Blockers**: 7 قيود يجب حلّها قبل اعتماد Brain.
- **Feature Flag**: مفتاح تشغيل ميزة (product_mode / extended_technical_delivery).
- **Extended Technical Delivery**: مجموعة تبويبات QA هندسية مخفية.
- **information_class**: طبيعة المعلومة (fact/inference/assumption/hypothesis/decision + قيم قديمة).
- **confidentiality**: مستوى السرّية (public/internal/confidential) — منفصل عن الطبيعة.
- **Version Pinning**: تثبيت موافقة العميل على نسخة محدّدة.
- **RBAC**: Role-Based Access Control (owner/admin/supervisor/member).
- **RLS**: Row-Level Security في PostgreSQL.
- **Deep-link Protection**: حماية server-side ضد الوصول لتبويبات extended عبر URL.

# الفصل السابع عشر: الخلاصة التنفيذية

**ماذا نفعل يومياً في NEXVORA؟** ندير مشاريع منتج من الفكرة الخام إلى حزمة جاهزة للتسليم للمطوّر، عبر سبع مراحل رسمية، مع ستة مقاييس جاهزية توضّح لنا مكاننا في كل مشروع.

**من يفعل ماذا؟** Product Lead يعرّف المنتج (Brain، Definition، Stories، AC، Evaluation، PRD). Operations Lead يشغّل العلاقة مع العميل والشريك (Setup، Meetings، Portal، Handoff، Partners). كل قرار Scope يمرّ على Product Lead، وكل قرار تجاري يمرّ على Ops Lead، والتغييرات بعد Approval قرار مشترك يستدعي Change Request.

**كيف نعرف أن مشروعاً جاهز للتسليم؟** الست بطاقات Readiness ≥ 80% (مع الست إلزامية 100%)، والعناصر السبعة الإلزامية في Handoff Package مكتمَلة، و Client Approval موجود على النسخة الحالية.

**ماذا لا يفعله النظام؟** لا يرسل بريداً تلقائياً، لا يصدر PDF جاهزاً، لا يشغّل خطوط أنابيب AI تولّد قصصاً كاملة، لا يفتح بوابة عامة للشريك، وليس نظام محاسبة.

**كيف نتجنّب أكبر خطأ؟** لا نخلط بين مراجعة المنتج (Product Review) ومراجعة الجودة الهندسية (Engineering QA خلف flag)، ولا بين UI Groups و Workflow Stages، ولا بين طبيعة المعلومة وسرّيتها. كل خطأ من هذه الثلاثة يبني قراراً على وهم.

**النقطة الأهم**: النظام مبني على قاعدة «الأدلّة قبل الادّعاء». كل قصة يجب أن ترتبط بدليل، كل موافقة يجب أن ترتبط بنسخة، كل تسليم يجب أن يرتبط بموافقة موثَّقة.

---

# ملاحظات التحقق

- سبع مراحل Workflow v2 كما هي في `lib/workflow-v2/registry.ts`. الأسماء والمفاتيح مؤكَّدة.
- ستة Readiness Metrics كما في `lib/project-readiness/registry.ts`. الحساب 80/20 من `compute.ts`.
- سبعة عناصر إلزامية في Handoff مؤكَّدة من `HANDOFF_ITEM_REGISTRY` في `lib/handoff/types.ts` (بعد migration 0106): problem_brief, scope_mvp, user_stories, acceptance_criteria, prototype_link, prd_final, product_evaluation_guide.
- العناصر القديمة (brain_snapshot, presentation_final, developer_handoff, final_contract, sign_off_letter) بقيت في السجلّ **كاختيارية** — لم تُحذف حفاظاً على بيانات الحزم القديمة.
- `product_mode` و `extended_technical_delivery` هما الفلاغَين الوحيدَين المعروفَين في `KNOWN_FLAGS`.
- الأدوار العامة: owner, admin, supervisor, member. external_partner ليس دوراً عاماً بل عضوية مشروع (`external_partners`).
- في `PartnerRole` القيمة `editor` مهجورة (JSDoc @deprecated) — لا صلاحيات فعّالة، القيمة موجودة للتوافق فقط.
- `informationClass` وسّع في migration 0106 ليشمل fact/inference/assumption/hypothesis/decision بالإضافة إلى القيم القديمة (unclassified/legacy/needs_review/verified). `confidentiality` قيمة مستقلّة (public/internal/confidential).
- فئات التقييم الجديدة (`NEW_EVAL_CATEGORIES`) لا تشمل functional/performance/security (تُركت للتوافق مع البيانات القديمة).
- UI Groups: ٨ أساسية + ٩ عند تفعيل extended (execution). محمي server-side في `page.tsx` + `requireExtendedTechnical()`.
- كل الروابط للعميل والشريك تُشارَك **يدوياً** — لا يوجد بريد تلقائي في مسار الاعتماد أو الاكتشاف.
