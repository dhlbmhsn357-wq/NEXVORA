import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  let changeRequest: unknown = null;
  let link: unknown = null;
  const insertedRows: Record<string, unknown>[] = [];

  return {
    setChangeRequest: (cr: unknown) => {
      changeRequest = cr;
    },
    getChangeRequest: () => changeRequest,
    setLink: (l: unknown) => {
      link = l;
    },
    getLink: () => link,
    insertedRows,
  };
});

vi.mock("./change-request-service", () => ({
  getChangeRequest: vi.fn(async () => state.getChangeRequest()),
}));

vi.mock("./service", () => ({
  getProjectStandardLink: vi.fn(async () => state.getLink()),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "standard_learning_signals") {
        return {
          insert: (row: Record<string, unknown>) => {
            state.insertedRows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`جدول غير متوقّع: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "standard_learning_signals") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ data: state.insertedRows.map((r, i) => ({ id: `sig-${i}`, recorded_at: "2026-01-01T00:00:00.000Z", ...r })), error: null }),
            }),
          }),
        };
      }
      throw new Error(`جدول غير متوقّع: ${table}`);
    },
  }),
}));

import { recordLearningSignal, listLearningSignalsForStandard } from "./learning-signals-service";
import { getProjectStandardLink } from "./service";

const changeRequest = {
  id: "cr-1",
  projectId: "p1",
  type: "modify" as const,
  title: "تعديل سعر الحجز",
  description: "",
  sourceType: null,
  sourceId: null,
  status: "applied" as const,
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const impact = {
  id: "impact-1",
  changeRequestId: "cr-1",
  artifactType: "requirement",
  artifactId: "req-1",
  artifactLabel: "REQ-1",
  impactType: "modify" as const,
  reason: "سبب",
  proposedChange: {},
  dependencies: [],
  missingInformation: "",
  status: "applied" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const standardLink = {
  id: "link-1",
  clientProjectId: "p1",
  standardProjectId: "standard-1",
  standardVersionSnapshot: "1.0",
  clonedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "u1",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.insertedRows.length = 0;
  state.setChangeRequest({ ...changeRequest });
  state.setLink(null);
});

describe("recordLearningSignal — يحلّ standard_project_id عبر project_standard_links", () => {
  it("يسجّل صف بـ standard_project_id الصحيح لمّا في ربط Standard", async () => {
    state.setLink({ ...standardLink });

    await recordLearningSignal("cr-1", impact);

    expect(getProjectStandardLink).toHaveBeenCalledWith("p1");
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0]).toMatchObject({
      standard_project_id: "standard-1",
      client_project_id: "p1",
      change_request_id: "cr-1",
      change_type: "modify",
      artifact_type: "requirement",
      impact_type: "modify",
      title: "تعديل سعر الحجز",
    });
  });
});

describe("recordLearningSignal — يتصرّف بأمان بدون ربط Standard", () => {
  it("مفيش ربط Standard للمشروع: يتخطّى بصمت بدون throw وبدون insert", async () => {
    state.setLink(null);

    await expect(recordLearningSignal("cr-1", impact)).resolves.toBeUndefined();
    expect(state.insertedRows).toHaveLength(0);
  });

  it("طلب التغيير نفسه مش موجود: يتخطّى بصمت بدون throw", async () => {
    state.setChangeRequest(null);

    await expect(recordLearningSignal("cr-missing", impact)).resolves.toBeUndefined();
    expect(state.insertedRows).toHaveLength(0);
  });
});

describe("listLearningSignalsForStandard", () => {
  it("يرجّع الإشارات المسجَّلة", async () => {
    state.setLink({ ...standardLink });
    await recordLearningSignal("cr-1", impact);

    const list = await listLearningSignalsForStandard("standard-1");
    expect(list).toHaveLength(1);
    expect(list[0].standardProjectId).toBe("standard-1");
  });
});
