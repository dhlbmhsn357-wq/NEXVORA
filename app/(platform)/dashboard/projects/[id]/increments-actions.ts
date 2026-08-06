"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listIncrements, type ProjectIncrement } from "@/lib/increments/service";
import {
  PrdIncrementEngine,
  listPrdIncrementSections,
  type PrdIncrementSection,
} from "@/lib/prd/increment-service";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

export interface IncrementsState {
  increments: ProjectIncrement[];
  sections: PrdIncrementSection[];
}

/** الحالة الكاملة لتبويب الزيادات — تُستخدم للعرض الأولي وللـ Polling. */
export async function getIncrementsState(projectId: string): Promise<IncrementsState> {
  const supabase = await createClient();
  const [increments, sections] = await Promise.all([
    listIncrements(supabase, projectId),
    listPrdIncrementSections(supabase, projectId),
  ]);
  return { increments, sections };
}

export type GeneratePrdIncrementResult =
  | { status: "started" }
  | { status: "already_generating" }
  | { status: "unavailable"; message: string };

/**
 * توليد قسم PRD للزيادة دي وحدها — Background Job بنفس نمط باقي
 * المولّدات: بيحجز القفل ويرجّع فورًا، والواجهة بتتابع بالـ Polling.
 *
 * ملاحظة: ده مابيلمسش صف الـ `prd` ولا نسخه — بيكتب صف مستقل في
 * `prd_increment_sections` بس.
 */
export async function generatePrdIncrementSection(
  projectId: string,
  incrementId: string
): Promise<GeneratePrdIncrementResult> {
  const actorId = await getActorId();

  const sectionId = await PrdIncrementEngine.tryClaim(projectId, incrementId);
  if (!sectionId) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return {
      status: "already_generating",
    };
  }

  after(async () => {
    try {
      await PrdIncrementEngine.runCore(projectId, incrementId, sectionId, actorId);
    } catch (err) {
      console.error("[PRDIncrement background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}
