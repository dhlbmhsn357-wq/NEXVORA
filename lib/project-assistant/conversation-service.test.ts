import { describe, it, expect, beforeEach } from "vitest";
import { makeFakeSupabase } from "./test-fake-supabase";
import {
  createConversation,
  listConversations,
  getConversationWithMessages,
  persistAssistantExchange,
  deriveConversationTitle,
} from "./conversation-service";
import type { AskProjectAssistantResult } from "./qa-pipeline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tables: Record<string, any[]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any;

beforeEach(() => {
  tables = {
    project_assistant_conversations: [],
    project_assistant_messages: [],
    project_assistant_message_sources: [],
  };
  supabase = makeFakeSupabase(tables);
});

describe("deriveConversationTitle", () => {
  it("returns the question as-is when short", () => {
    expect(deriveConversationTitle("ما حالة الاشتراك؟")).toBe("ما حالة الاشتراك؟");
  });

  it("truncates to ~60 chars with an ellipsis when long", () => {
    const long = "س".repeat(100);
    const title = deriveConversationTitle(long);
    expect(title.length).toBeLessThan(long.length);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to a default title for an empty question", () => {
    expect(deriveConversationTitle("   ")).toBe("محادثة جديدة");
  });
});

describe("createConversation", () => {
  it("inserts a row scoped to project+user and returns its id", async () => {
    const { id } = await createConversation(supabase, "proj-1", "user-1", "عنوان");
    expect(id).toBeTruthy();
    expect(tables.project_assistant_conversations).toHaveLength(1);
    expect(tables.project_assistant_conversations[0]).toMatchObject({
      project_id: "proj-1",
      user_id: "user-1",
      title: "عنوان",
    });
  });
});

describe("persistAssistantExchange — ok:true result", () => {
  it("inserts user + assistant messages and one source row per citation", async () => {
    const { id: conversationId } = await createConversation(supabase, "proj-1", "user-1");

    const result: AskProjectAssistantResult = {
      ok: true,
      answerText: "الإجابة النهائية.",
      answerStatus: "approved",
      citations: [
        { sourceId: "km-1", sourceType: "decision", sourceTitle: "قرار السعة", similarity: 0.9 },
        { sourceId: "km-2", sourceType: "prd_section", sourceTitle: "قسم PRD", similarity: 0.8 },
      ],
      conflictExplained: false,
    };

    const { userMessageId, assistantMessageId } = await persistAssistantExchange(
      supabase,
      conversationId,
      "ما السعة القصوى؟",
      result
    );

    expect(userMessageId).toBeTruthy();
    expect(assistantMessageId).toBeTruthy();

    const userMsg = tables.project_assistant_messages.find((m) => m.id === userMessageId);
    expect(userMsg).toMatchObject({ role: "user", content: "ما السعة القصوى؟", answer_status: null });

    const assistantMsg = tables.project_assistant_messages.find((m) => m.id === assistantMessageId);
    expect(assistantMsg).toMatchObject({ role: "assistant", content: "الإجابة النهائية.", answer_status: "approved" });

    const sources = tables.project_assistant_message_sources.filter((s) => s.message_id === assistantMessageId);
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.source_id).sort()).toEqual(["km-1", "km-2"]);
    // لا نستخدم conflictExplained كبيانات منفصلة (قرار موثَّق في conversation-service.ts) —
    // نتأكد فقط إنه ما بيتسربش كعمود غير متوقّع في أي جدول.
    expect(Object.keys(assistantMsg!)).not.toContain("conflict_explained");
  });
});

describe("persistAssistantExchange — ok:false result (failed turn is not silently dropped)", () => {
  it("still inserts an assistant message with the error text and null answer_status, no sources", async () => {
    const { id: conversationId } = await createConversation(supabase, "proj-1", "user-1");

    const result: AskProjectAssistantResult = { ok: false, message: "تعذّر توليد إجابة حاليًا — حاول مرة أخرى." };

    const { userMessageId, assistantMessageId } = await persistAssistantExchange(
      supabase,
      conversationId,
      "سؤال ما",
      result
    );

    expect(userMessageId).toBeTruthy();
    expect(assistantMessageId).toBeTruthy();

    const assistantMsg = tables.project_assistant_messages.find((m) => m.id === assistantMessageId);
    expect(assistantMsg).toMatchObject({
      role: "assistant",
      content: "تعذّر توليد إجابة حاليًا — حاول مرة أخرى.",
      answer_status: null,
    });

    const sources = tables.project_assistant_message_sources.filter((s) => s.message_id === assistantMessageId);
    expect(sources).toHaveLength(0);
  });
});

describe("conversation round trip: ask -> persisted -> getConversationAction-equivalent", () => {
  it("getConversationWithMessages returns the same Q&A with correct citations, in order", async () => {
    const { id: conversationId } = await createConversation(supabase, "proj-1", "user-1", "محادثة تجريبية");

    const result: AskProjectAssistantResult = {
      ok: true,
      answerText: "الجواب.",
      answerStatus: "documented",
      citations: [{ sourceId: "km-9", sourceType: "meeting", sourceTitle: "اجتماع الكشف", similarity: 0.75 }],
      conflictExplained: false,
    };
    await persistAssistantExchange(supabase, conversationId, "سؤال تجريبي؟", result);

    const conv = await getConversationWithMessages(supabase, conversationId);
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe("محادثة تجريبية");
    expect(conv!.messages).toHaveLength(2);
    expect(conv!.messages[0]).toMatchObject({ role: "user", content: "سؤال تجريبي؟" });
    expect(conv!.messages[1]).toMatchObject({ role: "assistant", content: "الجواب.", answerStatus: "documented" });
    expect(conv!.messages[1].sources).toEqual([
      { sourceId: "km-9", sourceType: "meeting", sourceTitle: "اجتماع الكشف", similarity: 0.75 },
    ]);
  });

  it("returns null for a non-existent conversation id", async () => {
    const conv = await getConversationWithMessages(supabase, "does-not-exist");
    expect(conv).toBeNull();
  });
});

describe("listConversations", () => {
  it("scopes strictly to project+user and excludes other users/projects", async () => {
    await createConversation(supabase, "proj-1", "user-1", "أ");
    await createConversation(supabase, "proj-1", "user-2", "ب"); // مستخدم تاني
    await createConversation(supabase, "proj-2", "user-1", "ج"); // مشروع تاني

    const list = await listConversations(supabase, "proj-1", "user-1");
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("أ");
  });
});
