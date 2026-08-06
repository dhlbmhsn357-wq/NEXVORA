import { describe, it, expect } from "vitest";
import {
  isProtectedOwnerRole,
  isForbiddenOwnerStatusChange,
  shouldLockUser,
} from "./owner-protection";

describe("owner-protection (pure)", () => {
  it("recognizes owner as protected role", () => {
    expect(isProtectedOwnerRole("owner")).toBe(true);
    expect(isProtectedOwnerRole("admin")).toBe(false);
    expect(isProtectedOwnerRole("supervisor")).toBe(false);
    expect(isProtectedOwnerRole("member")).toBe(false);
    expect(isProtectedOwnerRole(null)).toBe(false);
    expect(isProtectedOwnerRole(undefined)).toBe(false);
  });

  it("forbids any non-active status change for owner", () => {
    expect(isForbiddenOwnerStatusChange("owner", "locked")).toBe(true);
    expect(isForbiddenOwnerStatusChange("owner", "inactive")).toBe(true);
    expect(isForbiddenOwnerStatusChange("owner", "suspended")).toBe(true);
    expect(isForbiddenOwnerStatusChange("owner", "pending")).toBe(true);
    // active is always allowed for owner
    expect(isForbiddenOwnerStatusChange("owner", "active")).toBe(false);
  });

  it("allows non-active status changes for non-owners", () => {
    expect(isForbiddenOwnerStatusChange("admin", "locked")).toBe(false);
    expect(isForbiddenOwnerStatusChange("member", "suspended")).toBe(false);
  });

  it("never locks an owner even when the lock decision is true", () => {
    expect(shouldLockUser("owner", true)).toBe(false);
    expect(shouldLockUser("owner", false)).toBe(false);
  });

  it("locks non-owners only when the lock decision is true", () => {
    expect(shouldLockUser("admin", true)).toBe(true);
    expect(shouldLockUser("admin", false)).toBe(false);
    expect(shouldLockUser("member", true)).toBe(true);
  });
});
