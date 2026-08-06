import { createClient } from "@/lib/supabase/server";
import { getAllTemplates, getQuestionCounts } from "@/lib/discovery-templates/queries";
import TemplatesManager from "./templates-manager";

export default async function TemplatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const [templates, counts] = await Promise.all([
    getAllTemplates(supabase),
    getQuestionCounts(supabase),
  ]);

  return (
    <div>
      <h1 className="font-display text-display text-[var(--v-text)]">قوالب الاكتشاف</h1>
      <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
        قوالب نماذج الاكتشاف الديناميكية حسب نوع المشروع — كل قالب بأسئلته الخاصة.
      </p>

      <div className="mt-6">
        <TemplatesManager templates={templates} questionCounts={counts} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
