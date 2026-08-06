import { createServiceClient } from "@/lib/supabase/service";
import { createTask } from "./task-service";
import type { TaskSourceType, TaskPriority } from "@/lib/types/database";

/**
 * طبقة التنفيذ الموحّدة (Critical Architectural Requirement): أي وحدة في
 * المنصة تحوّل بندًا لمهمة عبر الدالة دي بدل ما تعمل work-item معزول.
 * idempotent: نفس (source_type, source_reference) ما يتكرّرش.
 */

export interface CreateTaskFromSourceInput {
  projectId: string;
  title: string;
  description?: string | null;
  sourceType: Exclude<TaskSourceType, "manual">;
  sourceReference: string;   // معرّف فريد للمصدر (finding id / message id / recommendation id ...)
  taskType?: string;
  priority?: TaskPriority;
  createdBy: string | null;
}

export async function createTaskFromSource(input: CreateTaskFromSourceInput): Promise<{ ok: boolean; taskId?: string; message?: string; duplicate?: boolean }> {
  const supabase = createServiceClient();

  // منع التكرار: مهمة موجودة بنفس المصدر
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("source_type", input.sourceType)
    .eq("source_reference", input.sourceReference)
    .maybeSingle();
  if (existing) return { ok: true, taskId: existing.id, duplicate: true, message: "المهمة دي متعملة قبل كده من نفس المصدر." };

  const result = await createTask({
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    taskType: input.taskType ?? defaultTypeForSource(input.sourceType),
    priority: input.priority ?? "medium",
    status: "backlog",
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    createdBy: input.createdBy,
  });
  return result;
}

function defaultTypeForSource(source: Exclude<TaskSourceType, "manual">): string {
  switch (source) {
    case "eqa_finding": return "engineering_qa";
    case "incident": return "bug";
    case "prototype_gap": return "development";
    case "recommendation": return "research";
    case "brain_comment": return "business_analysis";
    case "meeting": return "meeting";
    case "requirement": return "development";
    case "risk": return "research";
    case "chat": return "development";
    default: return "development";
  }
}
