"use client";

import { useState } from "react";
import {
  BookOpen, Compass, Command, Users, ClipboardList, Mic, Brain, Sparkles, ShieldCheck,
  FileText, Terminal, ClipboardCheck, GitBranch, MonitorPlay, Activity,
  Headset, MessagesSquare, ListChecks, Workflow, KeyRound, Package, Rocket, Search,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

/**
 * دليل الاستخدام الشامل — مرجع كامل لمنفّذ جديد يبدأ من الصفر: بداية سريعة،
 * التنقّل، دورة حياة المشروع كاملة بالتفصيل، والموديولات العرضية. محتوى فقط.
 */

interface GuideItem {
  title: string;
  icon: LucideIcon;
  body: string; // يدعم أسطر متعددة (\n)
  tag?: string;
}
interface GuideCategory {
  key: string;
  label: string;
  description: string;
  items: GuideItem[];
}

const GUIDE: GuideCategory[] = [
  {
    key: "start",
    label: "ابدأ من هنا",
    description: "لو دخلت المنصة لأول مرة، الأقسام دي بتوصّلك لصورة كاملة في دقائق.",
    items: [
      {
        title: "ما هي VELORA؟",
        icon: Rocket,
        body:
          "VELORA مش أداة إدارة مشاريع عادية — دي نظام تشغيل كامل للشركة. بتمشّي أي منتج برمجي من أول عميل محتمل (Lead) لحد الدعم بعد الإطلاق، وكل خطوة فيها ذكاء اصطناعي بيساعدك: تحليل، توليد مستندات، مراجعة كود، مراقبة إنتاج، وذاكرة تنظيمية بتتعلّم من كل مشروع.\n\nالفكرة الأساسية: كل شغلك مترابط. الاجتماع بيغذّي الـ Brain، والـ Brain بيغذّي الـ PRD، والـ PRD بيغذّي البرومبت… وهكذا. إنت بتراجع وتعتمد، والنظام بيربط الباقي.",
      },
      {
        title: "أول 10 دقائق للمنفّذ الجديد",
        icon: Compass,
        body:
          "1) بُص على «نظرة عامة» (الصفحة الرئيسية) — بتلاقي فيها المهام اللي محتاجة انتباهك دلوقتي.\n2) افتح «مساحتي» — دي كل المشاريع والمهام المكلّف بيها إنت شخصيًا.\n3) افتح أي مشروع من «المشاريع» — هتلاقي شريط مراحل أفقي (Workflow) بيوضّح فين المشروع دلوقتي وإيه اللي بعده.\n4) جرّب البحث السريع بـ Ctrl+K للوصول لأي صفحة فورًا.\n5) ارجع للدليل ده أي وقت من «دليل الاستخدام» في الشريط الجانبي.",
      },
      {
        title: "الأدوار والصلاحيات",
        icon: KeyRound,
        body:
          "المنصة فيها 4 مستويات: مالك النظام (owner) ← مدير (admin) ← مشرف (supervisor) ← عضو (member). كل مستوى أعلى بيرث صلاحيات اللي تحته.\n\nبعض الشاشات محصورة للإدارة فقط (زي «غرفة القيادة» والإعدادات وإدارة المستخدمين). لو مش شايف شاشة معيّنة، غالبًا دورك مش مصرّح له بيها — كلّم مسؤول النظام.",
        tag: "إدارة",
      },
    ],
  },
  {
    key: "nav",
    label: "التنقّل داخل المنصة",
    description: "إزاي تتحرّك بسرعة واحتراف بين كل أجزاء النظام.",
    items: [
      {
        title: "الشريط الجانبي (Sidebar)",
        icon: Compass,
        body:
          "التنقّل الأساسي على اليمين، مقسّم لأقسام: مساحة العمل (العملاء/المشاريع/مساحتي/التعاون)، الذكاء والأتمتة، والإعداد. تقدر تطويه (أيقونات فقط) بزر الطي فوق — واختيارك بيتحفظ.\n\nتقدر تثبّت أي وحدة بتستخدمها كتير (أيقونة النجمة ⭐) فتظهر في قسم «المثبّتة» فوق، والوحدات اللي زرتها مؤخرًا بتظهر في «الأخيرة».",
      },
      {
        title: "البحث السريع (Command Palette)",
        icon: Command,
        body:
          "اضغط Ctrl+K (أو ⌘K على ماك) من أي مكان — بتفتح لوحة أوامر تكتب فيها اسم أي صفحة/وحدة وتضغط Enter توصلها فورًا، بدون ما تدوّر في القوائم. اتحرّك بالأسهم، Enter يفتح، Esc يقفل.",
      },
      {
        title: "الإشعارات",
        icon: Activity,
        body:
          "جرس الإشعارات فوق بيجمّع كل اللي محتاج انتباهك: مراجعات محظورة، طلبات دعم، حوادث إنتاج، تصعيدات، مهام متأخّرة… مصنّفة بالخطورة. للسجل الكامل مع البحث والفلترة والأرشفة، افتح «كل الإشعارات».",
      },
    ],
  },
  {
    key: "lifecycle",
    label: "دورة حياة المشروع (بالترتيب)",
    description: "الرحلة الكاملة من أول عميل لحد الإطلاق. مش كل خطوة إلزامية — استخدم اللي يناسب حالتك.",
    items: [
      {
        title: "١. العميل المحتمل (Lead)",
        icon: Users,
        body:
          "أي عميل جديد بيبدأ من «العملاء المحتملون». سجّل بياناته وتابع حالته. لما التعامل يتأكد، اضغط «تحويل لمشروع» — بيتعمل مشروع جديد تلقائيًا، وإنت بتبقى عضو الفريق ومالك المشروع، وبتتفتح قنوات التعاون الخاصة به.",
      },
      {
        title: "٢. الاكتشاف (Discovery)",
        icon: ClipboardList,
        body:
          "افتح المشروع → تبويب «الاكتشاف». تقدر تبعت للعميل نموذج اكتشاف (Discovery Form) عبر رابط/واتساب — العميل يملأه بنفسه. تقدر تعمل أكثر من جلسة اكتشاف للمشروع الواحد، والنظام بيجمّع كل الإجابات.\n\nكمان فيه مولّد نماذج ذكي: بيقترح أسئلة مناسبة لمجال المشروع تلقائيًا.",
      },
      {
        title: "٣. تحليل الاكتشاف",
        icon: Sparkles,
        body:
          "بعد ما العميل يرسل النموذج، بيتشغّل تحليل AI تلقائي يستخرج: الأهداف، الجمهور، المتطلبات، المخاطر، والفرص — مع درجة ثقة ودليل (evidence) لكل نقطة. راجع النتيجة، وتقدر تعيد التحليل يدويًا لو ضفت جلسات جديدة.",
        tag: "AI",
      },
      {
        title: "٤. تجهيز الاجتماع + الاجتماعات",
        icon: Mic,
        body:
          "«تجهيز الاجتماع»: النظام بيولّد أجندة وأسئلة ونقاط تحضير قبل أي اجتماع مع العميل.\n\n«الاجتماعات»: ابعت تسجيل صوتي لبوت Telegram مع كود المشروع في الـ Caption — النظام بيفرّغه ويستخرج القرارات/المخاطر/الطلبات ويحدّث Project Brain تلقائيًا. تقدر كمان تبدأ اجتماع مباشر (Live) وترفع مرفقات.",
        tag: "AI",
      },
      {
        title: "٥. عرض العميل (Client Presentation)",
        icon: MonitorPlay,
        body:
          "ولّد عرضًا تقديميًا احترافيًا (15 شريحة منظّمة) من بيانات المشروع — ملخص تنفيذي، نطاق، مخاطر، خطة. تقدر تشارك رابط عام Read-Only للعميل، أو تصدّره PPTX.",
        tag: "AI",
      },
      {
        title: "٦. Project Brain (عقل المشروع)",
        icon: Brain,
        body:
          "ده المصدر الموحّد للحقيقة عن المشروع — بيتجمّع تلقائيًا من الاكتشاف والاجتماعات في 19 قسمًا (أهداف، متطلبات وظيفية/غير وظيفية، قواعد عمل، مخاطر، افتراضات…). أي تغيير من مصدر خارجي بيدخل كـ «تغيير معلّق» تراجعه وتعتمده أو ترفضه — عشان الـ Brain يفضل دقيق. لازم تعتمد الـ Brain قبل ما تكمّل لأي مرحلة بعده.",
        tag: "AI",
      },
      {
        title: "٧. التوصيات الذكية (Smart Recommendations)",
        icon: Sparkles,
        body:
          "بعد اعتماد الـ Brain، النظام بيولّد توصيات مبنية على مشاريع سابقة مشابهة + شبكة المعرفة: وحدات ناقصة، مخاطر متكررة، تحسينات معمارية. كل توصية عليها أولوية وقيمة عمل وأدلة. راجعها واقبل/ارفض — التوصيات المقبولة بتدخل في الـ PRD. (فيه كمان «الذكاء المعماري» بيفحص نواقص التصميم قبل الـ PRD.)",
        tag: "AI",
      },
      {
        title: "٨. مراجعة الـ Brain (Brain Review)",
        icon: ShieldCheck,
        body:
          "مساحة اعتماد تنفيذية: بتراجع كل عناصر الـ Brain، التعارضات، تحليل الأثر، وتحطّ تعليقات. لازم تعدّي بوّابة المراجعة (كل التوصيات محسومة، لا تعارضات حرجة) قبل توليد الـ PRD.",
        tag: "إدارة",
      },
      {
        title: "٩. PRD",
        icon: FileText,
        body:
          "لما الـ Brain يكون معتمد وكافي، ولّد الـ PRD — مستند متطلبات كامل. راجع كل قسم، عدّل يدويًا لو محتاج. الـ PRD بيقرأ آخر نسخة معتمدة من الـ Brain + التوصيات المقبولة، فبيطلع متّسق مع كل قراراتك.",
        tag: "AI",
      },
      {
        title: "١٠. Prototype Prompt",
        icon: Terminal,
        body:
          "بعد اعتماد الـ PRD، ولّد برومبت جاهز تستخدمه مباشرة داخل Claude Code لبناء الـ Prototype. فيه نسختين: برومبت واحد شامل، أو Pipeline مقسّم لمراحل تنفيذ متسلسلة (أفضل للمشاريع الكبيرة).",
        tag: "AI",
      },
      {
        title: "١١. Prompt Studio & Prompt Review",
        icon: Terminal,
        body:
          "Prompt Studio: مساحة صقل البرومبتات بإطار موحّد + درجات جودة وأمان. Prompt Review: مراجعة البرومبتات المولّدة مجمّعة حسب الأولوية مع تقدير مجهود التنفيذ والملفات المتأثرة.",
        tag: "AI",
      },
      {
        title: "١٢. Prototype Review",
        icon: ClipboardCheck,
        body:
          "بعد ما يتبني جزء من الكود، حط رابط الـ Repository وشغّل مراجعة — النظام بيقارن الكود الفعلي بمتطلبات الـ PRD ويطلّع تقرير فجوات (Gap Report): إيه اللي اتنفّذ، إيه الناقص، وإيه اللي محتاج تعديل، مع أدلة.",
        tag: "AI",
      },
      {
        title: "١٣. تنفيذ الكود (AI Code Execution)",
        icon: GitBranch,
        body:
          "من «Prompt Review / تنفيذ الكود» تقدر تحوّل البرومبت لخطة تنفيذ ومهام، ويشتغل محرّك تنفيذ (Claude) مهمة-بمهمة في الخلفية مع إعادة محاولة تلقائية، متبوعًا بحلقة إصلاح مدفوعة بالـ QA، وبوّابة Release Candidate.",
        tag: "AI",
      },
      {
        title: "١٤. Developer Handoff",
        icon: Package,
        body:
          "قبل التسليم، ولّد حزمة توثيق هندسي كاملة لفريق التطوير: ملخص معماري، خارطة تنفيذ، تبعيات، معايير قبول، ملاحظات تقنية. (محتاج Prototype Review معتمد الأول.)",
        tag: "AI",
      },
    ],
  },
  {
    key: "quality",
    label: "الجودة والإنتاج",
    description: "التأكد من جودة الكود، ومراقبة المنتج بعد الإطلاق، والدعم.",
    items: [
      {
        title: "Engineering QA (كونسول الجودة)",
        icon: ClipboardCheck,
        body:
          "مراجعة هندسية شاملة على 7 فئات: مراجعة ثابتة، أمان، قاعدة بيانات، معمارية، جودة كود، مطابقة PRD، وأداء — بالإضافة للفحص الوظيفي بالمتصفح. كل مشكلة (Finding) ليها خطورة ملوّنة، ملف/سطر، وأدلة. فيه فلترة وترتيب حسب الخطورة وشهادة جودة (Certificate) بدرجة.",
        tag: "AI",
      },
      {
        title: "Engineering QA Review",
        icon: ShieldCheck,
        body:
          "مساحة تحقّق: بتقارن المراجعة الحالية بالسابقة — إيه اللي اتحل، إيه الباقي، وأي Regression جديد. المدير بيعتمد أو يرفض في النهاية.",
        tag: "إدارة",
      },
      {
        title: "مراقبة الإنتاج (Production Monitoring)",
        icon: Activity,
        body:
          "بعد الإطلاق، حط رابط Production واشغّل فحص — فحوصات خفيفة وآمنة (Read-Only) بتقيس Health/Performance/زمن الاستجابة، وبتكتشف الحوادث تلقائيًا مع تحليل السبب الجذري واقتراح حلول. فيه Trend Analysis واكتشاف Regression وإشارات Supabase حقيقية.",
        tag: "AI",
      },
      {
        title: "الدعم (Support)",
        icon: Headset,
        body:
          "فعّل الـ Support Widget وضمّنه في موقع العميل. أي بلاغ بيتصنّف بالـ AI ويتصعّد تلقائيًا لو محتاج تدخل بشري. تقدر تحوّل بلاغ لحادثة إنتاج، وكل بلاغ بيحمل تشخيص المتصفح/البيئة.",
        tag: "AI",
      },
    ],
  },
  {
    key: "workspace",
    label: "مساحة العمل والتعاون",
    description: "الأدوات العرضية اللي بتستخدمها عبر كل المشاريع كل يوم.",
    items: [
      {
        title: "إدارة المهام (Work Management)",
        icon: ListChecks,
        body:
          "لكل مشروع لوحة مهام (Kanban/قائمة/جدول) مع أولويات، مكلّفين، مواعيد، تبعيات، مهام فرعية، وتعليقات. أي بند من أي مصدر (Finding، توصية، اجتماع…) بيتحوّل لمهمة عبر طبقة تنفيذ موحّدة. مهامك كلها بتظهر مجمّعة في «مساحتي».",
      },
      {
        title: "التعاون (Collaboration)",
        icon: MessagesSquare,
        body:
          "مركز تواصل الشركة: قنوات لكل مشروع + قنوات أقسام + إعلانات + رسائل مباشرة. بيدعم Threads، تفاعلات، منشن، مرفقات، Markdown، تثبيت رسائل، بحث، وتلخيص AI. تقدر تحوّل أي رسالة لعنصر معرفة في الـ Brain أو مهمة أو تذكرة دعم مباشرة.",
      },
      {
        title: "الفريق وإدارة المشروع",
        icon: Users,
        body:
          "من داخل المشروع تقدر تعيّن أعضاء الفريق بأدوارهم، وتحدّد ملكية المشروع ومراحل التسليم واعتماداتها. صحة المشروع وأحمال الفريق بتتحسب تلقائيًا وبتظهر في لوحة التسليم.",
      },
    ],
  },
  {
    key: "intelligence",
    label: "الذكاء والأتمتة والإدارة",
    description: "الطبقات اللي بتخلّي المنصة تشتغل بنفسها وتتعلّم وتراقب الشركة كلها.",
    items: [
      {
        title: "الأتمتة (Workflow Automation)",
        icon: Workflow,
        body:
          "المنصة event-driven: أي حدث مهم (اكتمال مهمة، اعتماد تسليم، حادثة حرجة…) بيطلق Workflows تلقائية بتعمل مهام/إشعارات/تصعيد وتسجّل كل ده. فيه تصعيد تلقائي للبنود المتأخّرة (منفّذ ← مشرف ← إدارة) وتحليل AI لأداء الأتمتة. شوفها في «الأتمتة».",
        tag: "AI",
      },
      {
        title: "الذكاء التنظيمي (Organizational Intelligence)",
        icon: Brain,
        body:
          "ذاكرة الشركة: بتستخرج معرفة قابلة لإعادة الاستخدام من كل مشروع منتهي (أنماط، دروس، قرارات، مكتبة وحدات) — أدلة حقيقية فقط، صفر اختلاق. لما تبدأ مشروع مشابه، بتستفيد من خبرة كل المشاريع السابقة تلقائيًا. فيه بحث دلالي ومستشار منتج AI.",
        tag: "AI",
      },
      {
        title: "غرفة القيادة (Executive)",
        icon: Activity,
        body:
          "العقل التنفيذي (COO) — للإدارة فقط: درجة صحة الشركة كاملة، KPIs، مساعد AI بتسأله عن حالة الشركة والمخاطر والأولويات (إجابات مبنية على بيانات حقيقية)، وتقارير تنفيذية (أسبوعي/شهري/مخاطر) + تنبيهات تنفيذية.",
        tag: "إدارة · AI",
      },
      {
        title: "الإعدادات (Settings)",
        icon: KeyRound,
        body:
          "للإدارة: اختيار مزوّد الذكاء الاصطناعي والموديل لكل نوع مهمة، إعدادات الـ Brain، إدارة المستخدمين (إنشاء/قفل/تعطيل/إعادة تعيين كلمة السر/تغيير الدور)، والتكاملات الخارجية.",
        tag: "إدارة",
      },
    ],
  },
];

const TAG_TONE: Record<string, string> = {
  AI: "var(--v-info)",
  "إدارة": "var(--v-amber)",
  "إدارة · AI": "var(--v-amber)",
};

/** قسم «الذكاء والأتمتة والإدارة» يظهر لـ owner/admin فقط. */
export default function HelpGuide({ isAdmin }: { isAdmin: boolean }) {
  // مفتوح افتراضيًا: أول عنصر في أول قسم.
  const [open, setOpen] = useState<string | null>("start:0");
  const categories = GUIDE.filter((c) => c.key !== "intelligence" || isAdmin);

  return (
    <div>
      <PageHeader
        title="دليل الاستخدام"
        icon={BookOpen}
        description="مرجع شامل يمشّيك من الصفر لإتقان المنصة — البداية السريعة، التنقّل، دورة حياة المشروع كاملة، وكل الموديولات. مش كل خطوة إلزامية؛ استخدم اللي يناسب حالتك."
      />

      <div className="space-y-8">
        {categories.map((cat) => (
          <section key={cat.key}>
            <div className="mb-3">
              <h2 className="text-h3 font-bold text-[var(--v-text)]">{cat.label}</h2>
              <p className="mt-0.5 text-small text-[var(--v-text-muted)]">{cat.description}</p>
            </div>

            <div className="space-y-2">
              {cat.items.map((item, i) => {
                const id = `${cat.key}:${i}`;
                const isOpen = open === id;
                const Icon = item.icon;
                return (
                  <div
                    key={id}
                    className="overflow-hidden rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] transition-shadow hover:shadow-[var(--v-shadow-sm)]"
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 p-4 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v-radius-md)] transition ${
                          isOpen ? "bg-[var(--v-primary)] text-white" : "bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                        }`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-card-title text-[var(--v-text)]">{item.title}</span>
                          {item.tag && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: TAG_TONE[item.tag] ?? "var(--v-text-muted)", background: "var(--v-surface)" }}>
                              {item.tag}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-[var(--v-text-subtle)]">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <p className="whitespace-pre-line border-t border-[var(--v-border)] p-4 text-body leading-relaxed text-[var(--v-text-secondary)]">
                        {item.body}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
          <h2 className="flex items-center gap-2 text-h3 font-bold text-[var(--v-text)]"><Search size={18} className="text-[var(--v-primary)]" /> نصيحة أخيرة</h2>
          <p className="mt-2 text-body leading-relaxed text-[var(--v-text-secondary)]">
            مش لازم تحفظ كل ده. افتكر مبدأ واحد: <strong>كل شغل مترابط</strong> — إنت بتراجع وتعتمد في كل مرحلة، والنظام بيربط الباقي ويذكّرك باللي محتاج انتباهك عبر الإشعارات و«نظرة عامة». ولو تُهت، Ctrl+K بيوصّلك لأي مكان.
          </p>
        </section>
      </div>
    </div>
  );
}
