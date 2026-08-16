import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "@/lib/project-assistant/test-fake-supabase";
import type { AskProjectAssistantResult } from "@/lib/project-assistant/qa-pipeline";

// ============================================================
// Phase D — اختبارات تكامل لطبقة الـ Server Actions: RBAC حقيقي (سطحيًا،
// عبر mock requireRole) + الاستمرارية الحقيقية (conversation-service غير
// مموَّهة، شغّالة فوق fake supabase) + askProjectAssistant مموَّه بالكامل
// (Phase C اتغطّت في qa-pipeline.test.ts، هنا الهدف طبقة Phase D بس).
// ============================================================

const state = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requireRoleResult: any = { ok: true, userId: "user-1", role: "owner" };
  return {
    setRequireRoleResult: (r: unknown) => {
      requireRoleResult = r;
    },
    getRequireRoleResult: () => requireRoleResult,
  };
});

vi.mock("@/lib/auth/rbac", () => ({
  requireRole: vi.fn(async () => state.getRequireRoleResult()),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tables: Record<string, any[]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fakeSupabase: any;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => fakeSupabase),
}));

const askProjectAssistantMock = vi.fn();
vi.mock("@/lib/project-assistant/qa-pipeline", () => ({
  askProjectAssistant: (...args: unknown[]) => askProjectAssistantMock(...args),
}));

vi.mock("@/lib/project-assistant/knowledge-ingestion", () => ({
  rebuildProjectKnowledge: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  askProjectAssistantAction,
  convertToOpenQuestionAction,
  getConversationAction,
  listOpenQuestionsAction,
} from "./project-assistant-actions";
import { requireRole } from "@/lib/auth/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  state.setRequireRoleResult({ ok: true, userId: "user-1", role: "owner" });
  tables = {
    project_assistant_conversations: [],
    project_assistant_messages: [],
    project_assistant_message_sources: [],
    project_open_questions: [],
    knowledge_memory: [],
  };
  fakeSupabase = makeFakeSupabase(tables);
  askProjectAssistantMock.mockResolvedValue({
    ok: true,
    answerText: "إجابة",
    answerStatus: "documented",
    citations: [],
    conflictExplained: false,
  } satisfies AskProjectAssistantResult);
});

describe("askProjectAssistantAction — requester role is always server-sourced", () => {
  it("passes the role returned by requireRole('member') through to askProjectAssistant, never a client value", async () => {
    state.setRequireRoleResult({ ok: true, userId: "member-user", role: "member" });

    const res = await askProjectAssistantAction("proj-1", "هل هناك معلومة سرّية؟");

    expect(res.ok).toBe(true);
    expect(askProjectAssistantMock).toHaveBeenCalledTimes(1);
    const [, input] = askProjectAssistantMock.mock.calls[0];
    expect(input.requesterRole).toBe("member");
    // ملاحظة حاسمة: توقيع الدالة أصلًا ما بيقبلش أي معامل role من العميل —
    // requireRole هو المصدر الوحيد الممكن لهذه القيمة (الشرط بُني بنائيًا،
    // مش بس بالاختبار).
  });

  it("case 4 (permission): a member-role caller still gets filtered results end-to-end — confidential-exclusion decision lives inside askProjectAssistant/retrieval, verified here via the role actually forwarded", async () => {
    state.setRequireRoleResult({ ok: true, userId: "member-user", role: "member" });
    askProjectAssistantMock.mockResolvedValue({
      ok: true,
      answerText: "إجابة بدون أي مصدر سرّي — الفلترة تمّت داخل الاسترجاع.",
      answerStatus: "documented",
      citations: [{ sourceId: "km-1", sourceType: "discovery", sourceTitle: "ملاحظة عامة", similarity: 0.8 }],
      conflictExplained: false,
    });

    const res = await askProjectAssistantAction("proj-1", "ما تفاصيل العقد السرّي؟");

    expect(res.ok).toBe(true);
    const [, input] = askProjectAssistantMock.mock.calls[0];
    expect(input.requesterRole).toBe("member");
    if (res.ok && res.data) {
      expect(res.data.citations.every((c) => c.sourceType !== "confidential")).toBe(true);
    }
  });
});

describe("askProjectAssistantAction — case 5: unauthenticated/insufficient-role caller is rejected before any retrieval", () => {
  it("returns ok:false and never calls askProjectAssistant when requireRole fails", async () => {
    state.setRequireRoleResult({ ok: false, message: "غير مسجّل دخول." });

    const res = await askProjectAssistantAction("proj-1", "أي سؤال");

    expect(res.ok).toBe(false);
    expect(askProjectAssistantMock).not.toHaveBeenCalled();
  });

  it("confirms this codebase's actual access model: role-gate only, no per-project membership table — matches the convention used by every other project-scoped action (evidence-actions.ts, task-actions.ts: requireRole(['owner','admin','supervisor','member']))", async () => {
    // أي مستخدم بدور كافٍ (حتى member) قادر يوصل لأي projectId — مفيش
    // project_members أو ما يعادلها في هذا الكودبيز (single-tenant، أدوار
    // على مستوى المنظمة كلها). هنا بنتأكد إن الـ action ما بتضيفش فحص
    // إضافي "عضوية مشروع" مش موجود أصلًا في بقية النظام.
    state.setRequireRoleResult({ ok: true, userId: "user-1", role: "member" });
    const res = await askProjectAssistantAction("some-project-the-caller-has-never-touched-before", "سؤال");
    expect(res.ok).toBe(true);
    expect(requireRole).toHaveBeenCalledWith(["owner", "admin", "supervisor", "member"]);
  });
});

describe("conversation persistence round-trip through the action layer", () => {
  it("ask -> persisted -> getConversationAction returns the same Q&A with correct citations", async () => {
    askProjectAssistantMock.mockResolvedValue({
      ok: true,
      answerText: "القرار الحالي هو X.",
      answerStatus: "approved",
      citations: [{ sourceId: "km-5", sourceType: "decision", sourceTitle: "قرار السعة", similarity: 0.92 }],
      conflictExplained: false,
    } satisfies AskProjectAssistantResult);

    const askRes = await askProjectAssistantAction("proj-1", "ما القرار الحالي بخصوص السعة؟");
    expect(askRes.ok).toBe(true);
    if (!askRes.ok || !askRes.data) throw new Error("unreachable");

    const convRes = await getConversationAction(askRes.data.conversationId);
    expect(convRes.ok).toBe(true);
    if (!convRes.ok || !convRes.data) throw new Error("unreachable");

    expect(convRes.data.messages).toHaveLength(2);
    expect(convRes.data.messages[0]).toMatchObject({ role: "user", content: "ما القرار الحالي بخصوص السعة؟" });
    expect(convRes.data.messages[1]).toMatchObject({ role: "assistant", content: "القرار الحالي هو X.", answerStatus: "approved" });
    expect(convRes.data.messages[1].sources).toEqual([
      { sourceId: "km-5", sourceType: "decision", sourceTitle: "قرار السعة", similarity: 0.92 },
    ]);
  });

  it("does not silently drop a failed AI turn — the assistant message is still persisted and retrievable", async () => {
    askProjectAssistantMock.mockResolvedValue({ ok: false, message: "تعذّر توليد إجابة حاليًا — حاول مرة أخرى." });

    const askRes = await askProjectAssistantAction("proj-1", "سؤال ما");
    expect(askRes.ok).toBe(true); // الـ action نفسها بتنجح (السؤال اتحفظ) — الفشل داخل answerStatus:null
    if (!askRes.ok || !askRes.data) throw new Error("unreachable");
    expect(askRes.data.answerStatus).toBeNull();

    const convRes = await getConversationAction(askRes.data.conversationId);
    expect(convRes.ok).toBe(true);
    if (!convRes.ok || !convRes.data) throw new Error("unreachable");
    expect(convRes.data.messages).toHaveLength(2);
    expect(convRes.data.messages[1].content).toBe("تعذّر توليد إجابة حاليًا — حاول مرة أخرى.");
  });
});

describe("convertToOpenQuestionAction", () => {
  it("creates a retrievable open question linked to the source message and its project", async () => {
    askProjectAssistantMock.mockResolvedValue({
      ok: true,
      answerText: "لا توجد معلومات كافية.",
      answerStatus: "not_found",
      citations: [],
      conflictExplained: false,
    } satisfies AskProjectAssistantResult);

    const askRes = await askProjectAssistantAction("proj-1", "ما هي سياسة الاسترجاع؟");
    expect(askRes.ok).toBe(true);
    if (!askRes.ok || !askRes.data || !askRes.data.assistantMessageId) throw new Error("unreachable");

    const convertRes = await convertToOpenQuestionAction(askRes.data.assistantMessageId, "ما هي سياسة الاسترجاع؟");
    expect(convertRes.ok).toBe(true);
    if (!convertRes.ok || !convertRes.data) throw new Error("unreachable");

    const listRes = await listOpenQuestionsAction("proj-1");
    expect(listRes.ok).toBe(true);
    if (!listRes.ok || !listRes.data) throw new Error("unreachable");
    expect(listRes.data).toHaveLength(1);
    expect(listRes.data[0]).toMatchObject({ id: convertRes.data.questionId, question: "ما هي سياسة الاسترجاع؟", status: "open" });

    const storedRow = tables.project_open_questions[0];
    expect(storedRow.message_id).toBe(askRes.data.assistantMessageId);
    expect(storedRow.project_id).toBe("proj-1");
    expect(storedRow.source).toBe("assistant");
  });

  it("rejects when the caller is not authenticated/authorized", async () => {
    state.setRequireRoleResult({ ok: false, message: "غير مسجّل دخول." });
    const res = await convertToOpenQuestionAction("some-message-id", "سؤال");
    expect(res.ok).toBe(false);
  });
});
