import Link from "next/link";
import { Users, FolderKanban, ShieldAlert, MessagesSquare, FileText, ArrowLeft, Send, Eye, ClipboardCheck, Clock, LayoutDashboard, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import WorkspaceTasksWidget from "./workspace-tasks-widget";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import AnimatedCounter from "@/components/ui/AnimatedCounter";
import { stageLabels, stageTones } from "@/lib/projects/stage-labels";
import { projectTabUrl } from "@/lib/navigation/targets";

const ATTENTION_ANCHOR = "attention-needed";

const requestTypeLabels: Record<string, string> = {
  usage_question: "سؤال استخدام",
  usage_problem: "مشكلة استخدام",
  bug: "Bug",
  feature_request: "Feature Request",
  change_request: "Change Request",
  unclear: "غير واضح",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: leadsCount },
    { count: projectsCount },
    { data: recentLeads },
    { count: blockedReviewsCount },
    { count: pendingSupportCount },
    { data: activeProjectIds },
    { data: prdProjectIds },
    { data: recentProjects },
    { data: blockedReviewRows },
    { data: pendingSupportRows },
    { data: expiredLinkRows },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("projects").select("*", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("leads")
      .select("id, status, source, created_at, clients(company_name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("prototype_review")
      .select("*", { count: "exact", head: true })
      .eq("overall_status", "blocked"),
    supabase
      .from("support_requests")
      .select("*", { count: "exact", head: true })
      .in("resolution_status", ["escalated", "in_progress"]),
    supabase.from("projects").select("id, name").is("archived_at", null),
    supabase.from("prd").select("project_id").gt("version", 0),
    supabase
      .from("projects")
      .select("id, name, stage, stage_changed_at, clients(company_name)")
      .is("archived_at", null)
      .order("stage_changed_at", { ascending: false })
      .limit(5),
    // الطبقة ٢ — الاستثناءات الفعلية (مش عدد بس)، عشان القسم يوري فعليًا
    // إيه المشروع المحظور بدل ما يوري رقم مجرّد.
    supabase
      .from("prototype_review")
      .select("project_id, updated_at, projects(name)")
      .eq("overall_status", "blocked")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("support_requests")
      .select("id, project_id, request_type, escalated_at, created_at, projects(name)")
      .in("resolution_status", ["escalated", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("discovery_form_links")
      .select("id, project_id, projects(name)")
      .eq("status", "expired")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // ---- إحصائيات WhatsApp ----
  const [
    { count: waSentCount },
    { data: waLinksAll },
    { data: waSubmittedRows },
  ] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true })
      .in("status", ["sent", "delivered", "read"]),
    supabase
      .from("discovery_form_links")
      .select("id, status"),
    supabase
      .from("discovery_form_links")
      .select("created_at, submitted_at")
      .not("submitted_at", "is", null)
      .limit(50),
  ]);
  const waLinks = waLinksAll ?? [];
  const linksTotal = waLinks.length;
  const linksOpened = waLinks.filter((l) => ["opened", "in_progress", "submitted"].includes(l.status)).length;
  const linksSubmitted = waLinks.filter((l) => l.status === "submitted").length;
  const linksExpired = waLinks.filter((l) => l.status === "expired").length;
  const completionRate = linksTotal > 0 ? Math.round((linksSubmitted / linksTotal) * 100) : 0;
  const avgCompletionMinutes = (() => {
    const rows = (waSubmittedRows ?? []).filter((r) => r.submitted_at);
    if (rows.length === 0) return null;
    const totalMs = rows.reduce((sum, r) => {
      return sum + (new Date(r.submitted_at as string).getTime() - new Date(r.created_at).getTime());
    }, 0);
    return Math.round(totalMs / rows.length / 60000);
  })();

  // "لوحة صحة المحفظة" — كل الأرقام دي حتمية (Count مباشر أو فرق
  // مجموعات في الكود)، صفر AI، عشان تكون موثوقة 100%.
  const prdProjectIdSet = new Set((prdProjectIds ?? []).map((p) => p.project_id));
  const projectsWithoutPrd = (activeProjectIds ?? []).filter((p) => !prdProjectIdSet.has(p.id));
  const projectsWithoutPrdCount = projectsWithoutPrd.length;

  const totalExceptions = (blockedReviewsCount ?? 0) + (pendingSupportCount ?? 0);

  interface ExceptionItem {
    key: string;
    href: string;
    projectName: string;
    label: string;
    tone: "danger" | "warning";
  }

  function projectNameOf(rel: { name: string } | { name: string }[] | null): string {
    return (Array.isArray(rel) ? rel[0]?.name : rel?.name) || "مشروع محذوف";
  }

  // كل بند هنا رابطه الحقيقي مبني عبر lib/navigation/targets.ts (نفس
  // المصدر الوحيد اللي بتستخدمه الإشعارات) — بطاقات Dashboard مش
  // بتبني مسارات بنفسها، ومحتاجة تبويب المشروع الصحيح تحديدًا بدل
  // "/dashboard/projects" العام.
  const exceptions: ExceptionItem[] = [
    ...((blockedReviewRows ?? []).map((r) => ({
      key: `review-${r.project_id}`,
      href: projectTabUrl(r.project_id, "review"),
      projectName: projectNameOf(r.projects),
      label: "مراجعة Prototype محظورة",
      tone: "danger" as const,
    }))),
    ...((pendingSupportRows ?? []).map((r) => ({
      key: `support-${r.id}`,
      href: projectTabUrl(r.project_id, "support", r.id),
      projectName: projectNameOf(r.projects),
      label: `طلب دعم بانتظار المتابعة — ${requestTypeLabels[r.request_type] ?? r.request_type}`,
      tone: "warning" as const,
    }))),
    ...(projectsWithoutPrd.slice(0, 5).map((p) => ({
      key: `no-prd-${p.id}`,
      href: projectTabUrl(p.id, "prd"),
      projectName: p.name,
      label: "مشروع بدون PRD",
      tone: "warning" as const,
    }))),
    ...((expiredLinkRows ?? []).map((r) => ({
      key: `expired-link-${r.id}`,
      href: projectTabUrl(r.project_id, "overview", r.id),
      projectName: projectNameOf(r.projects),
      label: "رابط اكتشاف منتهي الصلاحية",
      tone: "warning" as const,
    }))),
  ];

  return (
    <div>
      <PageHeader title="نظرة عامة" icon={LayoutDashboard} className="mb-2" />
      <p className="text-sm text-[var(--v-text-secondary)]">
        {projectsCount ?? 0} مشروع نشط و{leadsCount ?? 0} عميل محتمل —{" "}
        {totalExceptions > 0 ? (
          <span className="font-medium text-[var(--v-amber)]">{totalExceptions} بند محتاج متابعتك دلوقتي.</span>
        ) : (
          <span className="font-medium text-[var(--v-green)]">كل حاجة تحت السيطرة، مفيش استثناءات.</span>
        )}
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Users} label="عملاء محتملون" value={leadsCount ?? 0} href="/dashboard/leads" />
        <StatCard icon={FolderKanban} label="مشاريع" value={projectsCount ?? 0} href="/dashboard/projects" />
        <StatCard
          icon={ShieldAlert}
          label="مراجعات Blocked"
          value={blockedReviewsCount ?? 0}
          href={(blockedReviewsCount ?? 0) > 0 ? `#${ATTENTION_ANCHOR}` : undefined}
          alert={(blockedReviewsCount ?? 0) > 0 ? "danger" : undefined}
        />
        <StatCard
          icon={MessagesSquare}
          label="طلبات دعم بانتظار المتابعة"
          value={pendingSupportCount ?? 0}
          href={(pendingSupportCount ?? 0) > 0 ? `#${ATTENTION_ANCHOR}` : undefined}
          alert={(pendingSupportCount ?? 0) > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={FileText}
          label="مشاريع بدون PRD"
          value={projectsWithoutPrdCount}
          href={projectsWithoutPrdCount > 0 ? `#${ATTENTION_ANCHOR}` : undefined}
          alert={projectsWithoutPrdCount > 0 ? "warning" : undefined}
        />
      </div>

      <WorkspaceTasksWidget />

      <div className="mt-9">
        <p className="mb-3 text-xs font-semibold text-[var(--v-text-muted)]">
          الاكتشاف على واتساب
        </p>
        {/* الأرقام دي مقاييس تجميعية بحتة (مش قائمة عناصر لها وجهة
            حقيقية) — إلا "روابط منتهية" لأنها فعل مطلوب فعليًا، فبتاخد
            لقائمة "يحتاج انتباهك الآن". الباقي مش رابط أصلًا بدل ما
            يودّي لصفحة عامة غلط (نفس شكوى المستخدم بالظبط). */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Send} label="رسائل مُرسلة" value={waSentCount ?? 0} />
          <StatCard icon={Eye} label="روابط فُتحت" value={linksOpened} />
          <StatCard icon={ClipboardCheck} label="نماذج مُكتملة" value={linksSubmitted} />
          <StatCard
            icon={Clock}
            label="روابط منتهية"
            value={linksExpired}
            href={linksExpired > 0 ? `#${ATTENTION_ANCHOR}` : undefined}
            alert={linksExpired > 0 ? "warning" : undefined}
          />
          <StatCard icon={ClipboardCheck} label="معدل الإكمال %" value={completionRate} />
          <StatCard icon={Clock} label="متوسط الإكمال (دقيقة)" value={avgCompletionMinutes ?? 0} />
        </div>
      </div>

      {exceptions.length > 0 && (
        <div id={ATTENTION_ANCHOR} className="mt-9 scroll-mt-20">
          <p className="mb-3 text-xs font-semibold text-[var(--v-text-muted)]">يحتاج انتباهك الآن</p>
          <div className="space-y-2">
            {exceptions.map((item) => (
              <Link key={item.key} href={item.href} className="block">
                <div
                  className="flex items-center justify-between gap-3 rounded-[var(--v-radius-lg)] border-s-4 bg-[var(--v-bg)] px-4 py-3 shadow-[var(--v-shadow-sm)] transition-shadow hover:shadow-[var(--v-shadow-md)]"
                  style={{
                    borderInlineStartColor: item.tone === "danger" ? "var(--v-red)" : "var(--v-amber)",
                    borderTop: "1px solid var(--v-border)",
                    borderBottom: "1px solid var(--v-border)",
                    borderInlineEnd: "1px solid var(--v-border)",
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--v-text)]">{item.projectName}</p>
                    <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{item.label}</p>
                  </div>
                  <ArrowLeft size={16} className="shrink-0 text-[var(--v-text-muted)]" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--v-text-muted)]">آخر العملاء المحتملين</p>
          <div className="space-y-3">
            {(recentLeads ?? []).length === 0 && (
              <EmptyState icon={<Users size={28} />} title="لا يوجد عملاء محتملون بعد" />
            )}
            {(recentLeads ?? []).map((lead) => (
              <Card
                key={lead.id}
                padding="sm"
                hover
                className="flex items-center justify-between"
                style={{ borderInlineStart: "3px solid var(--v-primary)" }}
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--v-text)]">
                    {/* @ts-expect-error clients هو علاقة متداخلة من Supabase */}
                    {lead.clients?.company_name || "بدون اسم شركة"}
                  </p>
                  <p className="text-xs text-[var(--v-text-subtle)]">{lead.source || "مصدر غير محدد"}</p>
                </div>
                <Badge tone={lead.status === "converted" ? "success" : lead.status === "lost" ? "danger" : "neutral"}>
                  {lead.status}
                </Badge>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--v-text-muted)]">أحدث نشاط المشاريع</p>
          <div className="space-y-3">
            {(recentProjects ?? []).length === 0 && (
              <EmptyState icon={<FolderKanban size={28} />} title="لا توجد مشاريع بعد" />
            )}
            {(recentProjects ?? []).map((project) => (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="block">
                <Card
                  padding="sm"
                  hover
                  className="flex items-center justify-between transition-colors hover:border-[var(--v-primary)]"
                  style={{ borderInlineStart: "3px solid var(--v-primary)" }}
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--v-text)]">{project.name}</p>
                    <p className="text-xs text-[var(--v-text-subtle)]">
                      {/* @ts-expect-error clients هو علاقة متداخلة من Supabase */}
                      {project.clients?.company_name || "—"} ·{" "}
                      {new Date(project.stage_changed_at).toLocaleDateString("ar-EG")}
                    </p>
                  </div>
                  <Badge tone={stageTones[project.stage] ?? "neutral"}>
                    {stageLabels[project.stage] || project.stage}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  alert,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href?: string;
  alert?: "danger" | "warning";
}) {
  const valueClass =
    alert === "danger" ? "text-[var(--v-red)]" : alert === "warning" ? "text-[var(--v-amber)]" : "text-[var(--v-text)]";
  // كارت الاستثناء ياخد تظليل خلفية كامل، مش لون على الرقم بس — العين
  // المفروض تمسكه بالرؤية الطرفية قبل القراءة (§05 من استراتيجية الارتقاء).
  // Inline style عشان نضمن إنه يغلب خلفية الكارت الافتراضية بغض النظر
  // عن ترتيب توليد كلاسات Tailwind.
  const exceptionStyle =
    alert === "danger"
      ? { backgroundColor: "rgba(220,38,38,0.05)", borderColor: "rgba(220,38,38,0.25)" }
      : alert === "warning"
        ? { backgroundColor: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.25)" }
        : undefined;

  const body = (
    <Card
      padding="md"
      hover={!!href}
      className={href ? "transition-colors hover:border-[var(--v-primary)]" : ""}
      style={exceptionStyle}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${
            alert === "danger"
              ? "bg-[var(--v-red)]/10 text-[var(--v-red)]"
              : alert === "warning"
                ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
                : "bg-[var(--v-surface-2)] text-[var(--v-primary)]"
          }`}
        >
          <Icon size={18} aria-hidden={true} />
        </span>
        {alert && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${alert === "danger" ? "bg-[var(--v-red)]" : "bg-[var(--v-amber)]"}`}
            aria-hidden="true"
          />
        )}
      </div>
      <p className={`mt-3 font-mono-plex text-2xl tabular-nums ${valueClass}`}>
        <AnimatedCounter value={value} />
      </p>
      <p className="mt-1 text-[11px] leading-tight text-[var(--v-text-subtle)]">{label}</p>
    </Card>
  );

  // بطاقة بلا رابط حقيقي (مقياس تجميعي بحت) بتُعرض كما هي بدون Link —
  // أفضل من ما تودّي لصفحة عامة غلط (نفس الشكوى الأصلية بالظبط).
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
