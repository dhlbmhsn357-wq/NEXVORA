"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ShieldAlert, MessagesSquare, Check, ClipboardCheck, ClipboardPen, Clock, MessageCircle, Sparkles, AlertCircle, Brain, ThumbsUp, ThumbsDown, Eye, MessageSquareWarning, ClipboardX, Siren, Lightbulb, History, GitPullRequestArrow, Presentation } from "lucide-react";
import { getBellNotifications, markNotificationOpened, markAllNotificationsRead } from "@/app/(platform)/dashboard/notifications-actions";
import type { NotificationFeedItem } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/client";
import Tooltip from "./Tooltip";

const typeIcons: Record<string, ReactNode> = {
  blocked_review: <ShieldAlert size={14} className="text-[var(--v-red)]" />,
  pending_support: <MessagesSquare size={14} className="text-[var(--v-amber)]" />,
  discovery_submitted: <ClipboardCheck size={14} className="text-[var(--v-green)]" />,
  discovery_activity: <ClipboardPen size={14} className="text-[var(--v-info)]" />,
  discovery_expired: <Clock size={14} className="text-[var(--v-red)]" />,
  whatsapp_send_failed: <MessageCircle size={14} className="text-[var(--v-red)]" />,
  discovery_analysis_completed: <Sparkles size={14} className="text-[var(--v-primary)]" />,
  discovery_analysis_failed: <AlertCircle size={14} className="text-[var(--v-red)]" />,
  brain_draft_created: <Brain size={14} className="text-[var(--v-amber)]" />,
  brain_in_review: <Eye size={14} className="text-[var(--v-info)]" />,
  brain_changes_requested: <MessageSquareWarning size={14} className="text-[var(--v-amber)]" />,
  brain_approved: <ThumbsUp size={14} className="text-[var(--v-green)]" />,
  brain_rejected: <ThumbsDown size={14} className="text-[var(--v-red)]" />,
  engineering_review_failed: <ClipboardX size={14} className="text-[var(--v-red)]" />,
  engineering_review_needs_review: <ClipboardX size={14} className="text-[var(--v-amber)]" />,
  monitoring_critical_incident: <Siren size={14} className="text-[var(--v-red)]" />,
  knowledge_needs_approval: <Lightbulb size={14} className="text-[var(--v-amber)]" />,
  brain_pending_change: <GitPullRequestArrow size={14} className="text-[var(--v-primary)]" />,
  meeting_lifecycle: <Presentation size={14} className="text-[var(--v-info)]" />,
};

const DEFAULT_ICON = <Bell size={14} className="text-[var(--v-text-muted)]" />;

const typeGroupLabels: Record<string, string> = {
  blocked_review: "مراجعات محظورة",
  pending_support: "طلبات دعم",
  discovery_submitted: "نماذج اكتشاف مُرسلة",
  discovery_activity: "نشاط نماذج الاكتشاف",
  discovery_expired: "روابط اكتشاف منتهية",
  whatsapp_send_failed: "رسائل واتساب فشلت",
  discovery_analysis_completed: "تحاليل اكتشاف اكتملت",
  discovery_analysis_failed: "تحاليل اكتشاف فشلت",
  brain_draft_created: "Brain — Drafts بانتظار المراجعة",
  brain_in_review: "Brain — قيد المراجعة",
  brain_changes_requested: "Brain — طُلبت تعديلات",
  brain_approved: "Brain — نسخ معتمدة",
  brain_rejected: "Brain — Drafts مرفوضة",
  engineering_review_failed: "Engineering QA — مراجعات فشلت",
  engineering_review_needs_review: "Engineering QA — محتاجة مراجعة",
  monitoring_critical_incident: "Production Monitoring — حوادث Critical",
  knowledge_needs_approval: "الذكاء التنظيمي — معرفة بانتظار الاعتماد",
  brain_pending_change: "Project Brain — معرفة معلّقة بانتظار المراجعة",
  meeting_lifecycle: "عرض الاجتماع — تحديثات دورة حياة الاجتماع",
};

const GROUP_ORDER = [
  "monitoring_critical_incident",
  "brain_pending_change",
  "meeting_lifecycle",
  "knowledge_needs_approval",
  "blocked_review",
  "engineering_review_failed",
  "engineering_review_needs_review",
  "brain_changes_requested",
  "brain_draft_created",
  "brain_in_review",
  "brain_approved",
  "brain_rejected",
  "pending_support",
  "discovery_analysis_completed",
  "discovery_analysis_failed",
  "discovery_submitted",
  "whatsapp_send_failed",
  "discovery_activity",
  "discovery_expired",
];

/**
 * جرس الإشعارات — بيقرا من جدول notifications الحقيقي (مش Query حية
 * على 8 جداول ولا localStorage). حالة "مقروء" حقيقية لكل مستخدم
 * (notification_reads)، ومشترك Realtime عشان أي تحديث يوصل فورًا من
 * غير ما نستنى الـ Poll التالي. الضغط على إشعار بيسجّل Opened+Read
 * فورًا وبعدين يودّي لرابط عميق حقيقي (تبويب المشروع الصحيح + Highlight)
 * — مش صفحة عامة.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await getBellNotifications();
      setItems(data);
      setLoaded(true);
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 120_000);

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // notification_reads خاص بكل مستخدم — بدون فلترة بـ user_id، أي
    // مستخدم يعلّم إشعار كمقروء كان بيطلق إعادة تحميل لكل جرس مفتوح
    // لكل المستخدمين، وده حركة زايدة بلا داعي. notifications نفسها
    // تفضل بدون فلترة عمدًا لأنها مشتركة فعليًا بين كل الأدمنز.
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const userId = data.user?.id;
      channel = supabase
        .channel("notifications-bell")
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
        .on(
          "postgres_changes",
          userId
            ? { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${userId}` }
            : { event: "*", schema: "public", table: "notification_reads" },
          load
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function handleOpen(n: NotificationFeedItem) {
    setOpen(false);
    // تحديث تفاؤلي فوري للعداد قبل ما رد السيرفر يوصل
    setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
    await markNotificationOpened(n.id);
  }

  async function clearAll() {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    await markAllNotificationsRead();
  }

  const unreadCount = items.filter((n) => !n.isRead).length;
  const groups: Array<[string, NotificationFeedItem[]]> = GROUP_ORDER.map(
    (type) => [type, items.filter((n) => n.type === type)] as [string, NotificationFeedItem[]]
  ).filter(([, list]) => list.length > 0);
  const groupedTypes = new Set(GROUP_ORDER);
  const otherItems = items.filter((n) => !groupedTypes.has(n.type));
  if (otherItems.length > 0) groups.push(["أخرى", otherItems]);

  return (
    <div className="relative">
      <Tooltip label="الإشعارات">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="الإشعارات"
          className="relative flex h-9 w-9 items-center justify-center rounded-[var(--v-radius-md)] border border-[var(--v-border)] text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
        >
          <Bell size={16} />
          {loaded && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--v-red)] px-1 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] shadow-[var(--v-shadow-lg)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--v-border)] p-3">
                <p className="text-sm font-semibold text-[var(--v-text)]">الإشعارات</p>
                {items.length > 0 && unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-medium text-[var(--v-text-muted)] transition-colors hover:text-[var(--v-primary)]"
                  >
                    تعليم الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {items.length === 0 && (
                  <p className="p-4 text-center text-xs text-[var(--v-text-muted)]">مفيش إشعارات جديدة</p>
                )}
                {groups.map(([type, list]) => (
                  <div key={type}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">
                      {typeGroupLabels[type] ?? type}
                    </p>
                    {list.map((n) => (
                      <div
                        key={n.id}
                        className="group flex items-start gap-2 border-b border-[var(--v-border)] p-3 text-xs last:border-b-0 hover:bg-[var(--v-surface)]"
                      >
                        <Link href={n.target_url} onClick={() => handleOpen(n)} className="flex flex-1 items-start gap-2 min-w-0">
                          <span aria-hidden="true">{typeIcons[n.type] ?? DEFAULT_ICON}</span>
                          <span className={n.isRead ? "text-[var(--v-text-subtle)]" : "text-[var(--v-text)]"}>{n.message}</span>
                        </Link>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => handleOpen(n)}
                            aria-label="تعليم كمقروء"
                            className="shrink-0 text-[var(--v-text-muted)] opacity-0 transition-opacity hover:text-[var(--v-primary)] group-hover:opacity-100"
                          >
                            <Check size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 border-t border-[var(--v-border)] p-2.5 text-xs font-medium text-[var(--v-text-secondary)] transition-colors hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
              >
                <History size={13} /> كل الإشعارات
              </Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
