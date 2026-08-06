import { createServiceClient } from "@/lib/supabase/service";
import type { NotificationRow } from "@/lib/types/database";

export interface NotificationFeedItem extends NotificationRow {
  isRead: boolean;
  projectName: string | null;
}

export type NotificationStatusFilter = "active" | "archived" | "all";
export type NotificationReadFilter = "all" | "read" | "unread";

export interface NotificationFeedFilters {
  status?: NotificationStatusFilter;
  readState?: NotificationReadFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 30;

async function logEvent(notificationId: string, eventType: "created" | "opened" | "read" | "archived" | "restored" | "deleted", actorId?: string) {
  const supabase = createServiceClient();
  await supabase.from("notification_events").insert({ notification_id: notificationId, event_type: eventType, actor_id: actorId ?? null });
}

/**
 * NotificationService — الطبقة الوحيدة المسموح بيها للتعامل مع جدول
 * notifications (قراءة/تعليم كمقروء/أرشفة/استرجاع/حذف ناعم) + سجل
 * النشاط. ممنوع أي Server Action يكتب في الجداول دي مباشرة.
 */
export interface EmitNotificationInput {
  dedupeKey: string;
  type: string;
  category?: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  message: string;
  targetUrl: string;
  projectId?: string | null;
  targetModule?: string | null;
  targetRecordId?: string | null;
  targetContext?: Record<string, unknown>;
}

export class NotificationService {
  /**
   * إنشاء/تحديث إشعار (Idempotent عبر dedupe_key) — الطريق الوحيد المسموح
   * للكتابة في notifications من كود الأحداث (بدل insert مباشر في الأكشنز).
   * الإشعارات على مستوى المؤسسة (كل الفريق يشوفها) بحالة قراءة لكل مستخدم،
   * زي باقي إشعارات النظام. بيرجّع id الإشعار (أو null عند الفشل).
   */
  static async emit(input: EmitNotificationInput): Promise<string | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("notifications")
      .upsert(
        {
          dedupe_key: input.dedupeKey,
          type: input.type,
          category: input.category ?? "work",
          severity: input.severity ?? "info",
          project_id: input.projectId ?? null,
          title: input.title,
          message: input.message,
          target_url: input.targetUrl,
          target_module: input.targetModule ?? "workspace_tasks",
          target_record_id: input.targetRecordId ?? null,
          target_context: input.targetContext ?? {},
          status: "active",
          source_resolved: false,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "dedupe_key" }
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[notifications] emit failed:", error.message);
      return null;
    }
    if (data?.id) await logEvent(data.id as string, "created");
    return (data?.id as string) ?? null;
  }

  /** الخلاصة المطلوبة لجرس الإشعارات — بس النشط وغير المُقروء وغير المُحلول من مصدره. */
  static async getBellFeed(userId: string, limit = 30): Promise<NotificationFeedItem[]> {
    const supabase = createServiceClient();
    const { data: rows } = await supabase
      .from("notifications")
      .select("*, projects(name)")
      .eq("status", "active")
      .eq("source_resolved", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    return NotificationService.attachReadState(userId, (rows ?? []) as Array<NotificationRow & { projects: unknown }>);
  }

  static async getUnreadCount(userId: string): Promise<number> {
    const supabase = createServiceClient();
    const { data: activeIds } = await supabase.from("notifications").select("id").eq("status", "active").eq("source_resolved", false);
    const ids = (activeIds ?? []).map((r) => r.id as string);
    if (ids.length === 0) return 0;

    const { data: reads } = await supabase.from("notification_reads").select("notification_id").eq("user_id", userId).in("notification_id", ids);
    const readSet = new Set((reads ?? []).map((r) => r.notification_id as string));
    return ids.filter((id) => !readSet.has(id)).length;
  }

  /** خلاصة صفحة Notification History — كل الفلاتر (حالة/قراءة/بحث) + Pagination. */
  static async getFeed(userId: string, filters: NotificationFeedFilters = {}): Promise<{ items: NotificationFeedItem[]; total: number }> {
    const supabase = createServiceClient();
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const status = filters.status ?? "active";

    let query = supabase.from("notifications").select("*, projects(name)", { count: "exact" });
    if (status !== "all") query = query.eq("status", status);
    if (filters.search?.trim()) {
      const term = filters.search.trim();
      query = query.or(`title.ilike.%${term}%,message.ilike.%${term}%`);
    }
    query = query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

    const { data: rows, count } = await query;
    let items = await NotificationService.attachReadState(userId, (rows ?? []) as Array<NotificationRow & { projects: unknown }>);

    if (filters.readState === "read") items = items.filter((i) => i.isRead);
    else if (filters.readState === "unread") items = items.filter((i) => !i.isRead);

    return { items, total: count ?? items.length };
  }

  static async markRead(userId: string, notificationId: string): Promise<void> {
    const supabase = createServiceClient();
    await supabase.from("notification_reads").upsert({ notification_id: notificationId, user_id: userId }, { onConflict: "notification_id,user_id" });
    await logEvent(notificationId, "read", userId);
  }

  static async markAllRead(userId: string): Promise<number> {
    const supabase = createServiceClient();
    const { data: activeRows } = await supabase.from("notifications").select("id").eq("status", "active");
    const ids = (activeRows ?? []).map((r) => r.id as string);
    if (ids.length === 0) return 0;

    const { data: reads } = await supabase.from("notification_reads").select("notification_id").eq("user_id", userId).in("notification_id", ids);
    const readSet = new Set((reads ?? []).map((r) => r.notification_id as string));
    const unreadIds = ids.filter((id) => !readSet.has(id));
    if (unreadIds.length === 0) return 0;

    await supabase.from("notification_reads").upsert(
      unreadIds.map((id) => ({ notification_id: id, user_id: userId })),
      { onConflict: "notification_id,user_id" }
    );
    for (const id of unreadIds) await logEvent(id, "read", userId);
    return unreadIds.length;
  }

  static async markSelectedRead(userId: string, notificationIds: string[]): Promise<void> {
    const supabase = createServiceClient();
    if (notificationIds.length === 0) return;
    await supabase.from("notification_reads").upsert(
      notificationIds.map((id) => ({ notification_id: id, user_id: userId })),
      { onConflict: "notification_id,user_id" }
    );
    for (const id of notificationIds) await logEvent(id, "read", userId);
  }

  static async archive(notificationIds: string[], actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    if (notificationIds.length === 0) return;
    await supabase.from("notifications").update({ status: "archived" }).in("id", notificationIds);
    for (const id of notificationIds) await logEvent(id, "archived", actorId);
  }

  static async restore(notificationIds: string[], actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    if (notificationIds.length === 0) return;
    await supabase.from("notifications").update({ status: "active" }).in("id", notificationIds);
    for (const id of notificationIds) await logEvent(id, "restored", actorId);
  }

  /** حذف ناعم بس — الصف يفضل في قاعدة البيانات (status='deleted')، بيختفي من كل الواجهات. */
  static async softDelete(notificationIds: string[], actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    if (notificationIds.length === 0) return;
    await supabase.from("notifications").update({ status: "deleted" }).in("id", notificationIds);
    for (const id of notificationIds) await logEvent(id, "deleted", actorId);
  }

  static async logOpened(notificationId: string, actorId?: string): Promise<void> {
    await logEvent(notificationId, "opened", actorId);
  }

  private static async attachReadState(
    userId: string,
    rows: Array<NotificationRow & { projects: unknown }>
  ): Promise<NotificationFeedItem[]> {
    if (rows.length === 0) return [];
    const supabase = createServiceClient();
    const ids = rows.map((r) => r.id);
    const { data: reads } = await supabase.from("notification_reads").select("notification_id").eq("user_id", userId).in("notification_id", ids);
    const readSet = new Set((reads ?? []).map((r) => r.notification_id as string));

    return rows.map((r) => {
      const { projects, ...rest } = r;
      const projectName = Array.isArray(projects)
        ? (projects[0] as { name?: string } | undefined)?.name ?? null
        : (projects as { name?: string } | null)?.name ?? null;
      return { ...rest, isRead: readSet.has(r.id), projectName };
    });
  }
}
