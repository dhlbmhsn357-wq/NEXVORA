/**
 * NEXVORA Sector Standards — Approve & Apply (0124، المرحلة ب)
 * ============================================================================
 * الخطوة الوحيدة في المرحلة دي المسموح لها تكتب على بيانات المنتج
 * الحقيقية. بتتحصّل حصريًا بعد اعتماد بشري صريح لعناصر change_impacts
 * محدَّدة (approvedImpactIds) — أبدًا مش استدعاء تلقائي من AI.
 *
 * نطاق التغطية (MVP، عمدًا محدود — لا مبالغة هندسية):
 * ✅ مغطّى بمنطق apply حقيقي: requirement / user_story / acceptance_criteria /
 *    business_rule / system_message — الخمسة دول بس هما اللي عندهم دوال
 *    create/update/delete جاهزة ومباشرة في هذا الكودبيز بأقل مخاطرة.
 * ❌ غير مغطّى بعد (موثّق صراحة، مش تنفيذ مزيّف): prd_section (محتاج
 *    lib/prd/versioning.ts::applySectionRegeneration بمنطق مطابقة قسم→حقل
 *    مش مباشر بنفس بساطة باقي الأنواع)، decision (مفيش create* عام لـ
 *    decision_memory من فعل مستخدم مباشر)، state_machine/persona/user_flow
 *    (لأن التعديل عادة بيمس عدة صفوف مترابطة — states/transitions/
 *    linked_*  — بمخاطرة أعلى لتطبيق تلقائي في هذه المرحلة). التحليل
 *    نفسه (change_impacts) بيتعرض لهذه الأنواع بشكل طبيعي — بس "تطبيقها"
 *    محتاج متابعة يدوية أو Phase C/D. راجع change-request-types.ts
 *    ::SupportedApplyArtifactType.
 */
import { createRequirement, updateRequirement, deleteRequirement } from "@/lib/product-definition/service";
import { createBusinessRule, updateBusinessRule, deleteBusinessRule } from "@/lib/product-definition/business-rules-service";
import { createSystemMessage, updateSystemMessage, deleteSystemMessage } from "@/lib/product-definition/system-messages-service";
import { createStory, updateStory, deleteStory } from "@/lib/user-stories/service";
import { createAc, updateAc, deleteAc } from "@/lib/user-stories/service";

import { listChangeImpacts, updateChangeImpactStatus, updateChangeRequestStatus, getChangeRequest } from "./change-request-service";
import { SUPPORTED_APPLY_ARTIFACT_TYPES, type SupportedApplyArtifactType } from "./change-request-types";
import type { ChangeImpactRow } from "./change-request-types";
import { flagHandoffNeedsRegeneration } from "./handoff-regeneration";
import { recordLearningSignal } from "./learning-signals-service";

export interface ApplyApprovedImpactsResult {
  applied: number;
  failed: { impactId: string; error: string }[];
}

function isSupportedArtifactType(t: string): t is SupportedApplyArtifactType {
  return (SUPPORTED_APPLY_ARTIFACT_TYPES as readonly string[]).includes(t);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * ينفّذ أثر واحد فعليًا على بيانات المنتج الحقيقية، حسب artifactType +
 * impactType، مستخدِمًا proposedChange المُهيكل (jsonb) كمصدر القيم
 * الجديدة مباشرة — بدون أي تفسير/parsing إضافي لأنه مُهيكل بالفعل من
 * خطوة التحقق (validateImpactAnalysis).
 */
async function applyOneImpact(projectId: string, impact: ChangeImpactRow, actorId: string | null): Promise<void> {
  const pc = impact.proposedChange;

  switch (impact.artifactType as SupportedApplyArtifactType) {
    case "requirement": {
      if (impact.impactType === "add") {
        await createRequirement(
          projectId,
          {
            title: str(pc.title) ?? (impact.artifactLabel || "متطلب جديد (من طلب تغيير)"),
            description: str(pc.description),
            requirementType: pc.requirementType as never,
            priority: pc.priority as never,
            status: pc.status as never,
            rationale: str(pc.rationale),
            acceptanceHint: str(pc.acceptanceHint),
            effortEstimate: str(pc.effortEstimate),
          },
          actorId
        );
      } else if (impact.impactType === "modify") {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لتعديل متطلب.");
        await updateRequirement(impact.artifactId, pc as never);
      } else {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لحذف متطلب.");
        await deleteRequirement(impact.artifactId);
      }
      return;
    }

    case "user_story": {
      if (impact.impactType === "add") {
        await createStory(
          projectId,
          {
            title: str(pc.title) ?? (impact.artifactLabel || "قصة مستخدم جديدة (من طلب تغيير)"),
            asA: str(pc.asA),
            iWant: str(pc.iWant),
            soThat: str(pc.soThat),
            status: pc.status as never,
          },
          actorId
        );
      } else if (impact.impactType === "modify") {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لتعديل قصة مستخدم.");
        await updateStory(impact.artifactId, pc as never);
      } else {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لحذف قصة مستخدم.");
        await deleteStory(impact.artifactId);
      }
      return;
    }

    case "acceptance_criteria": {
      if (impact.impactType === "add") {
        const userStoryId = str(pc.userStoryId);
        if (!userStoryId) throw new Error("proposed_change.userStoryId مطلوب لإضافة معيار قبول جديد.");
        await createAc(
          projectId,
          {
            userStoryId,
            title: str(pc.title) ?? impact.artifactLabel,
            givenClause: str(pc.givenClause),
            whenClause: str(pc.whenClause),
            thenClause: str(pc.thenClause),
          },
          actorId
        );
      } else if (impact.impactType === "modify") {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لتعديل معيار قبول.");
        await updateAc(impact.artifactId, pc as never);
      } else {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لحذف معيار قبول.");
        await deleteAc(impact.artifactId);
      }
      return;
    }

    case "business_rule": {
      if (impact.impactType === "add") {
        await createBusinessRule(
          projectId,
          {
            title: str(pc.title) ?? (impact.artifactLabel || "قاعدة عمل جديدة (من طلب تغيير)"),
            triggerCondition: str(pc.triggerCondition),
            thresholdValue: str(pc.thresholdValue),
            onViolation: str(pc.onViolation),
            enforcementPoint: pc.enforcementPoint as never,
          },
          actorId
        );
      } else if (impact.impactType === "modify") {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لتعديل قاعدة عمل.");
        await updateBusinessRule(impact.artifactId, pc as never);
      } else {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لحذف قاعدة عمل.");
        await deleteBusinessRule(impact.artifactId);
      }
      return;
    }

    case "system_message": {
      if (impact.impactType === "add") {
        await createSystemMessage(
          projectId,
          {
            eventName: str(pc.eventName) ?? (impact.artifactLabel || "حدث جديد (من طلب تغيير)"),
            messageType: pc.messageType as never,
            messageText: str(pc.messageText),
          },
          actorId
        );
      } else if (impact.impactType === "modify") {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لتعديل رسالة نظام.");
        await updateSystemMessage(impact.artifactId, pc as never);
      } else {
        if (!impact.artifactId) throw new Error("artifact_id مفقود لحذف رسالة نظام.");
        await deleteSystemMessage(impact.artifactId);
      }
      return;
    }

    default:
      throw new Error(
        `نوع artifact "${impact.artifactType}" غير مدعوم بمنطق تطبيق تلقائي في هذه المرحلة — التحليل معروض، لكن التطبيق يحتاج متابعة يدوية.`
      );
  }
}

/**
 * يطبّق دفعة من الأثر المعتمَد فعليًا على بيانات المنتج الحقيقية. مرونة
 * فشل جزئي (نفس نمط clone-service.ts::runDomain): فشل أثر واحد ما بيوقفش
 * تطبيق باقي الأثر المعتمَد.
 *
 * بعد التطبيق: كل أثر ناجح بيتعلّم status='applied'. لو كل أثر طلب
 * التغيير (المعتمَد+المطبَّق أو المرفوض) بقى في حالة نهائية، حالة طلب
 * التغيير نفسه بترقّى لـ 'applied'.
 */
export async function applyApprovedImpacts(
  changeRequestId: string,
  approvedImpactIds: string[],
  actorId: string | null
): Promise<ApplyApprovedImpactsResult> {
  const changeRequest = await getChangeRequest(changeRequestId);
  if (!changeRequest) {
    return { applied: 0, failed: approvedImpactIds.map((id) => ({ impactId: id, error: "طلب التغيير غير موجود." })) };
  }

  const allImpacts = await listChangeImpacts(changeRequestId);
  const byId = new Map(allImpacts.map((i) => [i.id, i]));

  let applied = 0;
  const failed: { impactId: string; error: string }[] = [];

  for (const impactId of approvedImpactIds) {
    const impact = byId.get(impactId);
    if (!impact) {
      failed.push({ impactId, error: "عنصر الأثر غير موجود." });
      continue;
    }
    if (!isSupportedArtifactType(impact.artifactType)) {
      failed.push({
        impactId,
        error: `نوع "${impact.artifactType}" غير مدعوم بتطبيق تلقائي في هذه المرحلة (يحتاج متابعة يدوية).`,
      });
      continue;
    }

    try {
      await applyOneImpact(changeRequest.projectId, impact, actorId);
      await updateChangeImpactStatus(impactId, "applied");
      applied += 1;

      // 0125 — بذرة تعلّم Standard: أثر إضافي، مش حرِج لنجاح التطبيق
      // نفسه. فشل التسجيل هنا (نادر — فشل كتابة قاعدة بيانات حقيقي) ما
      // بيلغيش إن الأثر اتطبّق فعليًا على بيانات المنتج، فبنسجّله كـ
      // تحذير بس ونكمل.
      try {
        await recordLearningSignal(changeRequestId, { ...impact, status: "applied" });
      } catch (signalErr) {
        console.error(`[ApplyChanges] فشل تسجيل إشارة تعلّم Standard لأثر ${impactId}:`, signalErr);
      }
    } catch (err) {
      console.error(`[ApplyChanges] فشل تطبيق أثر ${impactId} (نوع ${impact.artifactType}):`, err);
      failed.push({ impactId, error: errMsg(err) });
    }
  }

  // لو كل الأثر في طلب التغيير بقى في حالة نهائية (applied أو rejected)،
  // طلب التغيير نفسه يترقّى لـ 'applied' — حتى لو بعض عناصره اتطبّقوش
  // فعليًا (فشلوا) طالما مفيش أي عنصر لسه 'proposed'/'approved' معلّق.
  const refreshed = await listChangeImpacts(changeRequestId);
  const stillPending = refreshed.some((i) => i.status === "proposed" || i.status === "approved");
  if (!stillPending && refreshed.length > 0) {
    await updateChangeRequestStatus(changeRequestId, "applied");
  }

  // 0125 — لو اتطبّق أثر حقيقي فعلًا (applied > 0)، أي حزمة Handoff
  // موجودة لنفس المشروع بقت محتوائيًا "قديمة" — علّمها محتاجة إعادة
  // تجميع. فشل التعليم ده (نادر) مش سبب كافٍ لإفشال نتيجة applyApprovedImpacts
  // كلها — الأثر الحقيقي على بيانات المنتج بالفعل اتسجّل بنجاح.
  if (applied > 0) {
    try {
      await flagHandoffNeedsRegeneration(
        changeRequest.projectId,
        `تحديث بعد تطبيق تغيير: ${changeRequest.title}`
      );
    } catch (flagErr) {
      console.error(`[ApplyChanges] فشل تعليم حزمة Handoff بالحاجة لإعادة التجميع لمشروع ${changeRequest.projectId}:`, flagErr);
    }
  }

  return { applied, failed };
}
