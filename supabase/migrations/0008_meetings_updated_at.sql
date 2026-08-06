-- ============================================================
-- Phase 4 — تتبع وقت آخر تحديث لكل اجتماع (لعرضه في الواجهة)
-- نفس نمط stage_changed_at في projects من Phase 1.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.meetings
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_meeting_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_meeting_update_touch on public.meetings;
create trigger on_meeting_update_touch
  before update on public.meetings
  for each row execute procedure public.touch_meeting_updated_at();
