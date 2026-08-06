import { describe, expect, it } from "vitest";
import { KNOWLEDGE_ACTIONS, allowedActions, can, visibleTo } from "./permissions";
import type { KnowledgeObject } from "./model";

type Target = Pick<KnowledgeObject, "ownerId" | "visibility" | "createdBy">;

function target(patch: Partial<Target> = {}): Target {
  return { ownerId: null, createdBy: null, visibility: "project", ...patch };
}

const MEMBER = { role: "member" as const, profileId: "u-member" };
const SUPERVISOR = { role: "supervisor" as const, profileId: "u-supervisor" };
const ADMIN = { role: "admin" as const, profileId: "u-admin" };
const OWNER = { role: "owner" as const, profileId: "u-owner" };

describe("الرتب والإجراءات", () => {
  it("المنفّذ يقرأ ويضيف ويصدّر", () => {
    expect(can("read", MEMBER).allowed).toBe(true);
    expect(can("create", MEMBER).allowed).toBe(true);
    expect(can("export", MEMBER).allowed).toBe(true);
  });

  // منع المنفّذ من الإضافة كان هيحوّل المركز لمخزن يملأه المديرون.
  it("المنفّذ مايراجعش ومايحذفش ومايرجّعش", () => {
    expect(can("review", MEMBER).allowed).toBe(false);
    expect(can("delete", MEMBER).allowed).toBe(false);
    expect(can("rollback", MEMBER).allowed).toBe(false);
  });

  it("المشرف يراجع لكن مايحذفش", () => {
    expect(can("review", SUPERVISOR).allowed).toBe(true);
    expect(can("delete", SUPERVISOR).allowed).toBe(false);
  });

  it("المسؤول يحذف ويرجّع", () => {
    expect(can("delete", ADMIN).allowed).toBe(true);
    expect(can("rollback", ADMIN).allowed).toBe(true);
  });

  it("إدارة الصلاحيات لمسؤول النظام وحده", () => {
    expect(can("manage_permissions", ADMIN).allowed).toBe(false);
    expect(can("manage_permissions", OWNER).allowed).toBe(true);
  });

  it("مسؤول النظام يقدر على كل شيء", () => {
    expect(allowedActions(OWNER).sort()).toEqual([...KNOWLEDGE_ACTIONS].sort());
  });
});

describe("ملكية الكائن", () => {
  // منع صاحب المعرفة من تعديل إضافته كان بيخلّي كل غلطة تحتاج مسؤولًا.
  it("صاحب المعرفة يعدّلها ويحذفها مهما كانت رتبته", () => {
    const mine = target({ createdBy: "u-member" });
    expect(can("update", MEMBER, mine).allowed).toBe(true);
    expect(can("delete", MEMBER, mine).allowed).toBe(true);
  });

  it("المنفّذ مايحذفش معرفة حد تاني", () => {
    const theirs = target({ createdBy: "u-other" });
    expect(can("delete", MEMBER, theirs).allowed).toBe(false);
  });
});

describe("المعرفة الخاصة", () => {
  const priv = target({ visibility: "private", ownerId: "u-other" });

  it("محجوبة عن غير صاحبها حتى لو رتبته أعلى", () => {
    expect(can("read", ADMIN, priv).allowed).toBe(false);
    expect(can("read", SUPERVISOR, priv).allowed).toBe(false);
  });

  it("صاحبها يقراها", () => {
    expect(can("read", { role: "member", profileId: "u-other" }, priv).allowed).toBe(true);
  });

  // حجب البيانات عن مسؤول النظام كان بيمنع التدقيق — وهو مسؤول الحوكمة.
  it("مسؤول النظام يقراها للتدقيق", () => {
    expect(can("read", OWNER, priv).allowed).toBe(true);
  });
});

describe("المنح الصريح", () => {
  it("المنح يغلب الرتبة", () => {
    const withGrant = { ...MEMBER, grants: ["delete" as const] };
    expect(can("delete", withGrant).allowed).toBe(true);
  });

  it("المنح لإجراء واحد مايفتحش الباقي", () => {
    const withGrant = { ...MEMBER, grants: ["delete" as const] };
    expect(can("rollback", withGrant).allowed).toBe(false);
  });
});

describe("تصفية ما يُعرض", () => {
  it("يشيل الخاصة اللي مش بتاعتك ويسيب الباقي", () => {
    const objects = [
      target({ visibility: "project" }),
      target({ visibility: "private", ownerId: "u-other" }),
      target({ visibility: "private", ownerId: "u-member" }),
    ];

    expect(visibleTo(objects, MEMBER)).toHaveLength(2);
  });

  it("قائمة فاضية تعطي قائمة فاضية", () => {
    expect(visibleTo([], MEMBER)).toEqual([]);
  });
});
