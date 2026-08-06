import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTemplateById, getTemplateQuestions } from "@/lib/discovery-templates/queries";
import TemplateEditor from "./template-editor";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  const [template, questions] = await Promise.all([
    getTemplateById(supabase, templateId),
    getTemplateQuestions(supabase, templateId),
  ]);

  if (!template) notFound();

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-[var(--v-text-muted)]">
        <Link href="/dashboard/templates" className="hover:text-[var(--v-primary)] hover:underline">
          قوالب الاكتشاف
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--v-text-secondary)]">{template.name}</span>
      </nav>

      <TemplateEditor template={template} initialQuestions={questions} isAdmin={isAdmin} />
    </div>
  );
}
