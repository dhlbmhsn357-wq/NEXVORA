"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { getTodayContactListAction } from "./prospect-actions";
import { STATUS_TONE, PROSPECT_STATUS_LABELS, formatDate } from "./prospect-ui-constants";
import type { ProspectRow } from "@/lib/prospecting/types";
import type { TodayContactList } from "@/lib/prospecting/service";

const SECTIONS: { key: keyof TodayContactList; title: string; note: string }[] = [
  { key: "overdueFollowUp", title: "متابعة متأخرة", note: "تجاوز موعدها المحدد — أولوية قصوى اليوم" },
  { key: "todayFollowUp", title: "متابعة اليوم", note: "موعدها اليوم بالضبط" },
  { key: "interestedNoNextAction", title: "مهتم بلا إجراء قادم", note: "أبدت اهتمامًا ولا يوجد موعد متابعة مجدول" },
  { key: "repliedNoFollowUp", title: "ردّ بلا متابعة مجدولة", note: "ردّ ولا يوجد موعد متابعة مجدول" },
  { key: "readyToContact", title: "جاهز للتواصل", note: "لم يبدأ التواصل بعد" },
];

export default function TodayContactTab({ profileNameById }: { profileNameById: Map<string, string> }) {
  const [data, setData] = useState<TodayContactList | null>(null);

  useEffect(() => {
    let alive = true;
    getTodayContactListAction().then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className="py-6 text-center text-sm text-[var(--v-text-muted)]">جارٍ التحميل…</p>;

  const totalCount = SECTIONS.reduce((sum, s) => sum + data[s.key].length, 0);
  if (totalCount === 0) {
    return <p className="py-6 text-center text-sm text-[var(--v-text-muted)]">لا توجد جهات تحتاج إجراء اليوم.</p>;
  }

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const rows = data[section.key];
        if (rows.length === 0) return null;
        return (
          <div key={section.key}>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">
              {section.title} <span className="text-xs font-normal text-[var(--v-text-muted)]">— {section.note} ({rows.length})</span>
            </p>
            <div className="space-y-2">
              {rows.map((p: ProspectRow) => (
                <Card key={p.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/dashboard/prospects/${p.id}`} className="text-sm font-medium text-[var(--v-text)] hover:text-[var(--v-primary)] hover:underline">
                        {p.organizationName}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">
                        المسؤول: {(p.assignedTo && profileNameById.get(p.assignedTo)) || "غير مسند"} · المتابعة القادمة: {formatDate(p.nextFollowUpAt)}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{PROSPECT_STATUS_LABELS[p.status]}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
