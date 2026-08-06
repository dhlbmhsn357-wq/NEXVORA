import { describe, expect, it } from "vitest";
import { MetaCloudWhatsAppProvider } from "./meta-cloud";

describe("MetaCloudWhatsAppProvider.parseWebhook", () => {
  const p = new MetaCloudWhatsAppProvider();

  it("يستخرج أحداث الحالة من جسم Meta الأصلي", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.abc", status: "delivered", timestamp: "1700000000" },
                  { id: "wamid.xyz", status: "read", timestamp: "1700000100" },
                ],
              },
            },
          ],
        },
      ],
    };
    const events = p.parseWebhook(payload);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      provider: "meta_cloud",
      provider_message_id: "wamid.abc",
      status: "delivered",
    });
    expect(events[1].status).toBe("read");
  });

  it("يرجّع مصفوفة فارغة لجسم غير صالح", () => {
    expect(p.parseWebhook(null)).toEqual([]);
    expect(p.parseWebhook({})).toEqual([]);
    expect(p.parseWebhook({ entry: "wrong" })).toEqual([]);
  });

  it("يتجاهل الحالات غير المدعومة", () => {
    const events = p.parseWebhook({
      entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "queued" }] } }] }],
    });
    expect(events).toEqual([]);
  });

  it("يستخرج تفاصيل الخطأ عند failed", () => {
    const events = p.parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.fail",
                    status: "failed",
                    timestamp: "1700000000",
                    errors: [{ code: 131047, title: "Re-engagement message" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0].status).toBe("failed");
    expect(events[0].error_code).toBe("131047");
    expect(events[0].error_message).toBe("Re-engagement message");
  });
});
