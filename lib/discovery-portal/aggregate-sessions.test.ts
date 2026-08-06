import { describe, expect, it } from "vitest";
import { aggregateSessionForms, type SessionFormRow } from "./aggregate-sessions";
import type { DiscoverySnapshotItem } from "@/lib/types/database";

function snap(items: Array<{ key: string; label: string }>): DiscoverySnapshotItem[] {
  return items.map((it, i) => ({ key: it.key, label: it.label, type: "short_text", category: null, order: i + 1 }));
}

function form(partial: Partial<SessionFormRow> & { id: string }): SessionFormRow {
  return {
    id: partial.id,
    link_id: partial.link_id ?? partial.id,
    answers: partial.answers ?? {},
    questions_snapshot: partial.questions_snapshot ?? null,
    session_name: partial.session_name ?? null,
    department: partial.department ?? null,
  };
}

describe("aggregateSessionForms", () => {
  it("مفيش جلسات → hasData=false وكل شيء فاضي", () => {
    const r = aggregateSessionForms([]);
    expect(r.hasData).toBe(false);
    expect(r.answeredSessions).toBe(0);
    expect(r.labeledPairs).toEqual([]);
  });

  it("يتجاهل الجلسات الفاضية", () => {
    const r = aggregateSessionForms([form({ id: "a", answers: {} })]);
    expect(r.hasData).toBe(false);
    expect(r.answeredSessions).toBe(0);
  });

  it("يجمّع جلسات متعددة ويسبق كل زوج بمصدره (الإدارة)", () => {
    const r = aggregateSessionForms([
      form({ id: "acc", department: "المحاسبة", answers: { q1: "دليل حسابات" }, questions_snapshot: snap([{ key: "q1", label: "شجرة الحسابات؟" }]) }),
      form({ id: "sales", department: "المبيعات", answers: { q2: "خط أنابيب" }, questions_snapshot: snap([{ key: "q2", label: "خط المبيعات؟" }]) }),
    ]);
    expect(r.hasData).toBe(true);
    expect(r.answeredSessions).toBe(2);
    expect(r.mergedAnswers).toEqual({ q1: "دليل حسابات", q2: "خط أنابيب" });
    expect(r.labeledPairs).toEqual([
      { label: "[المحاسبة] شجرة الحسابات؟", value: "دليل حسابات" },
      { label: "[المبيعات] خط المبيعات؟", value: "خط أنابيب" },
    ]);
    expect(r.mergedSnapshot).toHaveLength(2);
  });

  it("لو مفيش إدارة يستخدم اسم الجلسة كمصدر، ولو مفيش الاتنين مفيش prefix", () => {
    const named = aggregateSessionForms([
      form({ id: "s1", session_name: "الاكتشاف العام", answers: { q1: "قيمة" }, questions_snapshot: snap([{ key: "q1", label: "سؤال؟" }]) }),
    ]);
    expect(named.labeledPairs[0].label).toBe("[الاكتشاف العام] سؤال؟");

    const bare = aggregateSessionForms([
      form({ id: "s2", answers: { q1: "قيمة" }, questions_snapshot: snap([{ key: "q1", label: "سؤال؟" }]) }),
    ]);
    expect(bare.labeledPairs[0].label).toBe("سؤال؟");
  });
});
