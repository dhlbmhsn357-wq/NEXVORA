"use client";

import { useState } from "react";
import { Network, ChevronDown, ChevronUp } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { KNOWLEDGE_SOURCE_LABELS } from "@/lib/brain-v2/knowledge-sources";
import { BRAIN_SECTION_LABELS, type BrainSectionKey } from "@/lib/brain-v2/types";
import type { BrainKnowledgeGraphEdge, BrainKnowledgeSourceType } from "@/lib/types/database";

function labelFor(type: string): string {
  if (type in KNOWLEDGE_SOURCE_LABELS) return KNOWLEDGE_SOURCE_LABELS[type as BrainKnowledgeSourceType];
  if (type in BRAIN_SECTION_LABELS) return BRAIN_SECTION_LABELS[type as BrainSectionKey];
  return type;
}

/**
 * Knowledge Graph خفيف — علاقات حقيقية (مصدر → عنصر Brain) فوق IDs
 * موجودة أصلًا (اجتماعات/ملاحظات/Prototype Review/طلبات دعم)، مش
 * قاعدة Graph منفصلة. بيتسجّل تلقائيًا كل ما PM يعتمد معرفة جديدة.
 */
export default function KnowledgeGraphViewer({ edges }: { edges: BrainKnowledgeGraphEdge[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card padding="md">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-start">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Network size={16} className="text-[var(--v-primary)]" /> خريطة المعرفة (Knowledge Graph) — {edges.length} علاقة
        </span>
        {open ? <ChevronUp size={15} className="text-[var(--v-text-muted)]" /> : <ChevronDown size={15} className="text-[var(--v-text-muted)]" />}
      </button>

      {open && (
        <div className="mt-3">
          {edges.length === 0 ? (
            <EmptyState title="لا توجد علاقات مسجّلة بعد" description="بتتسجّل تلقائيًا كل ما تعتمد معرفة جديدة من أي مصدر." />
          ) : (
            <div className="space-y-1.5">
              {edges.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-1.5 rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2.5 py-1.5 text-xs">
                  <Badge tone="neutral">{labelFor(e.from_type)}</Badge>
                  <span className="text-[var(--v-text-muted)]">→ أنتج →</span>
                  <Badge tone="primary">{labelFor(e.to_type)}</Badge>
                  <span className="ms-auto text-[10px] text-[var(--v-text-subtle)]">{new Date(e.created_at).toLocaleDateString("ar-EG")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
