"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureProjectWorkspace } from "@/lib/portfolio/service";
import type { ProjectType } from "@/lib/types/database";

export type ProjectMode = "unclassified" | "test" | "real";

export async function convertLeadToProject(
  leadId: string,
  clientId: string | null,
  name: string,
  projectType: ProjectType,
  mode: ProjectMode = "unclassified"
): Promise<{ ok: true; projectId: string } | { ok: false; message: string }> {
  if (!name.trim()) {
    return { ok: false, message: "اسم المشروع مطلوب." };
  }
  if (mode !== "unclassified" && mode !== "test" && mode !== "real") {
    return { ok: false, message: "قيمة mode غير صالحة." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // فحص Idempotency: لو الـ Lead ده اتحوّل قبل كده، رجّع المشروع القائم
  // بدل ما نعمل واحد جديد. ده بيمنع Race Condition من ضغط مزدوج على الزر.
  const { data: existingLead } = await supabase
    .from("leads")
    .select("converted_to_project_id, status, discovery_template_id")
    .eq("id", leadId)
    .maybeSingle();

  if (existingLead?.converted_to_project_id) {
    return { ok: true, projectId: existingLead.converted_to_project_id };
  }

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      lead_id: leadId,
      name: name.trim(),
      project_type: projectType,
      mode,
      // يورّث قالب الاكتشاف المختار وقت إنشاء الـ Lead (Smart Discovery)
      discovery_template_id: existingLead?.discovery_template_id ?? null,
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (projectErr || !project) {
    // لو الـ unique index رفض بسبب Race Condition (نفس الـ lead اتحوّل
    // بواسطة طلب متزامن)، ارجع المشروع اللي فاز في السباق بدل رسالة خطأ.
    if (projectErr?.code === "23505") {
      const { data: raced } = await supabase
        .from("projects")
        .select("id")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (raced) return { ok: true, projectId: raced.id };
    }
    return { ok: false, message: projectErr?.message ?? "فشل إنشاء المشروع." };
  }

  const { error: leadErr } = await supabase
    .from("leads")
    .update({ status: "converted", converted_to_project_id: project.id })
    .eq("id", leadId);

  if (leadErr) {
    return { ok: false, message: leadErr.message };
  }

  // Phase 4 — تهيئة مساحة عمل المشروع تلقائيًا (فريق + ملكية + قنوات تعاون).
  after(async () => {
    try {
      await ensureProjectWorkspace(project.id, user?.id ?? null);
    } catch (err) {
      console.error("[ConvertLead] ensureProjectWorkspace failed:", err instanceof Error ? err.message : err);
    }
  });

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/projects");
  return { ok: true, projectId: project.id };
}
