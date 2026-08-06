"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * اشتراك Realtime في رسائل/تفاعلات محادثة معيّنة — نفس نمط
 * NotificationsBell. أي INSERT/UPDATE على messages أو تغيير reactions
 * للمحادثة الحالية بينادي onChange (اللي بيعيد تحميل الرسائل).
 */
export function useRealtimeMessages(conversationId: string | null, onChange: () => void): void {
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`collab-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => onChange()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => onChange()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onChange]);
}
