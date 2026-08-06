import { describe, expect, it } from "vitest";
import { labelForSearchResult } from "./search-labels";

describe("labelForSearchResult", () => {
  it("يترجم اسم الجدول لتصنيف عربي معروف", () => {
    expect(labelForSearchResult({ source_table: "meeting_decisions", id: "1", meeting_id: "m1", text: "x", rank: 0.5 })).toBe("قرار");
    expect(labelForSearchResult({ source_table: "meeting_attachments", id: "1", meeting_id: "m1", text: "x", rank: 0.5 })).toBe("مرفق");
  });

  it("جدول غير معروف يرجّع اسمه الخام بدل ما يكسر", () => {
    expect(labelForSearchResult({ source_table: "something_new", id: "1", meeting_id: "m1", text: "x", rank: 0.5 })).toBe("something_new");
  });
});
