import { describe, it, expect } from "vitest";
import {
  canCreateAnnouncement,
  canCreateConversation,
  canModerateProjectDiscussion,
  canEditMessage,
  canPinMessage,
} from "./permissions";
import { parseMentions, handleFromEmail } from "./mentions";
import { renderSafeMarkdown, toPlainPreview } from "./safe-markdown";
import { isAllowedChatMime } from "@/lib/storage/chat-attachments";

describe("collaboration permissions (hierarchical, no hardcoded checks)", () => {
  it("الإعلانات: admin فأعلى فقط", () => {
    expect(canCreateAnnouncement("owner")).toBe(true);
    expect(canCreateAnnouncement("admin")).toBe(true);
    expect(canCreateAnnouncement("supervisor")).toBe(false);
    expect(canCreateAnnouncement("member")).toBe(false);
  });

  it("إنشاء المحادثات حسب النوع", () => {
    expect(canCreateConversation("member", "direct")).toBe(true);
    expect(canCreateConversation("member", "project")).toBe(false);
    expect(canCreateConversation("supervisor", "project")).toBe(true);
    expect(canCreateConversation("supervisor", "department")).toBe(false);
    expect(canCreateConversation("admin", "department")).toBe(true);
    expect(canCreateConversation("admin", "announcement")).toBe(true);
  });

  it("الإشراف على المناقشات: supervisor فأعلى", () => {
    expect(canModerateProjectDiscussion("supervisor")).toBe(true);
    expect(canModerateProjectDiscussion("member")).toBe(false);
    expect(canPinMessage("supervisor")).toBe(true);
    expect(canPinMessage("member")).toBe(false);
  });

  it("تعديل الرسالة: صاحبها دايمًا، أو مشرف فأعلى", () => {
    expect(canEditMessage("member", "u1", "u1")).toBe(true); // صاحبها
    expect(canEditMessage("member", "u1", "u2")).toBe(false); // مش صاحبها ولا مشرف
    expect(canEditMessage("supervisor", "u1", "u2")).toBe(true); // مشرف
  });
});

describe("mention parsing", () => {
  it("يميّز المجموعات عن المستخدمين", () => {
    const parsed = parseMentions("مرحبا @ahmed و @admins و @projectteam");
    expect(parsed).toContainEqual({ type: "user", handle: "ahmed" });
    expect(parsed).toContainEqual({ type: "admins", handle: null });
    expect(parsed).toContainEqual({ type: "project_team", handle: null });
  });

  it("يزيل التكرار", () => {
    expect(parseMentions("@ali @ali @ali")).toHaveLength(1);
  });

  it("handleFromEmail يرجّع الجزء قبل @", () => {
    expect(handleFromEmail("Ahmed.Ali@velora.com")).toBe("ahmed.ali");
    expect(handleFromEmail(null)).toBe(null);
  });
});

describe("safe markdown (XSS-safe)", () => {
  it("يهرّب وسوم HTML بالكامل", () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("يطبّق العريض والكود السطري", () => {
    expect(renderSafeMarkdown("**قوي**")).toContain("<strong>قوي</strong>");
    expect(renderSafeMarkdown("`code`")).toContain('<code class="v-md-code">code</code>');
  });

  it("كتل الكود ```", () => {
    expect(renderSafeMarkdown("```\nx=1\n```")).toContain("<pre");
  });

  it("الروابط تبقى http(s) فقط وبـ rel آمن", () => {
    const html = renderSafeMarkdown("شوف https://velora.com");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    // محاولة javascript: مش بتتحوّل لرابط
    expect(renderSafeMarkdown("javascript:alert(1)")).not.toContain("<a ");
  });

  it("toPlainPreview يشيل التنسيق ويقصّ", () => {
    expect(toPlainPreview("**نص** `code`")).toBe("نص code");
    expect(toPlainPreview("a".repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe("chat attachment MIME allowlist", () => {
  it("يسمح بالصور والمستندات ويرفض غير المعروف", () => {
    expect(isAllowedChatMime("image/png")).toBe(true);
    expect(isAllowedChatMime("application/pdf")).toBe(true);
    expect(isAllowedChatMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(isAllowedChatMime("application/x-msdownload")).toBe(false);
  });
});
