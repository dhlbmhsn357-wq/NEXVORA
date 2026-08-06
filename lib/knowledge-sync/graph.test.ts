import { describe, expect, it } from "vitest";
import { DOWNSTREAM_OF_BRAIN, SYNC_ARTIFACT_LABELS } from "./graph";

describe("knowledge-sync graph", () => {
  it("كل مشتق في DOWNSTREAM_OF_BRAIN له تسمية عربية في SYNC_ARTIFACT_LABELS", () => {
    for (const key of DOWNSTREAM_OF_BRAIN) {
      expect(SYNC_ARTIFACT_LABELS[key]).toBeTruthy();
    }
  });

  it("الأربعة مشتقات المعروفة موجودة بالظبط، بدون تكرار", () => {
    expect(new Set(DOWNSTREAM_OF_BRAIN).size).toBe(DOWNSTREAM_OF_BRAIN.length);
    expect([...DOWNSTREAM_OF_BRAIN].sort()).toEqual(
      ["client_presentation", "developer_handoff", "prd", "prototype_prompt"].sort()
    );
  });
});
