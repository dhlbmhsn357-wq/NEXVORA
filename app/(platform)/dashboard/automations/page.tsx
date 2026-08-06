import { getAutomationStats, listWorkflowExecutions } from "@/lib/automation/service";
import { WORKFLOW_REGISTRY } from "@/lib/automation/workflow-registry";
import AutomationsClient from "./automations-client";

export const dynamic = "force-dynamic";

/**
 * لوحة الأتمتة (المرحلة الخامسة) — تعرض سجل تنفيذ الـ Workflows الحيّ،
 * إحصاءات التشغيل، تعريفات الـ Workflows المفعّلة، وتحليل AI للأداء.
 */
export default async function AutomationsPage() {
  const [stats, executions] = await Promise.all([getAutomationStats(), listWorkflowExecutions(100)]);
  const workflows = WORKFLOW_REGISTRY.map((w) => ({ id: w.id, title: w.title, description: w.description, trigger: w.trigger }));
  return <AutomationsClient initialStats={stats} initialExecutions={executions} workflows={workflows} />;
}
