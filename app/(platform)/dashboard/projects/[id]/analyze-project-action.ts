"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AnalysisAgent, type AnalysisAgentResult } from "@/lib/ai/agents/analysis-agent";

/**
 * الطبقة الوحيدة المسؤولة عن الحفظ — الـ Agent نفسه ما بيلمسش قاعدة
 * البيانات غير للقراءة. الـ Server Action ده هو اللي بيحفظ النتيجة
 * بعد التحقق منها في الـ Agent.
 */
export async function analyzeProjectAction(projectId: string): Promise<AnalysisAgentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await AnalysisAgent.run(projectId, user?.id);

  if (result.status === "success") {
    const { error } = await supabase
      .from("projects")
      .update({ ai_analysis: result.data })
      .eq("id", projectId);

    if (error) {
      console.error(
        `[analyzeProjectAction] Failed to save analysis for project ${projectId}: ${error.message}`
      );
      return {
        status: "error",
        message: "تم التحليل لكن حدث خطأ أثناء الحفظ، حاول مرة أخرى.",
        code: "SAVE_FAILED",
      };
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
  }

  return result;
}
