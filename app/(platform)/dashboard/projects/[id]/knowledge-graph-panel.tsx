"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Network, Search, Sparkles, History, AlertTriangle, GitBranch } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Tooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  setProjectDomainAction,
  runKnowledgeGraphAnalysisAction,
  searchProjectKnowledgeAction,
  getKnowledgeNodeHistory,
} from "./knowledge-graph-actions";
import { DOMAIN_PROFILES } from "@/lib/domain-intelligence/domain-profiles";
import type {
  KnowledgeConsistencyReport,
  KnowledgeEvidence,
  KnowledgeNode,
  KnowledgeRelation,
  KnowledgeVersion,
  ProjectDomain,
  ProjectKnowledgeSearchResult,
} from "@/lib/types/database";

const CATEGORY_LABELS: Record<string, string> = {
  business_goals: "أهداف العمل",
  stakeholders: "أصحاب المصلحة",
  business_rules: "قواعد العمل",
  functional_requirements: "المتطلبات الوظيفية",
  non_functional_requirements: "المتطلبات غير الوظيفية",
  risks: "المخاطر",
  constraints: "القيود",
  assumptions: "الافتراضات",
  known_facts: "الحقائق المعروفة",
  missing_information: "معلومات ناقصة",
  user_roles: "أدوار المستخدمين",
  suggested_features: "مزايا مقترحة",
  suggested_integrations: "تكاملات مقترحة",
  suggested_kpis: "مؤشرات الأداء",
  roadmap: "خارطة الطريق",
  meeting_questions: "أسئلة الاجتماع",
  project_scope: "نطاق المشروع",
};

const RELATION_LABELS: Record<string, string> = {
  depends_on: "يعتمد على",
  related_to: "مرتبط بـ",
  blocks: "يعطّل",
  part_of: "جزء من",
  conflicts_with: "يتعارض مع",
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info"> = { high: "danger", medium: "warning", low: "info" };

function confidenceTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function VersionHistoryModal({ node, onClose }: { node: KnowledgeNode; onClose: () => void }) {
  const [versions, setVersions] = useState<KnowledgeVersion[] | null>(null);
  const [evidence, setEvidence] = useState<KnowledgeEvidence[] | null>(null);

  useMemo(() => {
    getKnowledgeNodeHistory(node.id).then((r) => {
      setVersions(r.versions);
      setEvidence(r.evidence);
    });
  }, [node.id]);

  return (
    <Modal open onClose={onClose} maxWidth="max-w-xl">
      <p className="text-sm font-semibold text-[var(--v-text)]">{node.title}</p>
      <p className="mt-1 text-xs text-[var(--v-text-muted)]">{node.description || "بدون وصف"}</p>

      {evidence && evidence.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-muted)]">الدليل</p>
          <div className="space-y-1">
            {evidence.map((e) => (
              <p key={e.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] p-2 text-xs text-[var(--v-text-secondary)]">
                &quot;{e.quote}&quot;
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-muted)]">سجل النسخ</p>
        {!versions ? (
          <p className="text-xs text-[var(--v-text-muted)]">جاري التحميل…</p>
        ) : (
          <div className="space-y-1.5">
            {versions.map((v) => (
              <div key={v.id} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono-plex font-semibold text-[var(--v-text)]">v{v.version}</span>
                  <span className="text-[var(--v-text-muted)]">{new Date(v.created_at).toLocaleString("ar-EG")}</span>
                </div>
                <p className="mt-1 text-[var(--v-text-secondary)]">{v.change_reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function KnowledgeGraphPanel({
  projectId,
  nodes,
  relations,
  latestReport,
  domain,
  isAdmin,
}: {
  projectId: string;
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  latestReport: KnowledgeConsistencyReport | null;
  domain: ProjectDomain | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startAction] = useTransition();
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectKnowledgeSearchResult[] | null>(null);

  const nodesByCategory = useMemo(() => {
    const map = new Map<string, KnowledgeNode[]>();
    for (const node of nodes) {
      const list = map.get(node.category) ?? [];
      list.push(node);
      map.set(node.category, list);
    }
    return map;
  }, [nodes]);

  const nodeTitleById = useMemo(() => new Map(nodes.map((n) => [n.id, n.title])), [nodes]);

  function handleDomainChange(value: string) {
    startAction(async () => {
      const result = await setProjectDomainAction(projectId, value as ProjectDomain);
      if (!result.ok) toast.error(result.message ?? "فشل الحفظ.");
      else router.refresh();
    });
  }

  function handleAnalyze() {
    startAction(async () => {
      const result = await runKnowledgeGraphAnalysisAction(projectId);
      if (!result.ok) toast.error(result.message ?? "فشل التحليل.");
      else {
        toast.success("اكتمل تحليل شبكة المعرفة.");
        router.refresh();
      }
    });
  }

  function handleSearch() {
    startAction(async () => {
      const result = await searchProjectKnowledgeAction(projectId, query);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSearchResults(result.results);
    });
  }

  if (nodes.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<Network size={28} />}
          title="لا توجد شبكة معرفة بعد"
          description="بتتولّد تلقائيًا بمجرد اعتماد أول نسخة من Project Brain."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-[var(--v-primary)]" />
            <p className="text-sm font-semibold text-[var(--v-text)]">شبكة المعرفة</p>
            <span className="text-xs text-[var(--v-text-muted)]">({nodes.length} عنصر، {relations.length} علاقة)</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select
                value={domain ?? ""}
                onChange={(e) => handleDomainChange(e.target.value)}
                disabled={isPending}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] px-2 py-1.5 text-xs text-[var(--v-text)]"
              >
                <option value="">اختر مجال العمل…</option>
                {Object.values(DOMAIN_PROFILES).map((p) => (
                  <option key={p.domain} value={p.domain}>{p.label}</option>
                ))}
              </select>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={isPending} icon={<Sparkles size={13} />}>
                تحليل شبكة المعرفة
              </Button>
            )}
          </div>
        </div>
      </Card>

      {latestReport && (
        <Card padding="md">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <AlertTriangle size={16} className="text-[var(--v-warning)]" /> آخر تقرير تناسق —{" "}
            <span className="text-xs font-normal text-[var(--v-text-muted)]">{new Date(latestReport.generated_at).toLocaleString("ar-EG")}</span>
          </p>
          {latestReport.issues.length === 0 && latestReport.domain_gaps.length === 0 ? (
            <p className="text-xs text-[var(--v-success)]">لا توجد مشاكل تناسق مكتشفة.</p>
          ) : (
            <div className="space-y-2">
              {latestReport.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs">
                  <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.type}</Badge>
                  <span className="text-[var(--v-text)]">{issue.description}</span>
                </div>
              ))}
              {latestReport.domain_gaps.length > 0 && (
                <div className="rounded-[var(--v-radius-md)] border border-[var(--v-warning)]/30 bg-[var(--v-warning)]/5 p-2 text-xs">
                  <p className="font-semibold text-[var(--v-text)]">عناصر متوقّعة لمجال العمل غير موجودة:</p>
                  <p className="mt-1 text-[var(--v-text-secondary)]">{latestReport.domain_gaps.join("، ")}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card padding="md">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Search size={16} className="text-[var(--v-primary)]" /> بحث دلالي في معرفة المشروع
        </p>
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="ابحث عن متطلب، قاعدة عمل، مخاطرة…" className="flex-1" />
        </div>
        {searchResults !== null && (
          searchResults.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--v-text-muted)]">لا توجد نتائج.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {searchResults.map((r) => (
                <div key={r.id} className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <Badge tone="neutral">{CATEGORY_LABELS[r.category] ?? r.category}</Badge>
                    <span className="text-[var(--v-text-muted)]">تطابق {Math.round(r.similarity * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[var(--v-text)]">{r.title}</p>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      <Card padding="md">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">خريطة المعرفة</p>
        <div className="space-y-4">
          {[...nodesByCategory.entries()].map(([category, items]) => (
            <div key={category}>
              <p className="mb-1.5 text-[11px] font-semibold text-[var(--v-text-muted)]">
                {CATEGORY_LABELS[category] ?? category} ({items.length})
              </p>
              <div className="space-y-1.5">
                {items.map((node) => (
                  <div key={node.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[var(--v-text)]">{node.title}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Tooltip label={`ثقة ${node.confidence_score}%`}>
                        <span className={`h-2 w-2 rounded-full ${confidenceTone(node.confidence_score) === "success" ? "bg-[var(--v-success)]" : confidenceTone(node.confidence_score) === "warning" ? "bg-[var(--v-warning)]" : "bg-[var(--v-danger)]"}`} />
                      </Tooltip>
                      <span className="font-mono-plex text-[10px] text-[var(--v-text-muted)]">v{node.version}</span>
                      <button type="button" onClick={() => setSelectedNode(node)} className="text-[var(--v-text-muted)] hover:text-[var(--v-primary)]">
                        <History size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {relations.length > 0 && (
        <Card padding="md">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <GitBranch size={16} className="text-[var(--v-primary)]" /> العلاقات ({relations.length})
          </p>
          <div className="space-y-1">
            {relations.map((rel) => (
              <div key={rel.id} className="flex items-center gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2 py-1.5 text-xs">
                <span className="text-[var(--v-text)]">{nodeTitleById.get(rel.from_node_id) ?? rel.from_node_id}</span>
                <Badge tone={rel.inferred_by === "ai" ? "info" : "neutral"}>{RELATION_LABELS[rel.relation_type]}</Badge>
                <span className="text-[var(--v-text)]">{nodeTitleById.get(rel.to_node_id) ?? rel.to_node_id}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {selectedNode && <VersionHistoryModal node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  );
}
