import { describe, expect, it } from "vitest";
import { parseRepoUrl } from "./client";

describe("parseRepoUrl", () => {
  it("parses a standard https URL", () => {
    expect(parseRepoUrl("https://github.com/velora/pm-os")).toEqual({
      owner: "velora",
      repo: "pm-os",
    });
  });

  it("parses a URL with a trailing .git", () => {
    expect(parseRepoUrl("https://github.com/velora/pm-os.git")).toEqual({
      owner: "velora",
      repo: "pm-os",
    });
  });

  it("parses an SSH-style URL", () => {
    expect(parseRepoUrl("git@github.com:velora/pm-os.git")).toEqual({
      owner: "velora",
      repo: "pm-os",
    });
  });

  it("parses a URL with extra path segments (tree/branch)", () => {
    expect(parseRepoUrl("https://github.com/velora/pm-os/tree/main")).toEqual({
      owner: "velora",
      repo: "pm-os",
    });
  });

  it("returns null for a non-GitHub URL", () => {
    expect(parseRepoUrl("https://gitlab.com/velora/pm-os")).toBeNull();
  });

  it("returns null for a malformed input", () => {
    expect(parseRepoUrl("not a url")).toBeNull();
  });
});
