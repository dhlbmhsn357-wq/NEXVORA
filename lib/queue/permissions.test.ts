import { describe, it, expect } from "vitest";
import { canControlJob, canEnqueue, canViewQueueDashboard, type EnqueueActor } from "./permissions";

const actor = (role: EnqueueActor["role"], status: EnqueueActor["status"] = "active"): EnqueueActor => ({
  userId: "u1",
  role,
  status,
});

describe("صلاحية الإدراج — حالة الحساب", () => {
  it("الحساب غير النشط ممنوع مهما كان دوره", () => {
    for (const status of ["locked", "suspended", "inactive", "pending", "deleted"] as const) {
      const result = canEnqueue({ actor: actor("owner", status) });
      expect(result.allowed).toBe(false);
    }
  });

  it("الحساب النشط بلا قيود مسموح", () => {
    expect(canEnqueue({ actor: actor("member") }).allowed).toBe(true);
  });
});

describe("صلاحية الإدراج — الدور", () => {
  it("الدور الأقل من المطلوب مرفوض", () => {
    const result = canEnqueue({ actor: actor("member"), allowedRoles: ["admin"] });
    expect(result.allowed).toBe(false);
  });

  it("الفحص هرمي — الأعلى يمرّ تلقائيًا", () => {
    // ده اللي بيخلّي إضافة دور جديد ماتكسرش أي فحص قديم.
    expect(canEnqueue({ actor: actor("owner"), allowedRoles: ["member"] }).allowed).toBe(true);
    expect(canEnqueue({ actor: actor("admin"), allowedRoles: ["supervisor"] }).allowed).toBe(true);
  });

  it("مصفوفة أدوار فارغة لا تقيّد", () => {
    expect(canEnqueue({ actor: actor("member"), allowedRoles: [] }).allowed).toBe(true);
  });
});

describe("صلاحية الإدراج — العضوية في المشروع", () => {
  it("العضو مسموح", () => {
    const result = canEnqueue({
      actor: actor("member"),
      requiresProjectMembership: true,
      projectId: "p1",
      projectMemberIds: ["u1", "u2"],
    });
    expect(result.allowed).toBe(true);
  });

  it("غير العضو مرفوض", () => {
    const result = canEnqueue({
      actor: actor("member"),
      requiresProjectMembership: true,
      projectId: "p1",
      projectMemberIds: ["u2", "u3"],
    });
    expect(result.allowed).toBe(false);
  });

  it("مالك المشروع مسموح حتى لو مش في قائمة الأعضاء", () => {
    const result = canEnqueue({
      actor: actor("member"),
      requiresProjectMembership: true,
      projectId: "p1",
      projectMemberIds: [],
      projectOwnerId: "u1",
    });
    expect(result.allowed).toBe(true);
  });

  it("المسؤول يعبر العضوية", () => {
    // مش ثغرة: من غير كده تتعذّر الإدارة على مشاريع لم ينضمّ إليها،
    // وده عرقلة تشغيلية لا عزل أمني.
    const result = canEnqueue({
      actor: actor("admin"),
      requiresProjectMembership: true,
      projectId: "p1",
      projectMemberIds: [],
    });
    expect(result.allowed).toBe(true);
  });

  it("العضوية المطلوبة بلا مشروع مرفوضة", () => {
    const result = canEnqueue({ actor: actor("member"), requiresProjectMembership: true });
    expect(result.allowed).toBe(false);
  });
});

describe("التحكّم في مهمة قائمة", () => {
  it("صاحب المهمة يتحكّم فيها", () => {
    expect(canControlJob({ actor: actor("member"), jobCreatedBy: "u1" }).allowed).toBe(true);
  });

  it("زميل في نفس المشروع لا يلغي مهمة غيره", () => {
    // الإلغاء بيرمي عملًا قد يكون مدفوع الثمن — فالصلاحية أضيق من الإدراج.
    expect(canControlJob({ actor: actor("member"), jobCreatedBy: "u2" }).allowed).toBe(false);
  });

  it("المسؤول يتحكّم في أي مهمة", () => {
    expect(canControlJob({ actor: actor("admin"), jobCreatedBy: "u2" }).allowed).toBe(true);
  });

  it("الحساب غير النشط ممنوع", () => {
    expect(canControlJob({ actor: actor("owner", "locked"), jobCreatedBy: "u1" }).allowed).toBe(
      false
    );
  });
});

describe("لوحة الطوابير", () => {
  it("متاحة للمسؤولين فقط", () => {
    expect(canViewQueueDashboard(actor("owner")).allowed).toBe(true);
    expect(canViewQueueDashboard(actor("admin")).allowed).toBe(true);
    expect(canViewQueueDashboard(actor("supervisor")).allowed).toBe(false);
    expect(canViewQueueDashboard(actor("member")).allowed).toBe(false);
  });

  it("كل رفض بيحمل سببًا", () => {
    const result = canViewQueueDashboard(actor("member"));
    if (!result.allowed) expect(result.reason.length).toBeGreaterThan(5);
  });
});
