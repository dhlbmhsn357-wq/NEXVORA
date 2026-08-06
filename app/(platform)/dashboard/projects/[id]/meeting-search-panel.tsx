"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import { searchMeetingKnowledgeAction } from "./meeting-search-actions";
import { labelForSearchResult } from "@/lib/meetings/search-labels";
import type { MeetingKnowledgeSearchResult } from "@/lib/types/database";

/**
 * بحث نصي كامل (Full-Text Search) عبر كل معرفة الاجتماعات — قرارات/
 * متطلبات/مخاطر/أسئلة/مهام/عناصر/مرفقات في مشروع واحد. بنية جديدة
 * بالكامل (tsvector) — مفيش أي آلية بحث موجودة قبل كده في المشروع.
 */
export default function MeetingSearchPanel({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MeetingKnowledgeSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startAction] = useTransition();

  function handleSearch() {
    setError(null);
    startAction(async () => {
      const result = await searchMeetingKnowledgeAction(projectId, query);
      if (!result.ok) {
        setError(result.message);
        setResults(null);
        return;
      }
      setResults(result.results);
    });
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <Search size={16} className="text-[var(--v-primary)]" /> بحث في معرفة الاجتماعات
      </p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="ابحث عن قرار، متطلب، خطر، سؤال، أو كلمة مفتاحية…"
          className="flex-1"
        />
      </div>
      {error && <p className="mt-2 text-xs text-[var(--v-danger)]">{error}</p>}

      {isPending && <p className="mt-3 text-xs text-[var(--v-text-muted)]">جاري البحث…</p>}

      {!isPending && results !== null && (
        results.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="لا توجد نتائج" description="جرّب كلمات مفتاحية مختلفة." />
          </div>
        ) : (
          <div className="mt-3 space-y-1.5">
            {results.map((r) => (
              <div key={`${r.source_table}-${r.id}`} className="flex items-start gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm">
                <Badge tone="neutral">{labelForSearchResult(r)}</Badge>
                <span className="text-[var(--v-text)]">{r.text}</span>
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  );
}
