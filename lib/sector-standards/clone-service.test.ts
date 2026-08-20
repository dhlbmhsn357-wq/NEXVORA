import { describe, it, expect, vi, beforeEach } from "vitest";

// نحيّد server-only + ensureProjectWorkspace (تهيئة مساحة عمل — best-effort،
// خارج نطاق اختبار منطق الاستنساخ نفسه).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/portfolio/service", () => ({ ensureProjectWorkspace: vi.fn(async () => {}) }));

// ---------------------------------------------------------------------------
// حالة قاعدة بيانات وهمية بسيطة — جدولان فقط لازمين مباشرة من clone-service:
// projects (fetch source + insert new) و project_standard_links + prd.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const state: {
  projects: Map<string, Row>;
  links: Row[];
  prd: Map<string, Row>; // keyed by project_id
  nextId: number;
} = { projects: new Map(), links: [], prd: new Map(), nextId: 1 };

function freshId(prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

function resetState() {
  state.projects = new Map();
  state.links = [];
  state.prd = new Map();
  state.nextId = 1;
}

// service client وهمي بيغطي بس اللي clone-service بيستخدمه مباشرة: projects/project_standard_links/prd
function makeServiceClient() {
  return {
    from(table: string) {
      if (table === "projects") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  async maybeSingle() {
                    return { data: state.projects.get(id) ?? null, error: null };
                  },
                };
              },
            };
          },
          insert(row: Row) {
            return {
              select() {
                return {
                  async single() {
                    const id = freshId("proj");
                    const full = { id, ...row };
                    state.projects.set(id, full);
                    return { data: { id }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "project_standard_links") {
        return {
          insert(row: Row) {
            state.links.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "prd") {
        return {
          select() {
            return {
              eq(_col: string, projectId: string) {
                return {
                  async maybeSingle() {
                    return { data: state.prd.get(projectId) ?? null, error: null };
                  },
                };
              },
            };
          },
          insert(row: Row) {
            state.prd.set(row.project_id as string, row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`جدول غير متوقّع في اختبار clone-service: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => makeServiceClient() }));

// ---------------------------------------------------------------------------
// نطاقات بيانات المنتج — نموذج مصغّر متقاطع المراجع (persona → story → AC،
// persona → requirement)، بالضبط زي ما مطلوب في المهمة.
// ---------------------------------------------------------------------------
const domainState = {
  personas: [] as Row[],
  flows: [] as Row[],
  requirements: [] as Row[],
  stories: [] as Row[],
  acs: [] as Row[],
  businessRules: [] as Row[],
  systemMessages: [] as Row[],
  stateMachines: [] as Row[],
  scenarios: [] as Row[],
  created: {
    personas: [] as Row[],
    flows: [] as Row[],
    requirements: [] as Row[],
    stories: [] as Row[],
    acs: [] as Row[],
  },
};

function resetDomainState() {
  domainState.personas = [];
  domainState.flows = [];
  domainState.requirements = [];
  domainState.stories = [];
  domainState.acs = [];
  domainState.businessRules = [];
  domainState.systemMessages = [];
  domainState.stateMachines = [];
  domainState.scenarios = [];
  domainState.created = { personas: [], flows: [], requirements: [], stories: [], acs: [] };
}

vi.mock("@/lib/product-definition/service", () => ({
  listPersonas: vi.fn(async () => domainState.personas),
  createPersona: vi.fn(async (_projectId: string, input: Row) => {
    const row = { id: freshId("persona"), ...input };
    domainState.created.personas.push(row);
    return row;
  }),
  listFlows: vi.fn(async () => domainState.flows),
  createFlow: vi.fn(async (_projectId: string, input: Row) => {
    const row = { id: freshId("flow"), ...input };
    domainState.created.flows.push(row);
    return row;
  }),
  listRequirements: vi.fn(async () => domainState.requirements),
  createRequirement: vi.fn(async (_projectId: string, input: Row) => {
    const row = { id: freshId("req"), ...input };
    domainState.created.requirements.push(row);
    return row;
  }),
}));

vi.mock("@/lib/product-definition/business-rules-service", () => ({
  listBusinessRules: vi.fn(async () => domainState.businessRules),
  createBusinessRule: vi.fn(async (_projectId: string, input: Row) => ({ id: freshId("br"), ...input })),
}));

vi.mock("@/lib/product-definition/system-messages-service", () => ({
  listSystemMessages: vi.fn(async () => domainState.systemMessages),
  createSystemMessage: vi.fn(async (_projectId: string, input: Row) => ({ id: freshId("sm"), ...input })),
}));

vi.mock("@/lib/product-definition/state-machine-service", () => ({
  listStateMachines: vi.fn(async () => domainState.stateMachines),
  createStateMachine: vi.fn(async (_projectId: string, input: Row) => ({ id: freshId("stm"), ...input })),
}));

vi.mock("@/lib/user-stories/service", () => ({
  listStories: vi.fn(async () => domainState.stories),
  createStory: vi.fn(async (_projectId: string, input: Row) => {
    const row = { id: freshId("story"), ...input };
    domainState.created.stories.push(row);
    return row;
  }),
  listAcceptanceCriteria: vi.fn(async () => domainState.acs),
  createAc: vi.fn(async (_projectId: string, input: Row) => {
    const row = { id: freshId("ac"), ...input };
    domainState.created.acs.push(row);
    return row;
  }),
}));

vi.mock("@/lib/evaluation/service", () => ({
  listScenarios: vi.fn(async () => domainState.scenarios),
  createScenario: vi.fn(async (_projectId: string, input: Row) => ({ id: freshId("scen"), ...input })),
}));

import { createClientVariant } from "./clone-service";

function seedStandardProject(overrides: Partial<Row> = {}): string {
  const id = freshId("standard");
  state.projects.set(id, {
    id,
    project_type: "saas",
    is_sector_standard: true,
    standard_version: "1.3",
    ...overrides,
  });
  return id;
}

beforeEach(() => {
  resetState();
  resetDomainState();
});

describe("createClientVariant", () => {
  it("يرفض الاستنساخ لو المصدر مش Sector Standard فعلي", async () => {
    const id = freshId("standard");
    state.projects.set(id, { id, project_type: "saas", is_sector_standard: false, standard_version: "1.0" });

    await expect(createClientVariant(id, null, "عميل جديد", "user-1")).rejects.toThrow(/Sector Standard/);
  });

  it("يرفض الاستنساخ لو الـ Standard مالوش رقم إصدار", async () => {
    const id = freshId("standard");
    state.projects.set(id, { id, project_type: "saas", is_sector_standard: true, standard_version: null });

    await expect(createClientVariant(id, null, "عميل جديد", "user-1")).rejects.toThrow(/إصدار/);
  });

  it("يستنسخ standard فاضي (بدون أي بيانات منتج) بدون كراش وبعدّادات صفرية", async () => {
    const standardId = seedStandardProject();
    const outcome = await createClientVariant(standardId, null, "عميل فاضي", "user-1");

    expect(outcome.clientProjectId).toBeTruthy();
    expect(outcome.failed).toEqual([]);
    for (const c of outcome.cloned) {
      expect(c.count).toBe(0);
    }
    // صف المشروع + رابط الاستنساخ اتعملوا برغم عدم وجود أي بيانات منتج.
    expect(state.projects.has(outcome.clientProjectId)).toBe(true);
    expect(state.links).toHaveLength(1);
    expect(state.links[0].standard_version_snapshot).toBe("1.3");
  });

  it("يعيد ربط المراجع المتقاطعة (persona → story → AC، persona → requirement) لمعرّفات جديدة بالكامل", async () => {
    const standardId = seedStandardProject();

    domainState.personas = [{ id: "persona-src-1", name: "طبيب", role: "Doctor", segment: "", jobsToBeDone: "", goals: "", pains: "", channels: [], techSavviness: 50, notes: "", isPrimary: true }];
    domainState.stories = [
      {
        id: "story-src-1", code: "US-1", title: "حجز موعد", asA: "مريض", iWant: "أحجز موعد", soThat: "أشوف الدكتور",
        narrativeExtra: "", status: "approved", storyPoints: 3, businessValue: 80, riskLevel: "low",
        linkedPersonaId: "persona-src-1", linkedFlowId: null, linkedRequirementId: null, tags: [],
      },
    ];
    domainState.acs = [
      {
        id: "ac-src-1", userStoryId: "story-src-1", code: "AC-1", orderIndex: 1, title: "نجاح الحجز",
        givenClause: "لو موعد متاح", whenClause: "يضغط تأكيد", thenClause: "يترسله تأكيد", andConditions: [],
        status: "approved", notes: "",
      },
    ];
    domainState.requirements = [
      {
        id: "req-src-1", code: "REQ-1", title: "نظام حجز", description: "", requirementType: "functional",
        priority: "must", status: "approved", rationale: "", acceptanceHint: "", effortEstimate: "",
        linkedPersonaId: "persona-src-1", linkedFlowId: null, tags: [],
      },
    ];

    const outcome = await createClientVariant(standardId, "client-1", "عيادة الأمل", "user-1");

    expect(outcome.failed).toEqual([]);
    expect(outcome.cloned.find((c) => c.domain === "personas")?.count).toBe(1);
    expect(outcome.cloned.find((c) => c.domain === "user_stories")?.count).toBe(1);
    expect(outcome.cloned.find((c) => c.domain === "acceptance_criteria")?.count).toBe(1);
    expect(outcome.cloned.find((c) => c.domain === "product_requirements")?.count).toBe(1);

    const clonedPersona = domainState.created.personas[0];
    const clonedStory = domainState.created.stories[0];
    const clonedAc = domainState.created.acs[0];
    const clonedReq = domainState.created.requirements[0];

    // المعرّفات الجديدة كلها مختلفة عن المصدر.
    expect(clonedPersona.id).not.toBe("persona-src-1");
    expect(clonedStory.id).not.toBe("story-src-1");
    expect(clonedAc.id).not.toBe("ac-src-1");
    expect(clonedReq.id).not.toBe("req-src-1");

    // القصة المستنسخة بتشاور الـ persona المستنسخة الجديدة، مش القديمة.
    expect(clonedStory.linkedPersonaId).toBe(clonedPersona.id);
    expect(clonedStory.linkedPersonaId).not.toBe("persona-src-1");

    // معيار القبول المستنسخ بيشاور القصة المستنسخة الجديدة.
    expect(clonedAc.userStoryId).toBe(clonedStory.id);
    expect(clonedAc.userStoryId).not.toBe("story-src-1");

    // المتطلب المستنسخ بيشاور الـ persona المستنسخة الجديدة.
    expect(clonedReq.linkedPersonaId).toBe(clonedPersona.id);
    expect(clonedReq.linkedPersonaId).not.toBe("persona-src-1");
  });

  it("مرونة الفشل الجزئي: فشل نطاق واحد ما بيمنعش استنساخ باقي النطاقات، والمشروع يفضل موجود", async () => {
    const standardId = seedStandardProject();

    domainState.personas = [{ id: "p1", name: "شخصية", role: "", segment: "", jobsToBeDone: "", goals: "", pains: "", channels: [], techSavviness: 50, notes: "", isPrimary: false }];
    domainState.businessRules = [{ id: "br1", title: "قاعدة", triggerCondition: "", thresholdValue: "", onViolation: "", enforcementPoint: "server", linkedFlowId: null, linkedPersonaId: null, notes: "" }];

    const { createBusinessRule } = await import("@/lib/product-definition/business-rules-service");
    (createBusinessRule as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("فشل متعمّد في اختبار"));

    const outcome = await createClientVariant(standardId, null, "عميل بفشل جزئي", "user-1");

    expect(state.projects.has(outcome.clientProjectId)).toBe(true); // المشروع لسه موجود
    expect(outcome.cloned.find((c) => c.domain === "personas")?.count).toBe(1); // نطاق تاني نجح
    expect(outcome.failed.find((f) => f.domain === "business_rules")?.error).toMatch(/فشل متعمّد/);
  });

  it("يستنسخ PRD المصدر: النسخة تتصفّر لـ 1، المحتوى مطابق للمصدر", async () => {
    const standardId = seedStandardProject();
    state.prd.set(standardId, {
      project_id: standardId,
      overview: "نظرة عامة على المعيار",
      problem_statement: "المشكلة",
      goals: ["هدف 1"],
      out_of_scope: [],
      target_users: ["مريض"],
      user_stories: [],
      acceptance_criteria: [],
      functional_requirements: [],
      non_functional_requirements: [],
      risks_assumptions: [],
      success_metrics: [],
      business_rules_detail: [],
      system_messages_detail: [],
      flow_specifications: [],
      persona_modules: [],
      state_machines_detail: [],
      version: 7,
      status: "approved",
    });

    const outcome = await createClientVariant(standardId, null, "عميل PRD", "user-1");

    expect(outcome.failed).toEqual([]);
    expect(outcome.cloned.find((c) => c.domain === "prd")?.count).toBe(1);

    const clientPrd = state.prd.get(outcome.clientProjectId);
    expect(clientPrd).toBeTruthy();
    expect(clientPrd?.version).toBe(1);
    expect(clientPrd?.status).toBe("draft");
    expect(clientPrd?.overview).toBe("نظرة عامة على المعيار");
    expect(clientPrd?.goals).toEqual(["هدف 1"]);
  });

  it("يتخطّى استنساخ PRD بنظافة لو الـ Standard مالوش PRD أصلًا (عدّاد صفري، مش فشل)", async () => {
    const standardId = seedStandardProject();
    const outcome = await createClientVariant(standardId, null, "عميل بدون PRD", "user-1");

    expect(outcome.failed.find((f) => f.domain === "prd")).toBeUndefined();
    expect(outcome.cloned.find((c) => c.domain === "prd")?.count).toBe(0);
  });
});
