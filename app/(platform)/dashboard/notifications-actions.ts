"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NotificationService, type NotificationFeedItem, type NotificationFeedFilters } from "@/lib/notifications/service";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * قراءة بحتة — لا تكتب في notifications أبدًا. التوفيق (reconcile)
 * بقى مسؤولية Cron مستقل (راجع app/api/cron/notifications-reconcile)
 * بمعدّل ثابت كل دقيقتين، مش كل Poll/كل حدث Realtime من أي عميل.
 *
 * السبب: لو الـ Reconcile كان بيتنادى من هنا زي الأول، كل عملية توفيق
 * بتكتب last_seen_at على كل إشعار نشط، والكتابة دي بتطلق حدث
 * postgres_changes، واللي بيوصل لنفس الجرس (وكل جرس مفتوح) عبر
 * الاشتراك في Realtime، فيعمل Poll تاني، يوفّق تاني، يكتب تاني —
 * حلقة مغلقة بلا نهاية بدون أي تفاعل من المستخدم. هذا كان السبب
 * الجذري لانفجار حركة Supabase/Vercel.
 */
export async function getBellNotifications(): Promise<NotificationFeedItem[]> {
  const userId = await getUserId();
  if (!userId) return [];
  return NotificationService.getBellFeed(userId);
}

export async function getNotificationHistory(filters: NotificationFeedFilters): Promise<{ items: NotificationFeedItem[]; total: number }> {
  const userId = await getUserId();
  if (!userId) return { items: [], total: 0 };
  return NotificationService.getFeed(userId, filters);
}

/** بيتنادى وقت الضغط على إشعار — قبل التنقّل مباشرة: يسجّل Opened + يعلّمه Read فورًا. */
export async function markNotificationOpened(notificationId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await NotificationService.logOpened(notificationId, userId);
  await NotificationService.markRead(userId, notificationId);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await NotificationService.markRead(userId, notificationId);
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await NotificationService.markAllRead(userId);
  revalidatePath("/dashboard/notifications");
}

export async function markSelectedNotificationsRead(ids: string[]): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await NotificationService.markSelectedRead(userId, ids);
  revalidatePath("/dashboard/notifications");
}

export async function archiveNotifications(ids: string[]): Promise<void> {
  const userId = await getUserId();
  await NotificationService.archive(ids, userId ?? undefined);
  revalidatePath("/dashboard/notifications");
}

export async function restoreNotifications(ids: string[]): Promise<void> {
  const userId = await getUserId();
  await NotificationService.restore(ids, userId ?? undefined);
  revalidatePath("/dashboard/notifications");
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  const userId = await getUserId();
  await NotificationService.softDelete(ids, userId ?? undefined);
  revalidatePath("/dashboard/notifications");
}
