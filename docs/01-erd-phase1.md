# ERD — Phase 1 (Auth + Leads + Discovery Form + Project Brain)

هذا المخطط يغطي فقط نطاق Phase 1 المتفق عليه: لا جداول لـ AI Agents، الاجتماعات،
الـ PRD التوليدي، أو ما بعد الإطلاق — هذول هيتضافوا في Phases لاحقة فوق نفس الأساس.

## مبادئ التصميم

- **DDD خفيف**: كل جدول = كيان له معنى عملي واحد واضح، لا تكرار بيانات.
- **RBAC قابل للتوسع لـ ١٠ مستخدمين**: جدول `roles` و`permissions` منفصلين من
  الأول، مش hardcoded على شخصين. البداية العملية: كل مستخدم جديد بياخد دور
  `owner` أو `member` بس فعليًا، لكن الجدول جاهز لإضافة أدوار تانية بعدين
  (مثلاً `client_viewer` لما نفتح مجال للعميل يشوف حالة مشروعه).
- **Audit Log من الأول**: جدول واحد عام (`audit_log`) بيسجل أي تغيير على أي
  كيان مهم، بدل ما نضيفه بعدين لكل جدول لوحده.
- **Project Brain مش جدول منفصل**: هو *مفهوم* (single source of truth) بيتحقق
  عن طريق إن كل الجداول التانية (leads, discovery_forms, إلخ) مربوطة بـ
  `project_id` واحد، والصفحة نفسها هتقرا منهم كلهم مجمّعين. مفيش تكرار بيانات
  في جدول Brain لوحده.

## الكيانات (Entities)

### `profiles`
ملف كل مستخدم داخلي (انت، أخوك، أو أي عضو تضيفه لاحقًا). مرتبط بـ
`auth.users` بتاع Supabase تلقائيًا.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | = auth.users.id |
| full_name | text | |
| email | text | |
| avatar_url | text | nullable |
| role | text | 'owner' \| 'admin' \| 'member' — قابلة للتوسع لاحقًا |
| created_at | timestamptz | default now() |

### `clients`
الشركة/الجهة صاحبة المشروع (مش نفس "Lead" — عميل واحد ممكن يبقى له أكتر من
مشروع/Lead على مدار الوقت).

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| company_name | text | |
| industry | text | nullable |
| website | text | nullable |
| country | text | nullable |
| created_at | timestamptz | |

### `contacts`
الشخص اللي بتتكلم معاه فعليًا داخل شركة العميل (ممكن يبقى فيه أكتر من واحد
لنفس الـ client).

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| client_id | uuid, FK → clients.id | |
| full_name | text | |
| email | text | nullable |
| phone | text | nullable |
| whatsapp | text | nullable |
| language | text | nullable — لغة التواصل المفضلة |
| created_at | timestamptz | |

### `leads`
لحظة أول تواصل — المرحلة الأولى من دورة العمل. Lead ممكن يتحول لاحقًا لـ
project لو اتقفل، أو يفضل Lead لو لسه.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| client_id | uuid, FK → clients.id | nullable لو أول مرة نسمع عن الشركة |
| contact_id | uuid, FK → contacts.id | nullable لنفس السبب |
| source | text | من أين جاء العميل (واتساب، إحالة، الموقع...) |
| status | text | 'new' \| 'contacted' \| 'qualified' \| 'converted' \| 'lost' |
| owner_id | uuid, FK → profiles.id | مين المسؤول عن المتابعة |
| notes | text | nullable |
| created_at | timestamptz | |
| converted_to_project_id | uuid, FK → projects.id | nullable حتى يتحول |

### `projects`
المشروع الفعلي بمجرد ما الـ Lead يتقفل. هذا هو الكيان المركزي اللي كل حاجة
تانية (الفورم، البحث، الاجتماع، PRD مستقبلًا) بترتبط بيه.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| client_id | uuid, FK → clients.id | |
| lead_id | uuid, FK → leads.id | nullable — مصدره |
| name | text | اسم المشروع الداخلي |
| project_type | text | 'website' \| 'mobile_app' \| 'saas' \| 'dashboard' \| 'other' — يحدد شكل الفورم الديناميكي |
| stage | text | مرحلة المشروع الحالية (lead, intake, research, ...) — قابلة للتوسع |
| owner_id | uuid, FK → profiles.id | |
| price | numeric | nullable |
| currency | text | default 'SAR' |
| payment_status | text | 'unpaid' \| 'partial' \| 'paid' |
| created_at | timestamptz | |
| stage_changed_at | timestamptz | |

### `discovery_forms`
الفورم الديناميكي (المرحلة الثانية). فورم واحد لكل مشروع، بس بنيته
ديناميكية حسب `project_type`.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| project_id | uuid, FK → projects.id, UNIQUE | فورم واحد بس لكل مشروع |
| answers | jsonb | كل إجابات الأسئلة كـ key-value، يسمح بمرونة الأسئلة الديناميكية بدون تعديل الـ schema |
| status | text | 'draft' \| 'sent' \| 'submitted' |
| sent_at | timestamptz | nullable |
| submitted_at | timestamptz | nullable |
| created_at | timestamptz | |

> **قرار تصميم مهم**: استخدمنا `jsonb` للإجابات بدل عمود لكل سؤال، لأن الأسئلة
> نفسها ديناميكية وبتختلف حسب نوع المشروع (زي ما طلبت). لو عملنا عمود لكل
> سؤال هنضطر نعدل الـ schema كل ما نضيف سؤال جديد. الـ `jsonb` بيديك المرونة
> دي من غير ما نكسر أي حاجة.

### `project_brain_entries`
هنا بيتجمع أي معلومة إضافية عن المشروع مش لها جدول مخصص لسه (ملاحظات حرة،
روابط، قرارات مبدئية) — عشان نضمن "دخول المعلومة مرة واحدة" حتى قبل ما نبني
باقي المراحل (الاجتماعات، الـ AI reports) في Phases لاحقة.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| project_id | uuid, FK → projects.id | |
| entry_type | text | 'note' \| 'decision' \| 'link' \| 'risk' \| 'question' |
| content | text | |
| created_by | uuid, FK → profiles.id | |
| created_at | timestamptz | |

### `audit_log`
سجل تدقيق عام لأي تغيير مهم على أي كيان.

| العمود | النوع | ملاحظات |
|---|---|---|
| id | uuid, PK | |
| actor_id | uuid, FK → profiles.id | |
| entity_type | text | اسم الجدول اللي اتغير |
| entity_id | uuid | |
| action | text | 'create' \| 'update' \| 'delete' \| 'stage_change' |
| changes | jsonb | nullable — قبل/بعد لو مناسب |
| created_at | timestamptz | |

## العلاقات (مختصر)

```
clients 1───* contacts
clients 1───* leads
clients 1───* projects
leads   1───1 projects (lead يتحول لمشروع واحد)
projects 1───1 discovery_forms
projects 1───* project_brain_entries
profiles 1───* leads (owner)
profiles 1───* projects (owner)
*───* audit_log (عام لكل الكيانات)
```

## إيه اللي **مش** موجود في Phase 1 عن قصد

- جداول الاجتماعات (`meetings`, `transcripts`) — Phase 2
- جداول الـ AI (`ai_reports`, `ai_requests_log`) — بعد بناء AI Provider Layer
- جداول الـ PRD/Requirements/User Stories التفصيلية — Phase 3
- جداول ما بعد الإطلاق (`support_tickets`) — آخر Phase

كل الجداول دي هتتبني فوق نفس `projects.id` بدون ما تكسر أي حاجة موجودة —
ده بالظبط معنى "قابل للتوسع دون إعادة بناء" اللي طلبته في البرومبت الأصلي.
