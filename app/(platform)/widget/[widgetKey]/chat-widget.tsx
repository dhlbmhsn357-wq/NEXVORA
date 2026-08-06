"use client";

import { useState, useRef, useEffect } from "react";
import { Paperclip, Send, ThumbsUp, ThumbsDown } from "lucide-react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import type { ConversationMessage } from "@/lib/types/database";

interface ChatResponse {
  ok: boolean;
  reply?: string;
  done?: boolean;
  escalated?: boolean;
  requestId?: string;
  error?: string;
  historySignature?: string;
}

interface DisplayMessage extends ConversationMessage {
  closesCase?: boolean;
  requestId?: string;
  previewUrl?: string | null;
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

interface SyncMessage {
  type: "context-update";
  contextHistory: ConversationMessage[];
  historySignature: string | null;
  customerName: string;
  customerEmail: string;
  updatedAt: number;
}

/**
 * لو العميل فتح تابين للـ Widget بنفس الوقت، BroadcastChannel بيزامن
 * سياق المحادثة (مش الشكل المرئي) بين التابات، عشان الطلبين ميتحولوش
 * لـ Case منفصلة تمامًا لنفس المشكلة. مدعوم في كل المتصفحات الحديثة؛
 * لو مش مدعوم (نادر)، السلوك يرجع للوضع الأصلي (كل تاب مستقل) بأمان.
 */
function createWidgetSyncChannel(widgetKey: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(`pm-os-support-widget-${widgetKey}`);
  } catch {
    return null;
  }
}

/**
 * Support Widget — عميل خفيف مستقل عن لوحة التحكم. الشات مستمر
 * ودائم في نفس الجلسة: كل ما طلب يوصل لحالة نهائية (حل مباشر أو
 * تصعيد) بيتحفظ كـ Case رسمية منفصلة في الخلفية، لكن العميل يقدر
 * يكمل يكتب طلب جديد على طول من غير ما يفتح صفحة جديدة.
 */
export default function ChatWidget({ widgetKey, projectName }: { widgetKey: string; projectName: string }) {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [contextHistory, setContextHistory] = useState<ConversationMessage[]>([]);
  const [historySignature, setHistorySignature] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [sending, setSending] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ path: string; previewUrl: string | null } | null>(
    null
  );
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [ratedRequestIds, setRatedRequestIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastSyncedAt = useRef(0);
  const recentErrorsRef = useRef<Array<{ message: string; source?: string; at: string }>>([]);
  const MAX_TRACKED_ERRORS = 5;

  const identityConfirmed = displayMessages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [displayMessages]);

  useEffect(() => {
    const channel = createWidgetSyncChannel(widgetKey);
    channelRef.current = channel;
    if (!channel) return;

    function handleMessage(event: MessageEvent<SyncMessage>) {
      const msg = event.data;
      if (msg?.type !== "context-update") return;
      // خُد بس آخر تحديث زمنيًا — بيمنع تاب قديم يدوس على تحديث أحدث من تاب تاني.
      if (msg.updatedAt <= lastSyncedAt.current) return;
      lastSyncedAt.current = msg.updatedAt;
      setContextHistory(msg.contextHistory);
      setHistorySignature(msg.historySignature);
      setCustomerName((prev) => prev || msg.customerName);
      setCustomerEmail((prev) => prev || msg.customerEmail);
    }

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, [widgetKey]);

  // تشخيصات تلقائية حقيقية — أخطاء JS/Promise فعلية مُلتقطة من الصفحة
  // نفسها وقت حدوثها، بترفق تلقائيًا مع أي تذكرة دعم بتتفتح — Phase 6.
  useEffect(() => {
    function trackError(message: string, source?: string) {
      recentErrorsRef.current = [...recentErrorsRef.current, { message: message.slice(0, 500), source, at: new Date().toISOString() }].slice(-MAX_TRACKED_ERRORS);
    }
    function handleError(event: ErrorEvent) {
      trackError(event.message, event.filename ?? undefined);
    }
    function handleRejection(event: PromiseRejectionEvent) {
      trackError(String(event.reason?.message ?? event.reason ?? "Unhandled rejection"), "unhandledrejection");
    }
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  function collectDiagnostics() {
    return {
      browserInfo: { userAgent: navigator.userAgent, language: navigator.language },
      environmentInfo: { url: window.location.href, viewport: `${window.innerWidth}x${window.innerHeight}`, timestamp: new Date().toISOString() },
      recentClientErrors: recentErrorsRef.current,
    };
  }

  function broadcastContext(nextHistory: ConversationMessage[], nextSignature: string | null) {
    const now = Date.now();
    lastSyncedAt.current = now;
    channelRef.current?.postMessage({
      type: "context-update",
      contextHistory: nextHistory,
      historySignature: nextSignature,
      customerName,
      customerEmail,
      updatedAt: now,
    } satisfies SyncMessage);
  }

  function customerIdentifier(): string | null {
    if (!customerName.trim() && !customerEmail.trim()) return null;
    return `${customerName.trim()} <${customerEmail.trim()}>`;
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAttachmentError("");
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("widgetKey", widgetKey);
      formData.append("file", file);
      const res = await fetch("/api/support/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) {
        setAttachmentError(data.error ?? "فشل رفع الملف.");
      } else {
        setPendingAttachment({ path: data.path, previewUrl: data.previewUrl ?? null });
      }
    } catch {
      setAttachmentError("فشل رفع الملف — تأكد من الاتصال وحاول تاني.");
    }
    setUploadingAttachment(false);
  }

  async function send(messageOverride?: string) {
    const messageToSend = (messageOverride ?? input).trim();
    if ((!messageToSend && !pendingAttachment) || sending) return;

    if (!identityConfirmed) {
      if (!customerName.trim() || !isValidEmail(customerEmail.trim())) {
        setIdentityError("من فضلك اكتب اسمك وبريد إلكتروني صحيح قبل بدء المحادثة.");
        return;
      }
    }
    setIdentityError("");

    setSending(true);
    setConnectionError(false);
    setLastMessage(messageToSend);
    setInput("");
    const attachment = pendingAttachment;
    setPendingAttachment(null);

    const historyForRequest = contextHistory;
    setDisplayMessages((prev) => [
      ...prev,
      {
        role: "customer",
        content: messageToSend || "(صورة مرفقة)",
        created_at: new Date().toISOString(),
        attachmentPath: attachment?.path ?? null,
        previewUrl: attachment?.previewUrl ?? null,
      },
    ]);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetKey,
          history: historyForRequest,
          historySignature,
          message: messageToSend || "(صورة مرفقة)",
          customerIdentifier: customerIdentifier(),
          attachmentPath: attachment?.path ?? null,
          diagnostics: collectDiagnostics(),
        }),
      });

      const data: ChatResponse = await res.json();

      if (!data.ok || !data.reply) {
        setConnectionError(true);
        setSending(false);
        return;
      }

      setDisplayMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply as string,
          created_at: new Date().toISOString(),
          closesCase: !!data.done,
          requestId: data.requestId,
        },
      ]);

      if (data.done) {
        // الحالة اتقفلت وحُفظت كـ Case منفصلة — نبدأ سياق جديد للطلب الجاي
        // بدل ما نقفل الشات كليًا.
        setContextHistory([]);
        setHistorySignature(data.historySignature ?? null);
        broadcastContext([], data.historySignature ?? null);
      } else {
        const updatedHistory: ConversationMessage[] = [
          ...historyForRequest,
          {
            role: "customer",
            content: messageToSend || "(صورة مرفقة)",
            created_at: new Date().toISOString(),
            attachmentPath: attachment?.path ?? null,
          },
          { role: "assistant", content: data.reply as string, created_at: new Date().toISOString() },
        ];
        setContextHistory(updatedHistory);
        setHistorySignature(data.historySignature ?? null);
        broadcastContext(updatedHistory, data.historySignature ?? null);
      }
      setSending(false);
    } catch {
      setConnectionError(true);
      setSending(false);
    }
  }

  async function handleRate(requestId: string, rating: 1 | -1) {
    setRatedRequestIds((prev) => new Set(prev).add(requestId));
    try {
      await fetch("/api/support/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, rating }),
      });
    } catch {
      // فشل التقييم مش حرج — العميل شاف رد التأكيد أصلاً، نسيبه بهدوء
    }
  }

  function handleRetry() {
    if (!lastMessage) return;
    setDisplayMessages((prev) => prev.slice(0, -1));
    send(lastMessage);
  }

  return (
    <div className="flex h-full max-h-[600px] min-h-[400px] w-full flex-col rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)]">
      <div className="border-b border-[var(--v-border)] p-3">
        <p className="text-sm font-semibold text-[var(--v-text)]">{projectName} — الدعم الفني</p>
        {!identityConfirmed && (
          <div className="mt-2 space-y-1.5">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="الاسم *" />
            <Input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="البريد الإلكتروني *"
              dir="ltr"
              error={identityError || undefined}
            />
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {displayMessages.length === 0 && (
          <p className="text-center text-xs text-[var(--v-text-muted)]">
            اكتب اسمك وبريدك الإلكتروني، وبعدين اكتب مشكلتك أو سؤالك وهنساعدك في أسرع وقت.
          </p>
        )}
        {displayMessages.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === "customer" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-[var(--v-radius-lg)] px-3 py-2 text-sm ${
                  m.role === "customer" ? "bg-[var(--v-primary)] text-white" : "bg-[var(--v-surface)] text-[var(--v-text)]"
                }`}
              >
                {m.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.previewUrl} alt="مرفق" className="mb-1.5 max-h-40 rounded-[var(--v-radius-md)] object-cover" />
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
            {m.closesCase && (
              <div className="mt-1 text-center">
                <p className="text-[11px] text-[var(--v-text-muted)]">
                  — تم تسجيل هذا الطلب. تقدر تكمل بطلب جديد في أي وقت —
                </p>
                {m.requestId && !ratedRequestIds.has(m.requestId) && (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-[11px] text-[var(--v-text-muted)]">هل كنت راضٍ عن الرد؟</span>
                    <button
                      type="button"
                      onClick={() => handleRate(m.requestId as string, 1)}
                      aria-label="راضٍ"
                      className="flex items-center justify-center rounded-full border border-[var(--v-border)] p-1.5 hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate(m.requestId as string, -1)}
                      aria-label="غير راضٍ"
                      className="flex items-center justify-center rounded-full border border-[var(--v-border)] p-1.5 hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                    >
                      <ThumbsDown size={13} />
                    </button>
                  </div>
                )}
                {m.requestId && ratedRequestIds.has(m.requestId) && (
                  <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">شكرًا لتقييمك</p>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-xs text-[var(--v-text-muted)]">جاري الكتابة…</p>}
        {connectionError && (
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-2 text-xs text-[var(--v-red)]">
            حصل خطأ في الاتصال.{" "}
            <button type="button" onClick={handleRetry} className="font-bold underline">
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      {pendingAttachment && (
        <div className="flex items-center gap-2 border-t border-[var(--v-border)] px-3 pt-2">
          {pendingAttachment.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingAttachment.previewUrl} alt="مرفق جاهز للإرسال" className="h-10 w-10 rounded object-cover" />
          )}
          <span className="text-[11px] text-[var(--v-text-muted)]">صورة جاهزة للإرسال</span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="text-[11px] text-[var(--v-red)] hover:underline"
          >
            إزالة
          </button>
        </div>
      )}
      {attachmentError && (
        <p className="border-t border-[var(--v-border)] px-3 pt-2 text-[11px] text-[var(--v-red)]">
          {attachmentError}
        </p>
      )}

      <div className="flex gap-2 border-t border-[var(--v-border)] p-3">
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAttachFile} className="hidden" />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploadingAttachment}
          aria-label="إرفاق صورة"
        >
          <Paperclip size={16} />
        </Button>
        <div className="flex-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={sending}
            placeholder="اكتب رسالتك…"
          />
        </div>
        <Button type="button" variant="primary" onClick={() => send()} disabled={!input.trim() && !pendingAttachment} loading={sending}>
          <Send size={16} />
          إرسال
        </Button>
      </div>
    </div>
  );
}
