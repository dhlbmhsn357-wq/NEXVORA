import PptxGenJS from "pptxgenjs";
import type {
  MeetingPresentation,
  MeetingPresentationSlides,
  MeetingPresentationSlideKey,
} from "@/lib/types/database";
import { SLIDE_LABELS_AR } from "@/lib/ai/prompts/meeting-presentation";

// ============================================================
// نفس لوحة ألوان عرض العميل — Navy/Ink + Accent Blue، بمستوى استشاري.
// ============================================================
const NAVY = "0F1B3D";
const ACCENT = "3D5CFF";
const ACCENT_SOFT = "A8BCFF";
const WHITE = "FFFFFF";
const SLATE = "475569";
const SLATE_LIGHT = "94A3B8";
const SURFACE = "F6F8FC";
const BORDER = "E2E8F0";
const GREEN = "16A34A";

const FONT = "Tajawal";
const FONT_LATIN = "Inter";

const SLIDE_ORDER: MeetingPresentationSlideKey[] = [
  "cover", "executive_summary", "business_problem", "business_goals",
  "current_workflow", "future_workflow", "actors", "modules", "screens",
  "architecture", "timeline", "risks", "open_questions", "client_decisions",
  "final_summary",
];

function isArabic(text: string): boolean {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const la = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar >= la;
}
function dir(text: string): { align: "right" | "left"; rtlMode: boolean; fontFace: string } {
  return isArabic(text)
    ? { align: "right", rtlMode: true, fontFace: FONT }
    : { align: "left", rtlMode: false, fontFace: FONT_LATIN };
}

function footer(slide: PptxGenJS.Slide, i: number, total: number) {
  slide.addText("VELORA", { x: 0.5, y: 7.05, w: 3, h: 0.3, fontSize: 9, bold: true, color: SLATE_LIGHT, fontFace: FONT_LATIN });
  slide.addText(`${i} / ${total}`, { x: 9.83, y: 7.05, w: 3, h: 0.3, fontSize: 9, color: SLATE_LIGHT, align: "right", fontFace: FONT_LATIN });
}

function heading(slide: PptxGenJS.Slide, title: string, kicker: string) {
  slide.addText(kicker.toUpperCase(), { x: 0.6, y: 0.45, w: 12.13, h: 0.35, fontSize: 12, bold: true, color: ACCENT, align: "right", fontFace: FONT_LATIN, charSpacing: 1 });
  const d = dir(title);
  slide.addText(title, { x: 0.6, y: 0.82, w: 12.13, h: 0.8, fontSize: 26, bold: true, color: NAVY, align: d.align, rtlMode: d.rtlMode, fontFace: d.fontFace });
  slide.addShape("rect", { x: 12.13, y: 1.62, w: 0.6, h: 0.05, fill: { color: ACCENT } });
}

function bullets(slide: PptxGenJS.Slide, items: string[], y = 2.0, h = 4.6) {
  const rows = items.length ? items : ["—"];
  slide.addText(
    rows.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 12 }, ...dir(t), fontSize: 15, color: SLATE, paraSpaceAfter: 8 } })),
    { x: 0.6, y, w: 12.13, h, valign: "top" }
  );
}

function paragraph(slide: PptxGenJS.Slide, text: string, y = 2.0, h = 1.5, fontSize = 16) {
  const d = dir(text);
  slide.addText(text || "—", { x: 0.6, y, w: 12.13, h, fontSize, color: SLATE, align: d.align, rtlMode: d.rtlMode, fontFace: d.fontFace, valign: "top" });
}

// ---------------------------- per-slide builders ----------------------------

function buildCover(pptx: PptxGenJS, s: MeetingPresentationSlides, projectName: string, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: NAVY };
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: ACCENT } });
  slide.addText("VELORA", { x: 0.8, y: 0.6, w: 5, h: 0.5, fontSize: 16, bold: true, color: ACCENT_SOFT, fontFace: FONT_LATIN, charSpacing: 2 });

  const c = s.cover;
  const mainTitle = c?.project_name || projectName || title;
  const dt = dir(mainTitle);
  slide.addText(mainTitle, { x: 0.8, y: 2.5, w: 11.7, h: 1.4, fontSize: 42, bold: true, color: WHITE, align: dt.align, rtlMode: dt.rtlMode, fontFace: dt.fontFace, valign: "top" });
  slide.addText(title, { x: 0.8, y: 3.9, w: 11.7, h: 0.7, fontSize: 20, color: ACCENT_SOFT, ...dir(title) });

  slide.addShape("rect", { x: 0.8, y: 5.4, w: 0.6, h: 0.03, fill: { color: ACCENT } });
  const meta: string[] = [];
  if (c?.client_name) meta.push(c.client_name);
  if (c?.pm_name) meta.push(`مدير المنتج: ${c.pm_name}`);
  if (c?.current_phase) meta.push(`المرحلة: ${c.current_phase}`);
  if (c?.meeting_date) meta.push(c.meeting_date);
  slide.addText(meta.join("  ·  ") || projectName, { x: 0.8, y: 5.6, w: 11, h: 0.5, fontSize: 14, color: WHITE, ...dir(meta.join(" ")) });
  if (typeof c?.progress_percent === "number") {
    slide.addText(`الجاهزية: ${c.progress_percent}%`, { x: 0.8, y: 6.2, w: 6, h: 0.4, fontSize: 12, color: SLATE_LIGHT, align: "right", rtlMode: true, fontFace: FONT });
  }
}

function buildSimple(pptx: PptxGenJS, key: MeetingPresentationSlideKey, render: (slide: PptxGenJS.Slide) => void) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  heading(slide, SLIDE_LABELS_AR[key], key.replace(/_/g, " "));
  render(slide);
  return slide;
}

/** جدول عام بسيط (RTL). rows[0] = العناوين. */
function addTable(slide: PptxGenJS.Slide, rows: string[][], y = 2.0) {
  const table = rows.map((r, ri) =>
    r.map((cell) => ({
      text: cell,
      options: {
        ...dir(cell),
        fontSize: ri === 0 ? 12 : 12,
        bold: ri === 0,
        color: ri === 0 ? WHITE : SLATE,
        fill: { color: ri === 0 ? NAVY : ri % 2 === 0 ? SURFACE : WHITE },
        valign: "middle" as const,
      },
    }))
  );
  slide.addTable(table, { x: 0.6, y, w: 12.13, border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.4, autoPage: false });
}

export async function generateMeetingPptxBuffer(
  pres: MeetingPresentation,
  projectName: string
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.rtlMode = true;

  const s = pres.slides ?? {};
  const total = SLIDE_ORDER.length;

  SLIDE_ORDER.forEach((key, idx) => {
    const num = idx + 1;
    let slide: PptxGenJS.Slide | null = null;

    switch (key) {
      case "cover":
        buildCover(pptx, s, projectName, pres.title);
        return; // no footer on cover
      case "executive_summary":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.executive_summary;
          paragraph(sl, c?.summary ?? "—", 2.0, 1.6);
          if (c?.key_points?.length) bullets(sl, c.key_points, 3.7, 3.0);
        });
        break;
      case "business_problem":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.business_problem;
          paragraph(sl, c?.problem_statement ?? "—", 2.0, 1.2);
          if (c?.pain_points?.length) {
            addTable(sl, [["نقطة الألم", "الحدّة"], ...c.pain_points.map((p) => [p.title, p.severity])], 3.3);
          }
          if (c?.business_impact) paragraph(sl, `الأثر: ${c.business_impact}`, 5.9, 1.0, 13);
        });
        break;
      case "business_goals":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.business_goals;
          if (c?.goals?.length) {
            addTable(sl, [["الهدف", "الأولوية", "التقدّم", "الناتج المتوقع"], ...c.goals.map((g) => [g.title, g.priority, `${g.progress_percent}%`, g.expected_outcome])], 2.0);
          }
          if (c?.kpis?.length) {
            sl.addText("مؤشرات الأداء (KPIs)", { x: 0.6, y: 5.2, w: 12.13, h: 0.4, fontSize: 14, bold: true, color: NAVY, align: "right", rtlMode: true, fontFace: FONT });
            bullets(sl, c.kpis.map((k) => `${k.name}: ${k.target}`), 5.6, 1.3);
          }
        });
        break;
      case "current_workflow":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.current_workflow;
          bullets(sl, (c?.steps ?? []).map((st, i) => `${i + 1}. ${st.title} — ${st.description}`));
        });
        break;
      case "future_workflow":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.future_workflow;
          bullets(sl, (c?.steps ?? []).map((st, i) => `${i + 1}. ${st.title} — ${st.description}`), 2.0, 3.0);
          if (c?.improvements?.length) {
            sl.addText("التحسينات المتوقعة", { x: 0.6, y: 5.1, w: 12.13, h: 0.4, fontSize: 14, bold: true, color: GREEN, align: "right", rtlMode: true, fontFace: FONT });
            bullets(sl, c.improvements, 5.5, 1.4);
          }
        });
        break;
      case "actors":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.actors;
          addTable(sl, [["الطرف", "المسؤوليات", "الصلاحيات"], ...(c?.actors ?? []).map((a) => [a.name, a.responsibilities.join("، "), a.permissions.join("، ")])], 2.0);
        });
        break;
      case "modules":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.modules;
          addTable(sl, [["الوحدة", "الغرض", "الأولوية", "التعقيد"], ...(c?.modules ?? []).map((m) => [m.name, m.purpose, m.priority, m.complexity])], 2.0);
        });
        break;
      case "screens":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.screens;
          bullets(sl, (c?.screens ?? []).map((sc) => `${sc.name} — ${sc.goal}${sc.functions.length ? ` (${sc.functions.join("، ")})` : ""}`));
        });
        break;
      case "architecture":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.architecture;
          const rows: string[][] = [["المكوّن", "التقنية"]];
          if (c) {
            rows.push(["الواجهة", c.frontend], ["الخلفية", c.backend], ["قاعدة البيانات", c.database], ["التخزين", c.storage], ["المصادقة", c.authentication]);
            if (c.integrations?.length) rows.push(["التكاملات", c.integrations.join("، ")]);
          }
          addTable(sl, rows, 2.0);
        });
        break;
      case "timeline":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.timeline;
          addTable(sl, [["المرحلة", "التاريخ", "التقدّم"], ...(c?.milestones ?? []).map((m) => [m.title, m.date ?? "—", `${m.progress_percent}%`])], 2.0);
        });
        break;
      case "risks":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.risks;
          addTable(sl, [["المخاطرة", "الاحتمال", "الأثر", "الإجراء"], ...(c?.risks ?? []).map((r) => [r.title, r.probability, r.impact, r.mitigation])], 2.0);
        });
        break;
      case "open_questions":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.open_questions;
          bullets(sl, (c?.questions ?? []).map((q) => `${q.question}${q.context ? ` — ${q.context}` : ""}`));
        });
        break;
      case "client_decisions":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.client_decisions;
          addTable(sl, [["القرار", "التاريخ", "المبرّر"], ...(c?.decisions ?? []).map((d) => [d.decision, d.date ?? "—", d.rationale])], 2.0);
        });
        break;
      case "final_summary":
        slide = buildSimple(pptx, key, (sl) => {
          const c = s.final_summary;
          if (c?.next_steps?.length) {
            sl.addText("الخطوات القادمة", { x: 0.6, y: 2.0, w: 12.13, h: 0.4, fontSize: 14, bold: true, color: NAVY, align: "right", rtlMode: true, fontFace: FONT });
            bullets(sl, c.next_steps, 2.4, 2.0);
          }
          if (c?.meeting_objectives?.length) {
            sl.addText("أهداف الاجتماع", { x: 0.6, y: 4.5, w: 12.13, h: 0.4, fontSize: 14, bold: true, color: NAVY, align: "right", rtlMode: true, fontFace: FONT });
            bullets(sl, c.meeting_objectives, 4.9, 1.4);
          }
          if (c?.closing_note) paragraph(sl, c.closing_note, 6.3, 0.8, 13);
        });
        break;
      default:
        slide = buildSimple(pptx, key, () => {});
    }

    if (slide) footer(slide, num, total);
  });

  // pptxgenjs يرجّع ArrayBuffer/Blob حسب البيئة — نطلب nodebuffer صراحة
  const out = (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
  return out;
}
