-- ============================================================
-- PM Operating System — 0056 Engineering QA Cancelable Reviews
--
-- بيخلّي Engineering QA يتعامل مع كل مراجعة كـ Job قابلة للإلغاء
-- (Cancelable Job): بدء مراجعة جديدة بيلغي الجارية فورًا ويبدأ من
-- Stage 1، وأي Callback متأخر من المراجعة القديمة يُتجاهل (لا يكتب فوق
-- الجديدة). كله additive — لا يكسر أي شيء.
-- ============================================================

-- 1) توسيع enum الحالة بحالة انتقالية "cancelling" (بين طلب الإلغاء
--    واكتماله). مهم: cancelling **مش** ضمن مجموعة "النشط" في الـ Partial
--    Unique Index، فبمجرد ما المراجعة القديمة تدخلها بتحرّر القفل فورًا
--    وتسمح ببدء الجديدة.
alter table public.engineering_reviews
  drop constraint if exists engineering_reviews_review_status_check;

alter table public.engineering_reviews
  add constraint engineering_reviews_review_status_check
  check (review_status in (
    'pending','queued','running','completed','failed',
    'cancelling','cancelled','needs_review','certified','rejected'
  ));

-- 2) أعمدة الإلغاء/التتبّع
alter table public.engineering_reviews
  add column if not exists execution_id uuid not null default gen_random_uuid(),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists superseded_by_review_id uuid references public.engineering_reviews(id) on delete set null;

-- 3) صفوف قديمة: نضمن execution_id لكلٍ منها (الـ default غطّى الجديد،
--    وده يغطّي أي صف قديم من غير قيمة — دفاعيًا).
update public.engineering_reviews
  set execution_id = gen_random_uuid()
  where execution_id is null;

-- 4) حدث Timeline جديد: مراجعة استُبدلت بأحدث منها.
alter table public.engineering_review_events
  drop constraint if exists engineering_review_events_event_type_check;

alter table public.engineering_review_events
  add constraint engineering_review_events_event_type_check
  check (event_type in (
    'review_created','review_started','stage_started','stage_finished','stage_failed',
    'stage_retried','stage_cancelled','review_completed','review_cancelled',
    'review_superseded','certificate_generated'
  ));

-- ============================================================
-- انتهى 0056 Engineering QA Cancelable Reviews
-- ============================================================
