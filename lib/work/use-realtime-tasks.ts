"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** اشتراك Realtime في مهام مشروع (لوحة حية) — نفس نمط الشات. */
export function useRealtimeTasks(projectId: string | null, onChange: () => void): void {
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`tasks-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, () => onChange())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, () => onChange())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onChange]);
}
