import {
  LayoutDashboard, Activity, Users, Building2, FolderKanban, MessagesSquare,
  ListChecks, Brain, Workflow, LayoutTemplate, Settings, BookOpen, CheckSquare, DatabaseZap, GitBranch, Sparkles, Wand2, FlaskConical, Rocket, BadgeCheck, HeartPulse, Target, type LucideIcon,
} from "lucide-react";

/**
 * مصدر وحيد لعناصر التنقّل (Sidebar الديسكتوب + Drawer الموبايل يستخدموه معًا)
 * — مجمّعة في أقسام لتقليل الازدحام البصري (UI/UX Phase 1). ملف client-safe
 * (بدون أي استيراد server) عشان يتقدر يُستورد من مكوّنات "use client".
 */

export interface NavItem {
  href: string;
  label: string;
  /** مفتاح الترجمة (i18n) — يُستخدم في المكوّنات المُترجَمة؛ label عربي fallback. */
  labelKey?: string;
  icon: LucideIcon;
  /** لو محدّدة، العنصر يظهر فقط للأدوار دي (غير محدّدة = للجميع). */
  roles?: readonly ("owner" | "admin" | "supervisor" | "member")[];
  /**
   * لو محدّد، العنصر يظهر فقط لو الـ flag ده مفعّل. لو غير محدّد = يظهر دائمًا.
   * يُستخدم لإخفاء وحدات "Extended Technical Delivery" في NEXVORA Core.
   */
  flag?: string;
}

export interface NavGroup {
  /** null = عناصر أساسية بدون عنوان قسم (تظهر فوق). */
  title: string | null;
  /** مفتاح ترجمة عنوان القسم (i18n). */
  titleKey?: string;
  items: NavItem[];
}

/** فلترة عناصر التنقّل حسب دور المستخدم (يحافظ على الترتيب والأقسام). */
export function filterNavByRole(
  groups: NavGroup[],
  role: string | null | undefined
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.roles || (role != null && it.roles.includes(role as never))),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * فلترة عناصر التنقّل حسب Feature Flags — يخفي أي عنصر عليه `flag`
 * والـ flag ده مش مفعّل. عنصر بدون `flag` يظهر دائمًا (backwards compat).
 *
 * `enabledFlags` = مجموعة أسماء الـ flags المفعّلة للمستخدم الحالي.
 */
export function filterNavByFlags(
  groups: NavGroup[],
  enabledFlags: ReadonlySet<string>
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.flag || enabledFlags.has(it.flag)),
    }))
    .filter((g) => g.items.length > 0);
}

/** يجمع فلترتين معًا (role + flags) في تمريرة واحدة. */
export function filterNav(
  groups: NavGroup[],
  role: string | null | undefined,
  enabledFlags: ReadonlySet<string>
): NavGroup[] {
  return filterNavByFlags(filterNavByRole(groups, role), enabledFlags);
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { href: "/dashboard", label: "نظرة عامة", labelKey: "nav.overview", icon: LayoutDashboard },
      { href: "/dashboard/executive", label: "غرفة القيادة", labelKey: "nav.executive", icon: Activity },
    ],
  },
  {
    title: "مساحة العمل",
    titleKey: "nav.group.workspace",
    items: [
      { href: "/dashboard/prospects", label: "قاعدة الاستهداف", labelKey: "nav.prospects", icon: Target },
      { href: "/dashboard/leads", label: "العملاء المحتملون", labelKey: "nav.leads", icon: Users },
      { href: "/dashboard/clients", label: "العملاء", labelKey: "nav.clients", icon: Building2 },
      { href: "/dashboard/projects", label: "المشاريع", labelKey: "nav.projects", icon: FolderKanban },
      { href: "/dashboard/workspace", label: "مساحتي", labelKey: "nav.workspace", icon: ListChecks },
      { href: "/dashboard/tasks", label: "المهام", labelKey: "nav.tasks", icon: CheckSquare },
      { href: "/dashboard/collaboration", label: "التعاون", labelKey: "nav.collaboration", icon: MessagesSquare },
    ],
  },
  {
    title: "الذكاء والأتمتة",
    titleKey: "nav.group.intelligence",
    items: [
      { href: "/dashboard/organizational-intelligence", label: "الذكاء التنظيمي", labelKey: "nav.organizationalIntelligence", icon: Brain },
      { href: "/dashboard/migration-sources", label: "اكتشاف الترحيل", labelKey: "nav.migrationSources", icon: DatabaseZap, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/migration-mapping", label: "Mapping الترحيل", labelKey: "nav.migrationMapping", icon: GitBranch, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/data-quality", label: "جودة البيانات", labelKey: "nav.dataQuality", icon: Sparkles, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/transformation", label: "محرّك التحويل", labelKey: "nav.transformation", icon: Wand2, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/migration-simulation", label: "محاكاة الترحيل", labelKey: "nav.migrationSimulation", icon: FlaskConical, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/production-migration", label: "الترحيل الحقيقي", labelKey: "nav.productionMigration", icon: Rocket, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/go-live", label: "التحقّق والإطلاق", labelKey: "nav.goLive", icon: BadgeCheck, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/hypercare", label: "Hypercare والتحسين", labelKey: "nav.hypercare", icon: HeartPulse, roles: ["owner", "admin", "supervisor"], flag: "extended_technical_delivery" },
      { href: "/dashboard/automations", label: "الأتمتة", labelKey: "nav.automations", icon: Workflow },
    ],
  },
  {
    title: "الإعداد",
    titleKey: "nav.group.setup",
    items: [
      { href: "/dashboard/templates", label: "قوالب الاكتشاف", labelKey: "nav.templates", icon: LayoutTemplate },
      { href: "/dashboard/settings", label: "الإعدادات", labelKey: "nav.settings", icon: Settings },
      { href: "/dashboard/help", label: "دليل الاستخدام", labelKey: "nav.help", icon: BookOpen },
    ],
  },
];

/** كل العناصر مسطّحة (لِـ Drawer الموبايل البسيط). */
export const NAV_ITEMS_FLAT: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}
