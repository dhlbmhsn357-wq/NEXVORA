import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Fake Supabase — يدعم بالظبط أنماط الاستدعاء اللي knowledge-ingestion.ts
// بيستخدمها: select().eq()...maybeSingle(), select().eq().limit()
// (thenable)، upsert().select().maybeSingle()، update().eq().
// ============================================================
const state = vi.hoisted(() => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    business_rules: [],
    meeting_decisions: [],
    knowledge_memory: [],
    meetings: [],
  };
  let throwOnTable: string | null = null;
  let embedCallCount = 0;

  function applyFilters(rows: Array<Record<string, unknown>>, filters: Array<[string, unknown]>) {
    return rows.filter((r) => filters.every(([c, v]) => r[c] === v));
  }

  function makeSelectChain(rows: Array<Record<string, unknown>>, filters: Array<[string, unknown]>) {
    const chain = {
      eq(col: string, val: unknown) {
        return makeSelectChain(rows, [...filters, [col, val]]);
      },
      limit(_n: number) {
        return Promise.resolve({ data: applyFilters(rows, filters), error: null });
      },
      maybeSingle() {
        const data = applyFilters(rows, filters);
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
    };
    return chain;
  }

  function makeUpdateChain(rows: Array<Record<string, unknown>>, patch: Record<string, unknown>) {
    return {
      eq(col: string, val: unknown) {
        for (const r of rows) if (r[col] === val) Object.assign(r, patch);
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  function makeUpsertChain(
    rows: Array<Record<string, unknown>>,
    obj: Record<string, unknown>,
    opts: { onConflict?: string } | undefined
  ) {
    const conflictCols = (opts?.onConflict ?? "id").split(",");
    const existingIdx = rows.findIndex((r) => conflictCols.every((c) => r[c] === obj[c]));
    let row: Record<string, unknown>;
    if (existingIdx >= 0) {
      row = { ...rows[existingIdx], ...obj };
      rows[existingIdx] = row;
    } else {
      row = { id: `generated-${rows.length + 1}`, ...obj };
      rows.push(row);
    }
    return {
      select(_cols: string) {
        return { maybeSingle: () => Promise.resolve({ data: { id: row.id }, error: null }) };
      },
    };
  }

  const supabase = {
    from(table: string) {
      if (throwOnTable === table) {
        throw new Error(`boom:${table}`);
      }
      const rows = tables[table] ?? (tables[table] = []);
      return {
        select: (_cols: string) => makeSelectChain(rows, []),
        update: (patch: Record<string, unknown>) => makeUpdateChain(rows, patch),
        upsert: (obj: Record<string, unknown>, opts?: { onConflict?: string }) => makeUpsertChain(rows, obj, opts),
      };
    },
  };

  return {
    tables,
    supabase,
    setThrowOnTable: (t: string | null) => {
      throwOnTable = t;
    },
    getEmbedCallCount: () => embedCallCount,
    incrementEmbedCallCount: () => {
      embedCallCount += 1;
    },
    resetEmbedCallCount: () => {
      embedCallCount = 0;
    },
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => state.supabase),
}));

vi.mock("@/lib/ai/service", () => ({
  AIService: {
    embed: vi.fn(async () => {
      state.incrementEmbedCallCount();
      return { success: true, embedding: [0.1, 0.2, 0.3], model_used: "test", provider: "gemini", latency_ms: 1, error: null };
    }),
  },
}));

import { syncKnowledgeEntry, rebuildProjectKnowledge } from "./knowledge-ingestion";

beforeEach(() => {
  state.tables.business_rules = [];
  state.tables.meeting_decisions = [];
  state.tables.knowledge_memory = [];
  state.tables.meetings = [];
  state.setThrowOnTable(null);
  state.resetEmbedCallCount();
});

describe("syncKnowledgeEntry — تخطّي إعادة الـ embedding عند ثبات content_hash", () => {
  it("أول مزامنة بتعمل embed، والتانية (نفس المحتوى) بتتخطّاه", async () => {
    state.tables.business_rules.push({
      id: "r1",
      project_id: "p1",
      title: "حد السحب",
      trigger_condition: "المبلغ > الرصيد",
      threshold_value: "5000",
      on_violation: "منع",
      enforcement_point: "server",
    });

    await syncKnowledgeEntry(state.supabase as never, "p1", "business_rule", "r1");
    expect(state.getEmbedCallCount()).toBe(1);
    expect(state.tables.knowledge_memory).toHaveLength(1);

    // نفس الصف بلا أي تغيير — مزامنة تانية
    await syncKnowledgeEntry(state.supabase as never, "p1", "business_rule", "r1");
    expect(state.getEmbedCallCount()).toBe(1); // لسه واحد بس — اتخطّى التاني
    expect(state.tables.knowledge_memory).toHaveLength(1);
  });

  it("لو المحتوى اتغيّر فعلًا، بيعمل embed تاني", async () => {
    state.tables.business_rules.push({
      id: "r1",
      project_id: "p1",
      title: "حد السحب",
      trigger_condition: "المبلغ > الرصيد",
      threshold_value: "5000",
      on_violation: "منع",
      enforcement_point: "server",
    });
    await syncKnowledgeEntry(state.supabase as never, "p1", "business_rule", "r1");
    expect(state.getEmbedCallCount()).toBe(1);

    (state.tables.business_rules[0] as { threshold_value: string }).threshold_value = "9999";
    await syncKnowledgeEntry(state.supabase as never, "p1", "business_rule", "r1");
    expect(state.getEmbedCallCount()).toBe(2);
  });
});

describe("syncKnowledgeEntry — منطق الاستبدال (superseding)", () => {
  it("قرار اجتماع قديم بحالة superseded بيتعلّم is_current=false وsuperseded_by بيشاور للقرار الجديد", async () => {
    state.tables.meeting_decisions.push(
      { id: "d2", project_id: "p1", meeting_id: "mt1", text: "استخدام Postgres", status: "active", superseded_by_id: null, change_reason: null },
      { id: "d1", project_id: "p1", meeting_id: "mt1", text: "استخدام MongoDB", status: "superseded", superseded_by_id: "d2", change_reason: "احتياج علاقات" }
    );

    // القرار الجديد الأول (عشان يبقى موجود وقت ما نربط القديم بيه)
    await syncKnowledgeEntry(state.supabase as never, "p1", "meeting_decision", "d2");
    // القرار القديم المُستبدَل
    await syncKnowledgeEntry(state.supabase as never, "p1", "meeting_decision", "d1");

    const newRow = state.tables.knowledge_memory.find((r) => r.object_id === "d2") as Record<string, unknown>;
    const oldRow = state.tables.knowledge_memory.find((r) => r.object_id === "d1") as Record<string, unknown>;

    expect(oldRow.is_current).toBe(false);
    expect(oldRow.is_superseded).toBe(true);
    expect(oldRow.superseded_by).toBe(newRow.id);

    expect(newRow.is_current).toBe(true);
    expect(newRow.is_superseded).toBe(false);
  });
});

describe("rebuildProjectKnowledge — مرونة أمام فشل جزئي", () => {
  it("فشل جلب مصدر واحد ما بيوقّفش باقي المصادر، والعدّادات بتعكس النجاح الجزئي", async () => {
    state.tables.business_rules.push({
      id: "r1",
      project_id: "p1",
      title: "قاعدة",
      trigger_condition: "شرط",
      threshold_value: "قيمة",
      on_violation: "أثر",
      enforcement_point: "server",
    });
    // meetings هيفشل جلبه عمدًا
    state.setThrowOnTable("meetings");

    const outcome = await rebuildProjectKnowledge("p1");

    // business_rule اتفهرس بنجاح رغم فشل meetings
    expect(outcome.indexed).toBeGreaterThanOrEqual(1);
    expect(state.tables.knowledge_memory.some((r) => r.object_type === "business_rule")).toBe(true);
  });
});
