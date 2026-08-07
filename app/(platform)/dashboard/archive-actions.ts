"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { archiveEntity, unarchiveEntity, type ArchivableTable } from "@/lib/archive/archive-service";
import { requireAdmin, requireSystemAdmin } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { KnowledgeExtractionEngine } from "@/lib/organizational-intelligence/extraction-service";
import { PromptSuggestionsEngine } from "@/lib/organizational-intelligence/prompt-suggestions-service";

/**
 * Server Actions للأرشفة/إلغاء الأرشفة — تحت حماية RBAC (owner/admin فقط).
 * الأعضاء العاديون (member) يقدروا يشوفوا لكن مش يأرشفوا.
 */

export async function archiveItem(
  table: ArchivableTable,
  id: string,
  revalidateHref?: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const result = await archiveEntity(supabase, table, id);

  if (result.ok) {
    // نقطة "المشروع خلص" المتفق عليها لـ Phase 6 (Organizational
    // Intelligence) — بدون عمود/حالة جديدة، إعادة استخدام الأرشفة
    // الموجودة أصلًا. لو استخراج المعرفة فشل، الأرشفة نفسها اتمت
    // بنجاح بالفعل (طبقة مستقلة، لا تمنع أي مرحلة سابقة من العمل).
    if (table === "projects") {
      const extraction = await KnowledgeExtractionEngine.startExtraction(id);
      if (extraction.status === "started") {
        after(async () => {
          try {
            await KnowledgeExtractionEngine.runExtractionCore(extraction.jobId);
          } catch (err) {
            console.error("[KnowledgeExtraction background] failed:", err);
          }
        });
      }
      after(async () => {
        try {
          await PromptSuggestionsEngine.generateForProject(id);
        } catch (err) {
          console.error("[PromptSuggestions background] failed:", err);
        }
      });
    }
    revalidatePath(revalidateHref ?? "/dashboard");
  }
  return result;
}

/**
 * حذف نهائي (Hard delete) — Owner فقط. بيمشي حسب Cascade FKs
 * المعرَّفة في الـ migrations (كل bagage الأولاد بيتحذف تلقائيًا:
 * Brain, PRD, Meetings, Contracts, Payments, إلخ). لا رجوع.
 *
 * سبب استخدام service client: RLS policies حاليًا SELECT-only على
 * أغلب الجداول — الحذف من خلال authenticated client بيتفشّل صامتًا.
 * الحماية الفعلية هنا هي RBAC (requireSystemAdmin = owner فقط).
 */
export async function deleteProject(
  projectId: string,
  redirectHref?: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireSystemAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const svc = createServiceClient();
  const { error } = await svc.from("projects").delete().eq("id", projectId);
  if (error) return { ok: false, message: error.message };

  // نلغّي الكاش قبل الـ redirect عشان الصفحة اللي هيوصل ليها تكون طازة.
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard");
  if (redirectHref) redirect(redirectHref);
  return { ok: true };
}

export async function unarchiveItem(
  table: ArchivableTable,
  id: string,
  revalidateHref?: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const result = await unarchiveEntity(supabase, table, id);

  if (result.ok) {
    revalidatePath(revalidateHref ?? "/dashboard");
  }
  return result;
}
