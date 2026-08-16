"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Send, Copy, MessageSquarePlus, Plus, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import type { UserRole } from "@/lib/types/database";
import {
  askProjectAssistantAction,
  listConversationsAction,
  getConversationAction,
  convertToOpenQuestionAction,
  getProjectKnowledgeSummaryAction,
  rebuildProjectKnowledgeAction,
  type KnowledgeSummaryItem,
} from "./project-assistant-actions";
import { getSuggestedQuestions, type ProjectAssistantViewpoint } from "@/lib/project-assistant/suggested-questions";
import type { ConversationSummary, MessageView } from "@/lib/project-assistant/conversation-service";

/**
 * مساعد المشروع — الواجهة الفعلية (Phase D).
 *
 * محادثة بسيطة: قائمة رسائل (فقاعة مستخدم/مساعد) + مربع إدخال. حالة
 * فارغة بملخّص معرفة ديناميكي + أسئلة مقترحة. لا تعتيم AI/RAG في أي نص
 * ظاهر للمستخدم — العبارات كلها "معرفة المشروع" / "جارٍ البحث في معرفة
 * المشروع…" بدل أي مصطلح تقني.
 */

type AnswerStatus = "approved" | "documented" | "unresolved" | "not_found" | null;

const STATUS_LABEL: Record<NonNullable<AnswerStatus>, string> = {
  approved: "معتمد",
  documented: "موثّق",
  unresolved: "غير محسوم",
  not_found: "غير موجود",
};

const STATUS_TONE: Record<NonNullable<AnswerStatus>, BadgeTone> = {
  approved: "success",
  documented: "info",
  unresolved: "warning",
  not_found: "neutral",
};

/**
 * خريطة أفضل-محاولة من نوع المصدر (object_type اللي بيرجع من الاستشهاد)
 * إلى تبويب المشروع المناسب — عشان الاستشهاد يبقى رابط قابل للنقر يوصّل
 * تقريبًا للمكان الصح. الأنواع اللي معندهاش وجهة واضحة/تبويب مخصّص بتفضل
 * نص عادي بلا رابط (أوضح من رابط مكسور أو مضلِّل).
 */
const CITATION_TAB_MAP: Record<string, string> = {
  discovery: "discovery",
  meeting: "meetings",
  decision: "decisions",
  prd_section: "prd",
  user_story: "stories",
  acceptance_criteria: "stories",
  requirement: "definition",
  business_rule: "definition",
  persona: "definition",
  user_flow: "definition",
  prototype_review: "prototypeReview",
  client_approval: "approvals",
  handoff_item: "handoff",
  commercial: "commercial",
  task: "tasks",
  brain: "projectBrain",
  // بلا وجهة واضحة: evidence (مبعثرة عبر أكتر من مصدر)، risk (subtab جوّه
  // أكتر من مكان)، evaluation_scenario (subtab جوّه docs)، system_message،
  // open_question — تفضل chips نص عادي.
};

function citationHref(projectId: string, sourceType: string): string | null {
  const tab = CITATION_TAB_MAP[sourceType];
  if (!tab) return null;
  return `/dashboard/projects/${projectId}?tab=${tab}`;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answerStatus: AnswerStatus;
  sources: MessageView["sources"];
  pending?: boolean;
}

export default function ProjectAssistantPanel({
  projectId,
  role,
}: {
  projectId: string;
  role: UserRole;
}) {
  const [viewpoint, setViewpoint] = useState<ProjectAssistantViewpoint>("general");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [knowledgeSummary, setKnowledgeSummary] = useState<KnowledgeSummaryItem[]>([]);
  const [input, setInput] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const localIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      const [summaryRes, convRes] = await Promise.all([
        getProjectKnowledgeSummaryAction(projectId),
        listConversationsAction(projectId),
      ]);
      if (summaryRes.ok && summaryRes.data) setKnowledgeSummary(summaryRes.data);
      if (convRes.ok && convRes.data) setConversations(convRes.data);
      setLoadingSummary(false);
    })();
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadConversation(id: string) {
    const res = await getConversationAction(id);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "المحادثة غير موجودة." : res.message);
      return;
    }
    setConversationId(id);
    setMessages(
      res.data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        answerStatus: m.answerStatus,
        sources: m.sources,
      }))
    );
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
  }

  function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;

    const nextId = ++localIdRef.current;
    const userMsg: ChatMessage = { id: `local-${nextId}`, role: "user", content: trimmed, answerStatus: null, sources: [] };
    const pendingMsg: ChatMessage = {
      id: `pending-${nextId}`,
      role: "assistant",
      content: "جارٍ البحث في معرفة المشروع…",
      answerStatus: null,
      sources: [],
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");

    startTransition(async () => {
      const res = await askProjectAssistantAction(projectId, trimmed, conversationId ?? undefined, viewpoint);
      if (!res.ok) {
        toast.error(res.message);
        setMessages((prev) => prev.filter((m) => m.id !== pendingMsg.id));
        return;
      }
      const data = res.data!;
      setConversationId(data.conversationId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? {
                id: data.assistantMessageId ?? pendingMsg.id,
                role: "assistant",
                content: data.answerText,
                answerStatus: data.answerStatus,
                sources: data.citations.map((c) => ({ sourceId: c.sourceId, sourceType: c.sourceType, sourceTitle: c.sourceTitle, similarity: c.similarity })),
              }
            : m
        )
      );
      // تحديث قائمة المحادثات (محادثة جديدة أو ترتيب تحديث).
      const convRes = await listConversationsAction(projectId);
      if (convRes.ok && convRes.data) setConversations(convRes.data);
    });
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content).then(
      () => toast.success("تم نسخ الإجابة."),
      () => toast.error("تعذّر النسخ.")
    );
  }

  function handleConvertToOpenQuestion(messageId: string, content: string) {
    if (messageId.startsWith("local-") || messageId.startsWith("pending-")) {
      toast.error("لم يتم حفظ هذه الرسالة بعد — حاول بعد لحظة.");
      return;
    }
    setConvertingId(messageId);
    startTransition(async () => {
      const res = await convertToOpenQuestionAction(messageId, content);
      setConvertingId(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("تم تحويل الإجابة إلى سؤال مفتوح.");
    });
  }

  async function handleRebuild() {
    setRebuilding(true);
    const res = await rebuildProjectKnowledgeAction(projectId);
    setRebuilding(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const { indexed, skipped, failed } = res.data!;
    toast.success(`تم تحديث المعرفة: ${indexed} عنصر مفهرَس${failed > 0 ? ` (${failed} فشل)` : ""}.`);
    const summaryRes = await getProjectKnowledgeSummaryAction(projectId);
    if (summaryRes.ok && summaryRes.data) setKnowledgeSummary(summaryRes.data);
    void skipped;
  }

  const canManage = role === "owner" || role === "admin" || role === "supervisor";
  const totalKnowledge = knowledgeSummary.reduce((sum, k) => sum + k.count, 0);
  const suggested = getSuggestedQuestions(role, viewpoint, knowledgeSummary);
  const showEmptyState = messages.length === 0;

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--v-primary-tint)] text-[var(--v-primary)]">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--v-text)]">مساعد المشروع</h3>
              <p className="mt-1 text-sm text-[var(--v-text-muted)]">
                اسأل NEXVORA عن أي قرار، متطلب، دليل أو جزء من هذا المشروع.
              </p>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                الإجابات مبنية على بيانات المشروع الحالية ومصادرها.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={viewpoint}
              onChange={(e) => setViewpoint(e.target.value as ProjectAssistantViewpoint)}
              className="h-9 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 text-xs text-[var(--v-text)]"
              aria-label="زاوية النظر"
            >
              <option value="general">عام</option>
              <option value="business">إدارة/أعمال</option>
              <option value="developer">تقني/مطوّر</option>
            </select>
            <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={startNewConversation}>
              محادثة جديدة
            </Button>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw size={14} className={rebuilding ? "animate-spin" : ""} />}
                onClick={handleRebuild}
                disabled={rebuilding}
              >
                {rebuilding ? "جارٍ التحديث…" : "إعادة بناء المعرفة"}
              </Button>
            )}
          </div>
        </div>

        {conversations.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--v-border)] pt-3">
            <span className="text-xs text-[var(--v-text-muted)]">المحادثات السابقة:</span>
            {conversations.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`rounded-[var(--v-radius-full)] border px-2.5 py-1 text-[11px] transition ${
                  c.id === conversationId
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                    : "border-[var(--v-border)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                }`}
              >
                {c.title || "محادثة جديدة"}
              </button>
            ))}
          </div>
        )}
      </Card>

      {showEmptyState && (
        <Card padding="lg">
          <h4 className="text-sm font-semibold text-[var(--v-text)]">ما الذي أعرفه عن المشروع الآن؟</h4>
          {loadingSummary ? (
            <p className="mt-2 text-xs text-[var(--v-text-muted)]">جارٍ تحميل ملخّص المعرفة…</p>
          ) : totalKnowledge === 0 ? (
            <EmptyState
              title="لا توجد معرفة مفهرسة بعد"
              description="اطرح سؤالك على أي حال — لو المشروع لسه جزئي، المساعد هيوضّح إن المعلومة غير متوفرة بدل ما يخترع إجابة."
            />
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {knowledgeSummary
                  .filter((k) => k.count > 0)
                  .map((k) => (
                    <Badge key={k.domain} tone="neutral">
                      {k.label} ({k.count})
                    </Badge>
                  ))}
              </div>
              <p className="mt-3 text-xs text-[var(--v-text-muted)]">
                المعرفة الحالية مبنية على {totalKnowledge} مصدر عبر {knowledgeSummary.filter((k) => k.count > 0).length} مرحلة من المشروع.
              </p>
            </>
          )}

          {suggested.length > 0 && (
            <div className="mt-4 border-t border-[var(--v-border)] pt-4">
              <p className="mb-2 text-xs font-medium text-[var(--v-text-muted)]">أسئلة مقترحة:</p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((q) => (
                  <button
                    key={q}
                    onClick={() => submitQuestion(q)}
                    disabled={isPending}
                    className="rounded-[var(--v-radius-full)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)] disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div ref={scrollRef} className="max-h-[520px] min-h-[160px] overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--v-text-muted)]">اطرح سؤالًا لبدء محادثة جديدة.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-[var(--v-radius-lg)] px-4 py-3 text-sm ${
                      m.role === "user"
                        ? "bg-[var(--v-surface)] text-[var(--v-text)]"
                        : "bg-[var(--v-primary-tint)] text-[var(--v-text)]"
                    }`}
                  >
                    {m.pending ? (
                      <span className="flex items-center gap-2 text-xs text-[var(--v-text-muted)]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--v-primary)]" />
                        {m.content}
                      </span>
                    ) : (
                      <>
                        {m.role === "assistant" && m.answerStatus && (
                          <div className="mb-2">
                            <Badge tone={STATUS_TONE[m.answerStatus]}>{STATUS_LABEL[m.answerStatus]}</Badge>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>

                        {m.role === "assistant" && m.sources.length > 0 && (
                          <div className="mt-2 border-t border-[var(--v-border)]/60 pt-2">
                            <p className="mb-1 text-[11px] text-[var(--v-text-muted)]">استندت إلى:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {m.sources.map((s, i) => {
                                const href = citationHref(projectId, s.sourceType);
                                return href ? (
                                  <a
                                    key={`${s.sourceId}-${i}`}
                                    href={href}
                                    className="rounded-[var(--v-radius-full)] bg-[var(--v-bg)] px-2 py-1 text-[11px] text-[var(--v-primary)] underline-offset-2 hover:underline"
                                  >
                                    {s.sourceTitle || s.sourceType}
                                  </a>
                                ) : (
                                  <span
                                    key={`${s.sourceId}-${i}`}
                                    className="rounded-[var(--v-radius-full)] bg-[var(--v-bg)] px-2 py-1 text-[11px] text-[var(--v-text-secondary)]"
                                  >
                                    {s.sourceTitle || s.sourceType}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {m.role === "assistant" && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => handleCopy(m.content)}
                              className="inline-flex items-center gap-1 text-[11px] text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"
                            >
                              <Copy size={11} /> نسخ الإجابة
                            </button>
                            {(m.answerStatus === "unresolved" || m.answerStatus === "not_found") && (
                              <button
                                onClick={() => handleConvertToOpenQuestion(m.id, m.content)}
                                disabled={convertingId === m.id}
                                className="inline-flex items-center gap-1 text-[11px] text-[var(--v-amber)] hover:underline disabled:opacity-50"
                              >
                                <MessageSquarePlus size={11} /> تحويل إلى سؤال مفتوح
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuestion(input);
          }}
          className="flex items-center gap-2 border-t border-[var(--v-border)] p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك عن المشروع…"
            disabled={isPending}
            className="h-10 flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] placeholder:text-[var(--v-text-muted)] focus:border-[var(--v-primary)] focus:outline-none"
          />
          <Button type="submit" variant="primary" size="md" icon={<Send size={16} />} loading={isPending} disabled={!input.trim()}>
            إرسال
          </Button>
        </form>
      </Card>
    </div>
  );
}
