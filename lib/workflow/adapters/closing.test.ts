import { describe, expect, it } from "vitest";
import { adaptOrganizationalIntelligenceStage, adaptSupportStage } from "./closing";

describe("adaptOrganizationalIntelligenceStage", () => {
  it("مفيش تحليل خالص → not_started", () => {
    expect(adaptOrganizationalIntelligenceStage(null).status).toBe("not_started");
  });
  it("status=generating → waiting_ai", () => {
    expect(adaptOrganizationalIntelligenceStage({ status: "generating" }).status).toBe("waiting_ai");
  });
});

describe("adaptSupportStage", () => {
  it("مفيش widget_key → not_started", () => {
    expect(adaptSupportStage(null, 0).status).toBe("not_started");
  });
  it("widget مفعّل ومفيش طلبات مفتوحة → completed", () => {
    expect(adaptSupportStage("wk_123", 0).status).toBe("completed");
  });
  it("widget مفعّل وفيه طلبات مفتوحة → in_progress", () => {
    expect(adaptSupportStage("wk_123", 2).status).toBe("in_progress");
  });
});
