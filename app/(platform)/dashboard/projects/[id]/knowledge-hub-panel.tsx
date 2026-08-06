"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  FileStack,
  Loader2,
  Network,
  Layers,
  BrainCog,
  RotateCw,
  Check,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  advanceKnowledgeEnrichment,
  advanceKnowledgeProcessing,
  createKnowledgeBatch,
  registerKnowledgeSource,
  resolveKnowledgeConflict,
  retryAllKnowledgeFailures,
  retryKnowledgeSource,
  runKnowledgeSynthesis,
  applyKnowledgeProposals,
  rejectKnowledgeProposal,
  startKnowledgeProcessing,
} from "./knowledge-hub-actions";
import { acceptedExtensions, checkFileSize, classifyFile, isReprocessableSource } from "@/lib/knowledge-hub/file-types";
import { KNOWLEDGE_BUCKET } from "@/lib/knowledge-hub/extraction";
import { categoryLabel } from "@/lib/ai/prompts/knowledge-classification";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type {
  KnowledgeBatch,
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeSource,
} from "@/lib/knowledge-hub/service";
import type {
  KnowledgeConflict,
  KnowledgeRelation,
} from "@/lib/knowledge-hub/enrichment-service";
import { RELATION_LABELS, type RelationType } from "@/lib/ai/validation/knowledge-enrichment";
import { OPERATIONAL_LABELS, type OperationalKind } from "@/lib/ai/validation/knowledge-synthesis";
import { SYNTHESIS_TAG, sectionFromTags } from "@/lib/knowledge-hub/synthesis-service";
import { APPLIED_TAG } from "@/lib/knowledge-hub/brain-apply-service";
import {
  computeKnowledgeHealth,
  HEALTH_LEVEL_LABELS,
  type KnowledgeHealth,
} from "@/lib/knowledge-hub/health";
import type { SynthesisSummary } from "@/lib/knowledge-hub/synthesis-service";
import { BRAIN_SECTION_LABELS, type BrainSectionKey } from "@/lib/brain-v2/types";
import { ENRICHED_TAG } from "@/lib/knowledge-hub/enrichment-service";

const POLL_MS = 5000;

const SOURCE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "في الانتظار", tone: "neutral" },
  extracting: { label: "جاري الاستخراج…", tone: "info" },
  classifying: { label: "جاري التصنيف…", tone: "info" },
  enriching: { label: "جاري الإثراء…", tone: "info" },
  ready: { label: "جاهز", tone: "success" },
  failed: { label: "فشل", tone: "danger" },
  skipped_duplicate: { label: "محفوظ بلا تحليل", tone: "warning" },
};

const NEEDED_FROM_LABELS: Record<string, string> = {
  client: "العميل",
  meeting: "اجتماع",
  research: "بحث",
  management: "الإدارة",
  engineering: "الهندسة",
};

/**
 * مركز المعرفة.
 *
 * الرفع بيروح من المتصفح **مباشرةً** لتخزين Supabase، مش عبر Server
 * Action. السبب: دوال Vercel بتحدّ جسم الطلب بحوالي 4.5 ميجابايت،
 * والمرحلة دي غرضها الأساسي مستندات كبيرة. نفس نمط تسجيل الاجتماعات.
 */
export default function KnowledgeHubPanel({
  projectId,
  batches,
  sources,
  items,
  gaps,
  relations,
  conflicts,
}: {
  projectId: string;
  batches: KnowledgeBatch[];
  sources: KnowledgeSource[];
  items: KnowledgeItem[];
  gaps: KnowledgeGap[];
  relations: KnowledgeRelation[];
  conflicts: KnowledgeConflict[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  const pendingCount = sources.filter(
    (s) => s.status === "pending" || s.status === "extracting" || s.status === "classifying"
  ).length;

  const refreshRef = useRef(router.refresh);
  useEffect(() => {
    refreshRef.current = router.refresh;
  }, [router.refresh]);

  // المعالجة بتتدفع خطوة بخطوة من الواجهة طول ما فيه شغل — كل استدعاء
  // بيعالج مصدر واحد (أو دفعة مقاطع منه) فيفضل جوّه حد وقت التنفيذ.
  const advancingRef = useRef(false);
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(async () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      try {
        const result = await advanceKnowledgeProcessing(projectId);
        if (result.status === "failed") {
          setMessages((m) => [result.message, ...m].slice(0, 4));
        }
        refreshRef.current();
      } finally {
        advancingRef.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pendingCount, projectId]);

  const [enriching, setEnriching] = useState(false);

  // الإثراء بيتدفع تصنيفًا تصنيفًا لحد ما يخلص — نفس مبدأ المعالجة:
  // كل استدعاء يفضل جوّه حد وقت التنفيذ الآمن. الحارس بيمنع حلقة لا تنتهي
  // لو حصل خلل والتصنيفات ما اتعلّمتش كمعالَجة.
  const runEnrichment = useCallback(async () => {
    setEnriching(true);
    setMessages([]);
    try {
      for (let guard = 0; guard < 40; guard += 1) {
        const result = await advanceKnowledgeEnrichment(projectId);
        if (result.status === "idle") break;
        if (result.status === "failed") {
          setMessages((m) => [result.message, ...m].slice(0, 4));
          break;
        }
        refreshRef.current();
        if (result.remainingCategories === 0) break;
      }
      refreshRef.current();
    } finally {
      setEnriching(false);
    }
  }, [projectId]);

  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retryOne = useCallback(
    async (sourceId: string) => {
      setRetryingId(sourceId);
      setMessages([]);
      try {
        const result = await retryKnowledgeSource(projectId, sourceId);
        setMessages([result.message]);
        refreshRef.current();
      } finally {
        setRetryingId(null);
      }
    },
    [projectId]
  );

  const retryAll = useCallback(async () => {
    setRetryingId("__all__");
    setMessages([]);
    try {
      const result = await retryAllKnowledgeFailures(projectId);
      setMessages([result.message]);
      refreshRef.current();
    } finally {
      setRetryingId(null);
    }
  }, [projectId]);

  const [applying, setApplying] = useState(false);

  const applyProposals = useCallback(
    async (ids: string[] | null) => {
      setApplying(true);
      setMessages([]);
      try {
        const result = await applyKnowledgeProposals(projectId, ids);
        setMessages([result.message]);
        refreshRef.current();
      } finally {
        setApplying(false);
      }
    },
    [projectId]
  );

  const rejectOne = useCallback(
    async (id: string) => {
      await rejectKnowledgeProposal(projectId, id);
      refreshRef.current();
    },
    [projectId]
  );

  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisSummary, setSynthesisSummary] = useState<SynthesisSummary | null>(null);

  const runSynthesisNow = useCallback(async () => {
    setSynthesizing(true);
    setMessages([]);
    setSynthesisSummary(null);
    try {
      const result = await runKnowledgeSynthesis(projectId);
      if (result.status === "done") setSynthesisSummary(result.summary);
      else setMessages([result.message]);
      refreshRef.current();
    } finally {
      setSynthesizing(false);
    }
  }, [projectId]);

  const handleFiles = useCallback(
    async (files: FileList) => {
      if (files.length === 0) return;
      setUploading(true);
      setMessages([]);
      const notes: string[] = [];

      try {
        const batch = await createKnowledgeBatch(projectId, "");
        if (!batch.ok) {
          setMessages([batch.message]);
          return;
        }

        const supabase = createClient();

        for (const file of Array.from(files)) {
          const info = classifyFile(file.name, file.type);
          const sizeCheck = checkFileSize(file.size, info);
          if (!sizeCheck.ok) {
            notes.push(`${file.name}: ${sizeCheck.message}`);
            continue;
          }

          setUploadNote(`جاري رفع ${file.name}…`);

          const bytes = await file.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const hash = Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          const ext = file.name.includes(".")
            ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
            : "";
          const path = `${projectId}/${hash}${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(KNOWLEDGE_BUCKET)
            .upload(path, file, { upsert: true, contentType: file.type || undefined });

          if (uploadError) {
            notes.push(`${file.name}: تعذّر الرفع — ${uploadError.message}`);
            continue;
          }

          const result = await registerKnowledgeSource({
            projectId,
            batchId: batch.batchId,
            kind: "file",
            title: file.name,
            fileName: file.name,
            mimeType: file.type || null,
            fileSizeBytes: file.size,
            storagePath: path,
            contentHash: hash,
          });

          if (result.status === "duplicate") notes.push(result.message);
          else if (result.status === "unsupported") notes.push(`${file.name}: ${result.message}`);
          else if (result.status === "error") notes.push(`${file.name}: ${result.message}`);
        }

        await startKnowledgeProcessing(projectId);
        setMessages(notes);
        router.refresh();
      } finally {
        setUploading(false);
        setUploadNote(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [projectId, router]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const readyCount = sources.filter((s) => s.status === "ready").length;
  const openGaps = gaps.filter((g) => g.status === "open");
  const openConflicts = conflicts.filter((c) => c.status === "open");
  const unenrichedCount = items.filter((i) => !i.tags?.includes(ENRICHED_TAG)).length;
  // مقترحات التوليف هي العناصر اللي اتولدت من التوليف نفسه — بتتميّز
  // بوسم القسم المستهدف، والباقي معرفة خام من المستندات.
  const proposals = items.filter((i) => sectionFromTags(i.tags) !== null);
  const pendingProposalList = proposals.filter((i) => !i.tags?.includes(APPLIED_TAG));
  const appliedCount = proposals.length - pendingProposalList.length;
  const health = computeKnowledgeHealth({
    totalSources: sources.length,
    readySources: sources.filter((s) => s.status === "ready").length,
    failedSources: sources.filter((s) => s.status === "failed").length,
    totalItems: items.length,
    enrichedItems: items.filter((i) => i.tags?.includes(ENRICHED_TAG)).length,
    openGaps: gaps.filter((g) => g.status === "open").length,
    openConflicts: conflicts.filter((c) => c.status === "open").length,
    appliedProposals: appliedCount,
    totalProposals: proposals.length,
  });
  const readyForSynthesis = items.filter(
    (i) => i.tags?.includes(ENRICHED_TAG) && !i.tags?.includes(SYNTHESIS_TAG)
  ).length;

  return (
    <div className="flex flex-col gap-[var(--v-space-5)]">
      <UploadCenter
        uploading={uploading}
        uploadNote={uploadNote}
        pendingCount={pendingCount}
        inputRef={fileInputRef}
        onFiles={handleFiles}
      />

      {messages.length > 0 ? (
        <ul className="flex flex-col gap-[var(--v-space-2)]">
          {messages.map((msg, i) => (
            <li
              key={i}
              className="flex items-start gap-[var(--v-space-2)] rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] text-[var(--v-amber)]"
            >
              <AlertCircle className="mt-[2px] size-4 shrink-0" />
              <span>{msg}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {sources.length > 0 ? <HealthBar health={health} /> : null}

      {sources.length > 0 ? (
        <div className="grid grid-cols-2 gap-[var(--v-space-3)] sm:grid-cols-4">
          <Stat label="المصادر" value={sources.length} />
          <Stat label="محلَّلة" value={readyCount} />
          <Stat label="عناصر معرفة" value={items.length} />
          <Stat label="فجوات مفتوحة" value={openGaps.length} />
        </div>
      ) : null}

      {items.length > 0 ? (
        <EnrichmentBar
          unenrichedCount={unenrichedCount}
          relationCount={relations.length}
          conflictCount={openConflicts.length}
          enriching={enriching}
          onRun={runEnrichment}
        />
      ) : null}

      {byCategory.length > 0 ? (
        <section>
          <h4 className="mb-[var(--v-space-2)] text-[0.9375rem] font-semibold text-[var(--v-text)]">
            تغطية المعرفة
          </h4>
          <div className="flex flex-wrap gap-[var(--v-space-2)]">
            {byCategory.map(([cat, count]) => (
              <span
                key={cat}
                className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-[var(--v-space-3)] py-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]"
              >
                {categoryLabel(cat)} <span className="font-mono">{count}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <SourcesList
        sources={sources}
        batches={batches}
        retryingId={retryingId}
        onRetry={retryOne}
        onRetryAll={retryAll}
      />

      {items.length > 0 ? (
        <SynthesisBar
          readyCount={readyForSynthesis}
          proposalCount={proposals.length}
          synthesizing={synthesizing}
          summary={synthesisSummary}
          onRun={runSynthesisNow}
        />
      ) : null}

      {proposals.length > 0 ? (
        <ProposalsList
          proposals={pendingProposalList}
          appliedCount={appliedCount}
          applying={applying}
          onApplyAll={() => applyProposals(null)}
          onApplyOne={(id) => applyProposals([id])}
          onReject={rejectOne}
        />
      ) : null}

      {openConflicts.length > 0 ? (
        <ConflictsList projectId={projectId} conflicts={openConflicts} />
      ) : null}

      {relations.length > 0 ? <RelationsList relations={relations} items={items} /> : null}

      {openGaps.length > 0 ? <GapsList gaps={openGaps} /> : null}
    </div>
  );
}

function EnrichmentBar({
  unenrichedCount,
  relationCount,
  conflictCount,
  enriching,
  onRun,
}: {
  unenrichedCount: number;
  relationCount: number;
  conflictCount: number;
  enriching: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[var(--v-space-3)] rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-4)]">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-[var(--v-text)]">الإثراء والربط</p>
        <p className="mt-[var(--v-space-1)] text-[0.875rem] text-[var(--v-text-secondary)]">
          {unenrichedCount > 0
            ? `${unenrichedCount} عنصر لسه ما اتربطش. الإثراء بيدمج المكرّر، ويبني شبكة العلاقات، ويكشف التعارضات، ويوحّد المصطلحات.`
            : `كل العناصر مرتبطة — ${relationCount} علاقة و${conflictCount} تعارض مفتوح.`}
        </p>
      </div>
      <Button onClick={onRun} disabled={enriching || unenrichedCount === 0}>
        {enriching ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            جاري الإثراء…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            {unenrichedCount > 0 ? "ابدأ الإثراء" : "لا يوجد جديد"}
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * مركز التعارضات.
 *
 * الذكاء الاصطناعي بيرصد التعارض بس مابيحسمهوش — الحسم قرار بشري صريح.
 * عرض النصّين جنب بعض مع مصدر كل واحد هو اللي بيخلّي القرار ممكن أصلًا.
 */
function ConflictsList({
  projectId,
  conflicts,
}: {
  projectId: string;
  conflicts: KnowledgeConflict[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function resolve(id: string, status: "resolved_left" | "resolved_right" | "ignored") {
    setBusyId(id);
    try {
      await resolveKnowledgeConflict(projectId, id, status, "");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h4 className="mb-[var(--v-space-2)] flex items-center gap-[var(--v-space-2)] text-[0.9375rem] font-semibold text-[var(--v-text)]">
        <ShieldAlert className="size-4 text-[var(--v-red)]" />
        تعارضات ({conflicts.length})
      </h4>
      <ul className="flex flex-col gap-[var(--v-space-3)]">
        {conflicts.map((conflict) => (
          <li
            key={conflict.id}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/5 p-[var(--v-space-3)]"
          >
            <Badge
              tone={
                conflict.severity === "high"
                  ? "danger"
                  : conflict.severity === "low"
                    ? "neutral"
                    : "warning"
              }
            >
              {conflict.severity === "high"
                ? "شدّة عالية"
                : conflict.severity === "low"
                  ? "شدّة منخفضة"
                  : "شدّة متوسطة"}
            </Badge>

            <p className="mt-[var(--v-space-2)] text-[0.875rem] text-[var(--v-text)]">
              {conflict.description}
            </p>

            <div className="mt-[var(--v-space-3)] grid gap-[var(--v-space-2)] sm:grid-cols-2">
              <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-[var(--v-space-2)]">
                <p className="text-[0.75rem] text-[var(--v-text-subtle)]">{conflict.left_label}</p>
                <p className="mt-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]">
                  {conflict.left_statement}
                </p>
              </div>
              <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-[var(--v-space-2)]">
                <p className="text-[0.75rem] text-[var(--v-text-subtle)]">{conflict.right_label}</p>
                <p className="mt-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]">
                  {conflict.right_statement}
                </p>
              </div>
            </div>

            <div className="mt-[var(--v-space-3)] flex flex-wrap gap-[var(--v-space-2)]">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === conflict.id}
                onClick={() => resolve(conflict.id, "resolved_left")}
              >
                الأول هو الصحيح
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === conflict.id}
                onClick={() => resolve(conflict.id, "resolved_right")}
              >
                الثاني هو الصحيح
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === conflict.id}
                onClick={() => resolve(conflict.id, "ignored")}
              >
                ليس تعارضًا
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelationsList({
  relations,
  items,
}: {
  relations: KnowledgeRelation[];
  items: KnowledgeItem[];
}) {
  const titleById = new Map(items.map((i) => [i.id, i.title]));
  const shown = relations.slice(0, 40);

  return (
    <section>
      <h4 className="mb-[var(--v-space-2)] flex items-center gap-[var(--v-space-2)] text-[0.9375rem] font-semibold text-[var(--v-text)]">
        <Network className="size-4 text-[var(--v-primary)]" />
        شبكة المعرفة ({relations.length} علاقة)
      </h4>
      <ul className="flex flex-col gap-[var(--v-space-2)]">
        {shown.map((rel) => (
          <li
            key={rel.id}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-[var(--v-space-3)] py-[var(--v-space-2)]"
          >
            <div className="flex flex-wrap items-center gap-[var(--v-space-2)] text-[0.875rem]">
              <span className="text-[var(--v-text)]">
                {titleById.get(rel.from_item_id) ?? "عنصر مدموج"}
              </span>
              <Badge tone={rel.relation_type === "contradicts" ? "danger" : "info"}>
                {RELATION_LABELS[rel.relation_type as RelationType] ?? rel.relation_type}
              </Badge>
              <span className="text-[var(--v-text)]">
                {titleById.get(rel.to_item_id) ?? "عنصر مدموج"}
              </span>
            </div>
            {rel.rationale ? (
              <p className="mt-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]">
                {rel.rationale}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {relations.length > shown.length ? (
        <p className="mt-[var(--v-space-2)] text-[0.8125rem] text-[var(--v-text-subtle)]">
          معروض {shown.length} من {relations.length} علاقة.
        </p>
      ) : null}
    </section>
  );
}


function UploadCenter({
  uploading,
  uploadNote,
  pendingCount,
  inputRef,
  onFiles,
}: {
  uploading: boolean;
  uploadNote: string | null;
  pendingCount: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center gap-[var(--v-space-3)] rounded-[var(--v-radius-lg)] border-2 border-dashed p-[var(--v-space-6)] text-center transition-colors ${
        dragging
          ? "border-[var(--v-primary)] bg-[var(--v-primary)]/5"
          : "border-[var(--v-border)] bg-[var(--v-surface)]"
      }`}
    >
      <BrainCircuit className="size-8 text-[var(--v-primary)]" />
      <div>
        <p className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
          اسحب الملفات هنا أو اخترها
        </p>
        <p className="mt-[var(--v-space-1)] text-[0.875rem] text-[var(--v-text-secondary)]">
          سياسات، إجراءات تشغيل، أدلة، دراسات، مخططات، عقود، أبحاث الفريق — كل مستند بيتحوّل
          لمعرفة مصنّفة ومرتبطة بمصدرها.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedExtensions().join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
        }}
      />

      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {uploadNote ?? "جاري الرفع…"}
          </>
        ) : (
          <>
            <Upload className="size-4" />
            اختر الملفات
          </>
        )}
      </Button>

      {pendingCount > 0 ? (
        <p className="flex items-center gap-[var(--v-space-2)] text-[0.875rem] text-[var(--v-text-secondary)]">
          <Loader2 className="size-4 animate-spin" />
          جاري تحليل {pendingCount} مصدر — تقدر تسيب الصفحة وترجع، المعالجة بتكمّل من مكانها.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-3)]">
      <p className="text-[0.8125rem] text-[var(--v-text-secondary)]">{label}</p>
      <p className="mt-[var(--v-space-1)] text-[1.25rem] font-bold text-[var(--v-text)]">{value}</p>
    </div>
  );
}

/**
 * قائمة المصادر.
 *
 * إعادة المحاولة ظاهرة للمصادر الفاشلة بس — ومش رفاهية: بصمة المحتوى
 * بتمنع رفع نفس الملف تاني، فده المسار الوحيد لإصلاح مصدر فشل.
 */
function SourcesList({
  sources,
  batches,
  retryingId,
  onRetry,
  onRetryAll,
}: {
  sources: KnowledgeSource[];
  batches: KnowledgeBatch[];
  retryingId: string | null;
  onRetry: (sourceId: string) => void;
  onRetryAll: () => void;
}) {
  if (sources.length === 0) {
    return (
      <EmptyState
        icon={<FileStack className="size-6" />}
        title="لا توجد مصادر معرفة بعد"
        description="ارفع أول دفعة مستندات وابدأ ببناء العقل الخام للمشروع."
      />
    );
  }

  const versionById = new Map(batches.map((b) => [b.id, b.version]));
  const failedCount = sources.filter((s) =>
    isReprocessableSource(s.status, s.kind, s.file_name, s.mime_type, s.extracted_chars)
  ).length;
  const retryingAll = retryingId === "__all__";

  return (
    <section>
      <div className="mb-[var(--v-space-2)] flex flex-wrap items-center justify-between gap-[var(--v-space-2)]">
        <h4 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
          المصادر ({sources.length})
          {failedCount > 0 ? (
            <span className="ms-[var(--v-space-2)]">
              <Badge tone="danger">{failedCount} فشل</Badge>
            </span>
          ) : null}
        </h4>

        {failedCount > 1 ? (
          <Button size="sm" variant="outline" onClick={onRetryAll} disabled={retryingId !== null}>
            {retryingAll ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                جاري إعادة الجدولة…
              </>
            ) : (
              <>
                <RotateCw className="size-3.5" />
                أعد محاولة كل الفاشل ({failedCount})
              </>
            )}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-[var(--v-space-2)]">
        {sources.map((source) => {
          const state = SOURCE_STATUS[source.status] ?? SOURCE_STATUS.pending;
          const version = source.batch_id ? versionById.get(source.batch_id) : undefined;
          const isFailed = isReprocessableSource(source.status, source.kind, source.file_name, source.mime_type, source.extracted_chars);
          const busy = retryingId === source.id || retryingAll;

          return (
            <li
              key={source.id}
              className={`flex flex-wrap items-start justify-between gap-[var(--v-space-3)] rounded-[var(--v-radius-md)] border px-[var(--v-space-3)] py-[var(--v-space-3)] ${
                isFailed
                  ? "border-[var(--v-red)]/30 bg-[var(--v-red)]/5"
                  : "border-[var(--v-border)] bg-[var(--v-surface)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-[var(--v-space-2)]">
                  <StatusIcon status={source.status} />
                  <span className="truncate text-[0.9375rem] font-medium text-[var(--v-text)]">
                    {source.title}
                  </span>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {version ? <Badge tone="neutral">دفعة {version}</Badge> : null}
                  {source.item_count > 0 ? (
                    <Badge tone="info">{source.item_count} عنصر</Badge>
                  ) : null}
                </div>
                {source.last_error ? (
                  <p className="mt-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]">
                    {source.last_error}
                  </p>
                ) : null}
              </div>

              {isFailed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRetry(source.id)}
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      جارٍ…
                    </>
                  ) : (
                    <>
                      <RotateCw className="size-3.5" />
                      أعد المحاولة
                    </>
                  )}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ready") return <CheckCircle2 className="size-4 shrink-0 text-[var(--v-green)]" />;
  if (status === "failed") return <AlertCircle className="size-4 shrink-0 text-[var(--v-red)]" />;
  if (status === "skipped_duplicate")
    return <SkipForward className="size-4 shrink-0 text-[var(--v-amber)]" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-[var(--v-text-subtle)]" />;
}

function GapsList({ gaps }: { gaps: KnowledgeGap[] }) {
  return (
    <section>
      <h4 className="mb-[var(--v-space-2)] text-[0.9375rem] font-semibold text-[var(--v-text)]">
        فجوات معرفية ({gaps.length})
      </h4>
      <ul className="flex flex-col gap-[var(--v-space-2)]">
        {gaps.slice(0, 20).map((gap) => (
          <li
            key={gap.id}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-[var(--v-space-3)] py-[var(--v-space-2)]"
          >
            <div className="flex flex-wrap items-center gap-[var(--v-space-2)]">
              <Badge tone={gap.priority === "high" ? "danger" : gap.priority === "low" ? "neutral" : "warning"}>
                {gap.priority === "high" ? "عالية" : gap.priority === "low" ? "منخفضة" : "متوسطة"}
              </Badge>
              <Badge tone="neutral">من: {NEEDED_FROM_LABELS[gap.needed_from] ?? gap.needed_from}</Badge>
            </div>
            <p className="mt-[var(--v-space-2)] text-[0.875rem] text-[var(--v-text)]">
              {gap.description}
            </p>
            {gap.why_it_matters ? (
              <p className="mt-[var(--v-space-1)] text-[0.8125rem] text-[var(--v-text-secondary)]">
                {gap.why_it_matters}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * شريط التوليف.
 *
 * بيعرض حصيلة التحقق المتقاطع بعد التشغيل: كام معلومة أكّدها المستند،
 * وكام جملة في الـ Brain بلا سند مستندي، ونسبة التغطية. الرقمان دول
 * بيقولوا للـ PM حاجة مالوش بديل: قد إيه المشروع مبني على كلام موثّق.
 */
function SynthesisBar({
  readyCount,
  proposalCount,
  synthesizing,
  summary,
  onRun,
}: {
  readyCount: number;
  proposalCount: number;
  synthesizing: boolean;
  summary: SynthesisSummary | null;
  onRun: () => void;
}) {
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--v-space-3)]">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
            التوليف والتحقق المتقاطع
          </p>
          <p className="mt-[var(--v-space-1)] text-[0.875rem] text-[var(--v-text-secondary)]">
            {readyCount > 0
              ? `${readyCount} عنصر جاهز للتوليف. بيقارن المستندات بكلام العميل وبقرارات الاجتماعات، ويطلّع قواعد وأدوار ومؤشرات جاهزة للـ Brain.`
              : `${proposalCount} مقترح جاهز. ارفع مستندات جديدة وشغّل الإثراء للمزيد.`}
          </p>
        </div>
        <Button onClick={onRun} disabled={synthesizing || readyCount === 0}>
          {synthesizing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              جاري التوليف…
            </>
          ) : (
            <>
              <Layers className="size-4" />
              {readyCount > 0 ? "ابدأ التوليف" : "لا يوجد جديد"}
            </>
          )}
        </Button>
      </div>

      {summary ? (
        <div className="mt-[var(--v-space-4)] grid grid-cols-2 gap-[var(--v-space-3)] border-t border-[var(--v-border)] pt-[var(--v-space-3)] sm:grid-cols-4">
          <MiniStat label="مقترحات جديدة" value={String(summary.proposalsAdded)} />
          <MiniStat label="أكّدها المستند" value={String(summary.confirmedCount)} />
          <MiniStat label="بلا سند مستندي" value={String(summary.unbackedCount)} tone="warning" />
          <MiniStat
            label="تغطية المعرفة"
            value={summary.coverage === null ? "غير متاح" : `${summary.coverage}%`}
          />
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div>
      <p className="text-[0.75rem] text-[var(--v-text-subtle)]">{label}</p>
      <p
        className={`mt-[2px] text-[1.0625rem] font-bold ${
          tone === "warning" ? "text-[var(--v-amber)]" : "text-[var(--v-text)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * المقترحات الجاهزة للـ Brain، مجمّعة بالقسم المستهدف.
 *
 * البنى التشغيلية (سلاسل الاعتماد، المعادلات، الاستثناءات) بتتعلّم بنوعها
 * عشان تبان مميّزة عن قاعدة العمل العادية رغم إنها متخزّنة معاها.
 */
/**
 * شريط صحة المعرفة.
 *
 * الدرجة مركّبة من أربعة أبعاد، والخطوة التالية بتتحسب بترتيب السلسلة —
 * فمافيش رسالة تقول "اعتمد المقترحات" والمصادر لسه بتتحلّل.
 */
function HealthBar({ health }: { health: KnowledgeHealth }) {
  if (health.score === null) {
    return (
      <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-4)]">
        <p className="text-[0.875rem] text-[var(--v-text-secondary)]">{health.nextStep}</p>
      </div>
    );
  }

  const tone =
    health.level === "strong"
      ? "var(--v-green)"
      : health.level === "good"
        ? "var(--v-primary)"
        : health.level === "fair"
          ? "var(--v-amber)"
          : "var(--v-red)";

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--v-space-3)]">
        <div className="flex items-center gap-[var(--v-space-3)]">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 text-[1.0625rem] font-bold"
            style={{ borderColor: tone, color: tone }}
          >
            {health.score}
          </div>
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              صحة المعرفة: {HEALTH_LEVEL_LABELS[health.level]}
            </p>
            <p className="mt-[var(--v-space-1)] text-[0.875rem] text-[var(--v-text-secondary)]">
              {health.nextStep}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-[var(--v-space-4)] grid grid-cols-2 gap-[var(--v-space-3)] border-t border-[var(--v-border)] pt-[var(--v-space-3)] sm:grid-cols-4">
        <MiniStat label="التحليل" value={`${health.breakdown.processing}%`} />
        <MiniStat label="الإثراء" value={`${health.breakdown.enrichment}%`} />
        <MiniStat label="الإدماج في Brain" value={`${health.breakdown.integration}%`} />
        <MiniStat
          label="النظافة"
          value={`${health.breakdown.cleanliness}%`}
          tone={health.breakdown.cleanliness < 70 ? "warning" : undefined}
        />
      </div>
    </div>
  );
}

/**
 * المقترحات الجاهزة للـ Brain، مجمّعة بالقسم المستهدف.
 *
 * الاعتماد قرار بشري صريح: مستند واحد ممكن يغيّر قواعد عمل المشروع،
 * وده مش قرار نموذج. الاعتماد بيدمج إضافيًا فالمحتوى القائم مابيتمسّش.
 */
function ProposalsList({
  proposals,
  appliedCount,
  applying,
  onApplyAll,
  onApplyOne,
  onReject,
}: {
  proposals: KnowledgeItem[];
  appliedCount: number;
  applying: boolean;
  onApplyAll: () => void;
  onApplyOne: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const grouped = new Map<string, KnowledgeItem[]>();
  for (const item of proposals) {
    const section = sectionFromTags(item.tags) ?? "unknown";
    const list = grouped.get(section) ?? [];
    list.push(item);
    grouped.set(section, list);
  }

  const sections = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <section>
      <div className="mb-[var(--v-space-3)] flex flex-wrap items-center justify-between gap-[var(--v-space-2)]">
        <h4 className="flex items-center gap-[var(--v-space-2)] text-[0.9375rem] font-semibold text-[var(--v-text)]">
          <Layers className="size-4 text-[var(--v-primary)]" />
          مقترحات جاهزة للـ Brain ({proposals.length})
          {appliedCount > 0 ? <Badge tone="success">{appliedCount} معتمَد</Badge> : null}
        </h4>
        {proposals.length > 0 ? (
          <Button onClick={onApplyAll} disabled={applying}>
            {applying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                جاري الاعتماد…
              </>
            ) : (
              <>
                <BrainCog className="size-4" />
                اعتمد الكل وأضِفه للـ Brain
              </>
            )}
          </Button>
        ) : null}
      </div>

      {proposals.length === 0 ? (
        <p className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-[var(--v-space-3)] py-[var(--v-space-3)] text-[0.875rem] text-[var(--v-text-secondary)]">
          كل المقترحات اتاخد فيها قرار. ارفع مستندات جديدة وشغّل الإثراء والتوليف للمزيد.
        </p>
      ) : (
        <div className="flex flex-col gap-[var(--v-space-4)]">
          {sections.map(([section, sectionItems]) => (
            <div key={section}>
              <p className="mb-[var(--v-space-2)] text-[0.875rem] font-medium text-[var(--v-text-secondary)]">
                {BRAIN_SECTION_LABELS[section as BrainSectionKey] ?? section} (
                {sectionItems.length})
              </p>
              <ul className="flex flex-col gap-[var(--v-space-2)]">
                {sectionItems.map((item) => {
                  const kindTag = (item.tags ?? []).find((t) => t.startsWith("kind:"));
                  const kind = kindTag ? (kindTag.slice("kind:".length) as OperationalKind) : null;
                  return (
                    <li
                      key={item.id}
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-[var(--v-space-3)] py-[var(--v-space-2)]"
                    >
                      <div className="flex flex-wrap items-center gap-[var(--v-space-2)]">
                        <span className="text-[0.875rem] font-medium text-[var(--v-text)]">
                          {item.title}
                        </span>
                        {kind ? (
                          <Badge tone="primary">{OPERATIONAL_LABELS[kind] ?? kind}</Badge>
                        ) : null}
                        <Badge tone={item.confidence >= 80 ? "success" : "neutral"}>
                          ثقة {item.confidence}%
                        </Badge>
                      </div>

                      {item.content && item.content !== item.title ? (
                        <p className="mt-[var(--v-space-1)] text-[0.8125rem] leading-relaxed text-[var(--v-text-secondary)]">
                          {item.content}
                        </p>
                      ) : null}

                      <div className="mt-[var(--v-space-2)] flex flex-wrap gap-[var(--v-space-2)]">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={applying}
                          onClick={() => onApplyOne(item.id)}
                        >
                          <Check className="size-3.5" />
                          اعتمد
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={applying}
                          onClick={() => onReject(item.id)}
                        >
                          ارفض
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
