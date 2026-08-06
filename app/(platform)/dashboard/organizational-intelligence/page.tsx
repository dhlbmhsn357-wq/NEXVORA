import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireViewKnowledge } from "@/lib/organizational-intelligence/permissions";
import { getExecutiveDashboardMetrics } from "@/lib/organizational-intelligence/dashboard-metrics";
import OrganizationalIntelligenceDashboard from "./oi-dashboard-client";
import type { OrganizationalKnowledge, PromptImprovementSuggestion } from "@/lib/types/database";

export default async function OrganizationalIntelligencePage() {
  const auth = await requireViewKnowledge();
  if (!auth.ok) redirect("/dashboard");

  const supabase = createServiceClient();
  const [metrics, candidatesResult, suggestionsResult] = await Promise.all([
    getExecutiveDashboardMetrics(),
    supabase.from("organizational_knowledge").select("*").eq("status", "candidate").order("occurrence_count", { ascending: false }).limit(30),
    supabase.from("prompt_improvement_suggestions").select("*").eq("status", "suggested").order("created_at", { ascending: false }).limit(30),
  ]);

  return (
    <OrganizationalIntelligenceDashboard
      metrics={metrics}
      candidateKnowledge={(candidatesResult.data as OrganizationalKnowledge[] | null) ?? []}
      promptSuggestions={(suggestionsResult.data as PromptImprovementSuggestion[] | null) ?? []}
      canManage={auth.role === "owner" || auth.role === "admin"}
    />
  );
}
