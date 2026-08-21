/**
 * NEXVORA Sector Standards — Handoff Regeneration Flag (0125، المرحلة ج)
 * ============================================================================
 * توسيع صغير وجراحي على نظام Handoff الموجود فعليًا (lib/handoff/*) —
 * مش نظام موازٍ جديد. بعد ما تغيير معتمَد بيتطبّق فعليًا على بيانات
 * المنتج (apply-changes-service.ts::applyApprovedImpacts)، أي حزمة
 * Handoff موجودة للمشروع ده بقت "قديمة" محتوائيًا — العلم ده بينبّه
 * المستخدم إنه محتاج يعيد تجميعها (lib/handoff/assembler.ts::applyAssembly)
 * قبل ما يسلّمها.
 *
 * العلم بيتصفّر تلقائيًا في applyAssembly نفسه لما حزمة طازجة تتجمّع —
 * راجع lib/handoff/assembler.ts.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getLatestPackage } from "@/lib/handoff/service";

/**
 * يعلّم أحدث حزمة Handoff للمشروع (لو موجودة) بأنها محتاجة إعادة تجميع.
 * لو المشروع لسه معندوش أي حزمة Handoff أصلًا، الدالة دي بتنسحب بهدوء —
 * مفيش حزمة نعلّمها، ومفيش داعي لخلق واحدة من هنا (خارج نطاق هذه المهمة).
 */
export async function flagHandoffNeedsRegeneration(projectId: string, reason: string): Promise<void> {
  const pkg = await getLatestPackage(projectId);
  if (!pkg) return;

  const svc = createServiceClient();
  const { error } = await svc
    .from("handoff_packages")
    .update({
      needs_regeneration: true,
      regeneration_reason: reason,
    })
    .eq("id", pkg.id);
  if (error) throw error;
}
