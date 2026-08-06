import PptxGenJS from "pptxgenjs";
import type { ClientPresentationSlides } from "@/lib/types/database";

// ============================================================
// Design tokens — لوحة ألوان استشارية هادئة (Navy/Ink + Accent Blue)
// بمستوى Stripe/Notion/Linear: تباين عالي، مساحات بيضاء واسعة،
// بدون تدرجات صاخبة أو زخرفة غير وظيفية.
// ============================================================
const INK = "0B1220";
const NAVY = "0F1B3D";
const ACCENT = "3D5CFF";
const ACCENT_SOFT = "A8BCFF";
const WHITE = "FFFFFF";
const SLATE = "475569";
const SLATE_LIGHT = "94A3B8";
const SURFACE = "F6F8FC";
const BORDER = "E2E8F0";
const GREEN = "16A34A";
const RED = "DC2626";

const FONT = "Tajawal";
const FONT_LATIN = "Inter";

/** لغة النص بيتحدد حرفًا-حرفًا مش على مستوى العرض كله، عشان لو المستخدم
 * كتب أسماء عملاء/مصطلحات إنجليزية وسط محتوى عربي يفضل شكل الشريحة صح. */
function isArabicText(text: string): boolean {
  const arabicChars = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latinChars = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabicChars >= latinChars;
}

function textDir(text: string): { align: "right" | "left"; rtlMode: boolean; fontFace: string } {
  return isArabicText(text)
    ? { align: "right", rtlMode: true, fontFace: FONT }
    : { align: "left", rtlMode: false, fontFace: FONT_LATIN };
}

function addBackground(slide: PptxGenJS.Slide, color: string) {
  slide.background = { color };
}

function addBrandFooter(pptx: PptxGenJS, slide: PptxGenJS.Slide, index: number, total: number) {
  slide.addText("VELORA", {
    x: 0.5,
    y: 7.05,
    w: 3,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: SLATE_LIGHT,
    fontFace: FONT_LATIN,
  });
  slide.addText(`${index} / ${total}`, {
    x: 9.83,
    y: 7.05,
    w: 3,
    h: 0.3,
    fontSize: 9,
    color: SLATE_LIGHT,
    align: "right",
    fontFace: FONT_LATIN,
  });
}

function addHeading(slide: PptxGenJS.Slide, title: string, kicker?: string) {
  const d = textDir(title);
  if (kicker) {
    const kd = textDir(kicker);
    slide.addText(kicker.toUpperCase(), {
      x: 0.6,
      y: 0.45,
      w: 12.13,
      h: 0.35,
      fontSize: 12,
      bold: true,
      color: ACCENT,
      align: kd.align,
      fontFace: FONT_LATIN,
      charSpacing: 1,
    });
  }
  slide.addText(title, {
    x: 0.6,
    y: kicker ? 0.8 : 0.55,
    w: 12.13,
    h: 0.9,
    fontSize: 28,
    bold: true,
    color: NAVY,
    align: d.align,
    rtlMode: d.rtlMode,
    fontFace: d.fontFace,
  });
  slide.addShape("rect", { x: 0.6, y: kicker ? 1.65 : 1.4, w: 1, h: 0.05, fill: { color: ACCENT } });
}

function bodyOptions(text: string, extra: Partial<PptxGenJS.TextPropsOptions> = {}): PptxGenJS.TextPropsOptions {
  const d = textDir(text);
  return { align: d.align, rtlMode: d.rtlMode, fontFace: d.fontFace, ...extra };
}

// ============================================================
// Slide builders — كل شريحة native/editable بالكامل (Text/Shape/Table
// حقيقية، بدون أي صورة نص).
// ============================================================

function buildCover(pptx: PptxGenJS, slides: ClientPresentationSlides, projectName: string): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, NAVY);
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: ACCENT } });

  slide.addText("VELORA", {
    x: 0.8,
    y: 0.6,
    w: 4,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: ACCENT_SOFT,
    fontFace: FONT_LATIN,
    charSpacing: 2,
  });

  slide.addText(slides.cover.title, {
    x: 0.8,
    y: 2.7,
    w: 11.7,
    h: 1.6,
    fontSize: 44,
    bold: true,
    color: WHITE,
    ...bodyOptions(slides.cover.title),
    valign: "top",
  });
  slide.addText(slides.cover.subtitle, {
    x: 0.8,
    y: 4.2,
    w: 11.7,
    h: 0.8,
    fontSize: 20,
    color: ACCENT_SOFT,
    ...bodyOptions(slides.cover.subtitle),
  });

  slide.addShape("rect", { x: 0.8, y: 5.5, w: 0.6, h: 0.03, fill: { color: ACCENT } });
  slide.addText(slides.cover.client_name, {
    x: 0.8,
    y: 5.65,
    w: 8,
    h: 0.5,
    fontSize: 14,
    color: WHITE,
    ...bodyOptions(slides.cover.client_name),
  });
  slide.addText(projectName, {
    x: 0.8,
    y: 6.7,
    w: 8,
    h: 0.4,
    fontSize: 11,
    color: SLATE_LIGHT,
    fontFace: FONT_LATIN,
  });
  return slide;
}

function buildAgenda(pptx: PptxGenJS, items: string[]): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, "جدول الأعمال", "Agenda");

  const rows = items.length > 0 ? items : ["—"];
  const colW = 12.13 / Math.min(rows.length, 2) || 12.13;
  const perCol = Math.ceil(rows.length / 2);
  rows.forEach((item, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = 0.6 + col * (colW + 0.3 > 12.13 ? 6.2 : 6.2);
    const y = 2.1 + row * 0.75;
    const d = textDir(item);
    slide.addShape("ellipse", {
      x: d.align === "right" ? x + 5.6 : x,
      y: y + 0.08,
      w: 0.32,
      h: 0.32,
      fill: { color: ACCENT },
      line: { type: "none" },
    });
    slide.addText(String(i + 1), {
      x: d.align === "right" ? x + 5.6 : x,
      y: y + 0.08,
      w: 0.32,
      h: 0.32,
      fontSize: 12,
      bold: true,
      color: WHITE,
      align: "center",
      valign: "middle",
      fontFace: FONT_LATIN,
    });
    slide.addText(item, {
      x: d.align === "right" ? x : x + 0.5,
      y,
      w: 5.1,
      h: 0.5,
      fontSize: 15,
      color: INK,
      valign: "middle",
      ...bodyOptions(item),
    });
  });
  return slide;
}

function buildTextSlide(
  pptx: PptxGenJS,
  kicker: string,
  title: string,
  body: string,
  bullets?: string[]
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, kicker);

  slide.addText(body, {
    x: 0.6,
    y: 2.0,
    w: 12.13,
    h: bullets && bullets.length > 0 ? 1.6 : 4.2,
    fontSize: 16,
    color: SLATE,
    valign: "top",
    ...bodyOptions(body),
  });

  if (bullets && bullets.length > 0) {
    slide.addText(
      bullets.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 8 } })),
      {
        x: 0.6,
        y: 3.7,
        w: 12.13,
        h: 3.0,
        fontSize: 15,
        color: SLATE,
        valign: "top",
        ...bodyOptions(bullets[0]),
      }
    );
  }
  return slide;
}

function buildBulletSlide(pptx: PptxGenJS, kicker: string, title: string, items: string[]): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, kicker);

  if (items.length === 0) {
    slide.addText("لا توجد بيانات كافية لهذا القسم بعد.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
      ...bodyOptions("لا توجد بيانات كافية لهذا القسم بعد."),
    });
    return slide;
  }

  const cols = items.length > 4 ? 2 : 1;
  const perCol = Math.ceil(items.length / cols);
  items.forEach((item, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const cardW = cols === 2 ? 5.95 : 12.13;
    const x = 0.6 + col * (cardW + 0.3);
    const y = 2.05 + row * 1.0;
    slide.addShape("roundRect", {
      x,
      y,
      w: cardW,
      h: 0.85,
      rectRadius: 0.06,
      fill: { color: SURFACE },
      line: { color: BORDER, width: 0.75 },
    });
    slide.addShape("rect", {
      x: textDir(item).align === "right" ? x + cardW - 0.06 : x,
      y,
      w: 0.06,
      h: 0.85,
      fill: { color: ACCENT },
      line: { type: "none" },
    });
    slide.addText(item, {
      x: x + 0.25,
      y: y + 0.08,
      w: cardW - 0.5,
      h: 0.7,
      fontSize: 13,
      color: INK,
      valign: "middle",
      ...bodyOptions(item),
    });
  });
  return slide;
}

function buildScope(pptx: PptxGenJS, inScope: string[], outOfScope: string[]): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, "نطاق العمل", "Scope");

  const cols: { label: string; items: string[]; color: string }[] = [
    { label: "داخل النطاق", items: inScope, color: GREEN },
    { label: "خارج النطاق الحالي", items: outOfScope, color: SLATE_LIGHT },
  ];

  cols.forEach((c, ci) => {
    const x = 0.6 + ci * 6.25;
    slide.addShape("roundRect", {
      x,
      y: 2.0,
      w: 5.95,
      h: 4.6,
      rectRadius: 0.08,
      fill: { color: SURFACE },
      line: { color: BORDER, width: 0.75 },
    });
    slide.addText(c.label, {
      x: x + 0.3,
      y: 2.2,
      w: 5.35,
      h: 0.5,
      fontSize: 15,
      bold: true,
      color: c.color,
      ...bodyOptions(c.label),
    });
    const list = c.items.length > 0 ? c.items : ["—"];
    slide.addText(
      list.map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true, paraSpaceAfter: 6 } })),
      {
        x: x + 0.3,
        y: 2.8,
        w: 5.35,
        h: 3.6,
        fontSize: 13,
        color: SLATE,
        valign: "top",
        ...bodyOptions(list[0]),
      }
    );
  });
  return slide;
}

function buildTimeline(
  pptx: PptxGenJS,
  title: string,
  phases: ClientPresentationSlides["timeline"]["phases"]
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, "Timeline");

  if (phases.length === 0) {
    slide.addText("لا توجد بيانات جدول زمني كافية بعد.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
    });
    return slide;
  }

  const n = phases.length;
  const trackY = 3.4;
  slide.addShape("line", { x: 0.9, y: trackY, w: 11.5, h: 0, line: { color: BORDER, width: 2 } });

  const spacing = 11.5 / Math.max(n, 1);
  phases.forEach((p, i) => {
    const x = 0.9 + spacing * i;
    slide.addShape("ellipse", {
      x: x + spacing / 2 - 0.12,
      y: trackY - 0.12,
      w: 0.24,
      h: 0.24,
      fill: { color: ACCENT },
      line: { color: WHITE, width: 2 },
    });
    slide.addText(p.name, {
      x: x,
      y: trackY - 1.1,
      w: spacing,
      h: 0.5,
      fontSize: 13,
      bold: true,
      color: NAVY,
      align: "center",
      ...bodyOptions(p.name, { align: "center" }),
    });
    slide.addText(p.duration, {
      x: x,
      y: trackY - 0.62,
      w: spacing,
      h: 0.35,
      fontSize: 10,
      color: ACCENT,
      align: "center",
      fontFace: FONT_LATIN,
    });
    slide.addText(p.description, {
      x: x + 0.05,
      y: trackY + 0.35,
      w: spacing - 0.1,
      h: 1.6,
      fontSize: 10.5,
      color: SLATE,
      align: "center",
      valign: "top",
      ...bodyOptions(p.description, { align: "center" }),
    });
  });
  return slide;
}

function buildArchitecture(pptx: PptxGenJS, slide_: ClientPresentationSlides["architecture"]): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, slide_.title, "Architecture");

  slide.addText(slide_.description, {
    x: 0.6,
    y: 2.0,
    w: 12.13,
    h: 1.1,
    fontSize: 15,
    color: SLATE,
    valign: "top",
    ...bodyOptions(slide_.description),
  });

  const comps = slide_.components.length > 0 ? slide_.components : ["—"];
  const perRow = Math.min(comps.length, 4) || 1;
  const chipW = (12.13 - (perRow - 1) * 0.25) / perRow;
  comps.forEach((c, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = 0.6 + col * (chipW + 0.25);
    const y = 3.3 + row * 1.0;
    slide.addShape("roundRect", {
      x,
      y,
      w: chipW,
      h: 0.8,
      rectRadius: 0.08,
      fill: { color: NAVY },
      line: { type: "none" },
    });
    slide.addText(c, {
      x: x + 0.15,
      y,
      w: chipW - 0.3,
      h: 0.8,
      fontSize: 12,
      bold: true,
      color: WHITE,
      align: "center",
      valign: "middle",
      ...bodyOptions(c, { align: "center" }),
    });
  });
  return slide;
}

function buildRisks(
  pptx: PptxGenJS,
  title: string,
  items: ClientPresentationSlides["risks"]["items"]
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, "Risks & Mitigation");

  if (items.length === 0) {
    slide.addText("لم يتم رصد مخاطر جوهرية حتى الآن.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
    });
    return slide;
  }

  const headerRow: PptxGenJS.TableRow = [
    { text: "الخطر", options: { bold: true, color: WHITE, fill: { color: NAVY }, align: "right", fontFace: FONT } },
    { text: "خطة المواجهة", options: { bold: true, color: WHITE, fill: { color: NAVY }, align: "right", fontFace: FONT } },
  ];
  const rows: PptxGenJS.TableRow[] = items.slice(0, 8).map((it, i) => [
    {
      text: it.risk,
      options: { fill: { color: i % 2 === 0 ? WHITE : SURFACE }, color: RED, bold: true, ...bodyOptions(it.risk) },
    },
    {
      text: it.mitigation,
      options: { fill: { color: i % 2 === 0 ? WHITE : SURFACE }, color: SLATE, ...bodyOptions(it.mitigation) },
    },
  ]);

  slide.addTable([headerRow, ...rows], {
    x: 0.6,
    y: 2.0,
    w: 12.13,
    colW: [5.5, 6.63],
    fontSize: 12,
    border: { type: "solid", color: BORDER, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

function buildRoadmap(
  pptx: PptxGenJS,
  title: string,
  milestones: ClientPresentationSlides["roadmap"]["milestones"]
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, "Roadmap");

  if (milestones.length === 0) {
    slide.addText("لا توجد معالم مستقبلية محددة بعد.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
    });
    return slide;
  }

  milestones.slice(0, 5).forEach((m, i) => {
    const y = 2.0 + i * 1.0;
    slide.addShape("roundRect", {
      x: 0.6,
      y,
      w: 12.13,
      h: 0.85,
      rectRadius: 0.06,
      fill: { color: i === 0 ? NAVY : SURFACE },
      line: { color: BORDER, width: 0.75 },
    });
    slide.addText(m.name, {
      x: 0.9,
      y,
      w: 4.0,
      h: 0.85,
      fontSize: 13,
      bold: true,
      color: i === 0 ? WHITE : NAVY,
      valign: "middle",
      ...bodyOptions(m.name),
    });
    slide.addText(m.target_date, {
      x: 5.0,
      y,
      w: 2.5,
      h: 0.85,
      fontSize: 11,
      color: i === 0 ? ACCENT_SOFT : ACCENT,
      valign: "middle",
      align: "center",
      fontFace: FONT_LATIN,
    });
    slide.addText(m.description, {
      x: 7.6,
      y,
      w: 4.9,
      h: 0.85,
      fontSize: 11,
      color: i === 0 ? WHITE : SLATE,
      valign: "middle",
      ...bodyOptions(m.description),
    });
  });
  return slide;
}

function buildPairTable(
  pptx: PptxGenJS,
  title: string,
  kicker: string,
  leftLabel: string,
  rightLabel: string,
  pairs: { before: string; after: string }[]
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, kicker);

  if (pairs.length === 0) {
    slide.addText("لا توجد بيانات كافية لهذا القسم بعد.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
      ...bodyOptions("لا توجد بيانات كافية لهذا القسم بعد."),
    });
    return slide;
  }

  const headerRow: PptxGenJS.TableRow = [
    { text: leftLabel, options: { bold: true, color: WHITE, fill: { color: SLATE_LIGHT }, align: "right", fontFace: FONT } },
    { text: rightLabel, options: { bold: true, color: WHITE, fill: { color: GREEN }, align: "right", fontFace: FONT } },
  ];
  const rows: PptxGenJS.TableRow[] = pairs.slice(0, 8).map((p, i) => [
    { text: p.before, options: { fill: { color: i % 2 === 0 ? WHITE : SURFACE }, color: SLATE, ...bodyOptions(p.before) } },
    { text: p.after, options: { fill: { color: i % 2 === 0 ? WHITE : SURFACE }, color: NAVY, bold: true, ...bodyOptions(p.after) } },
  ]);

  slide.addTable([headerRow, ...rows], {
    x: 0.6,
    y: 2.0,
    w: 12.13,
    colW: [6.06, 6.07],
    fontSize: 12,
    border: { type: "solid", color: BORDER, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

function buildKpis(
  pptx: PptxGenJS,
  title: string,
  metrics: ClientPresentationSlides["kpis"]["metrics"],
  kicker: string = "KPIs"
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, WHITE);
  addHeading(slide, title, kicker);

  if (metrics.length === 0) {
    slide.addText("لا توجد مؤشرات أداء مرصودة بعد.", {
      x: 0.6,
      y: 2.2,
      w: 12.13,
      h: 0.6,
      fontSize: 15,
      color: SLATE_LIGHT,
      italic: true,
    });
    return slide;
  }

  const items = metrics.slice(0, 6);
  const perRow = items.length > 3 ? 3 : items.length;
  const cardW = (12.13 - (perRow - 1) * 0.3) / perRow;
  items.forEach((m, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = 0.6 + col * (cardW + 0.3);
    const y = 2.1 + row * 2.1;
    slide.addShape("roundRect", {
      x,
      y,
      w: cardW,
      h: 1.9,
      rectRadius: 0.08,
      fill: { color: SURFACE },
      line: { color: BORDER, width: 0.75 },
    });
    slide.addText(m.value, {
      x: x + 0.2,
      y: y + 0.2,
      w: cardW - 0.4,
      h: 0.7,
      fontSize: 28,
      bold: true,
      color: ACCENT,
      align: "center",
      fontFace: FONT_LATIN,
    });
    slide.addText(m.name, {
      x: x + 0.2,
      y: y + 0.95,
      w: cardW - 0.4,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: NAVY,
      align: "center",
      ...bodyOptions(m.name, { align: "center" }),
    });
    slide.addText(m.description, {
      x: x + 0.2,
      y: y + 1.35,
      w: cardW - 0.4,
      h: 0.5,
      fontSize: 9.5,
      color: SLATE,
      align: "center",
      valign: "top",
      ...bodyOptions(m.description, { align: "center" }),
    });
  });
  return slide;
}

function buildClosing(pptx: PptxGenJS, closing: ClientPresentationSlides["closing"]): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  addBackground(slide, NAVY);
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: ACCENT } });
  slide.addText(closing.title, {
    x: 0.8,
    y: 2.8,
    w: 11.7,
    h: 1.0,
    fontSize: 34,
    bold: true,
    color: WHITE,
    align: "center",
    ...bodyOptions(closing.title, { align: "center" }),
  });
  slide.addText(closing.body, {
    x: 1.8,
    y: 3.9,
    w: 9.7,
    h: 1.2,
    fontSize: 16,
    color: ACCENT_SOFT,
    align: "center",
    ...bodyOptions(closing.body, { align: "center" }),
  });
  slide.addText("VELORA", {
    x: 5.16,
    y: 6.6,
    w: 3,
    h: 0.4,
    fontSize: 13,
    bold: true,
    color: ACCENT_SOFT,
    align: "center",
    fontFace: FONT_LATIN,
    charSpacing: 2,
  });
  return slide;
}

/**
 * طبقة PPTX Generation — بناء ملف PowerPoint حقيقي قابل للتعديل بالكامل
 * (Text/Shape/Table Objects حقيقية، بدون أي نص كصورة) من slides_content
 * مباشرة. منطق توليد ملف خالص، بدون أي استدعاء AI أو قاعدة بيانات.
 * كل نص بيتحدد اتجاهه (RTL عربي / LTR إنجليزي) تلقائيًا حسب محتواه.
 */
export async function generatePptxBuffer(
  slides: ClientPresentationSlides,
  projectName: string
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "VELORA_WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "VELORA_WIDE";
  pptx.author = "VELORA";
  pptx.title = `${projectName} — Client Presentation`;

  // بعض العروض المخزّنة قديمًا (قبل التوسعة) ممكن ماعندهاش الشرائح
  // الجديدة — fallback آمن عشان buildX ما يكسرش على undefined.
  const s = slides as Partial<ClientPresentationSlides>;
  const created: (PptxGenJS.Slide | null)[] = [
    buildCover(pptx, slides, projectName),
    buildAgenda(pptx, slides.agenda.items),
    buildTextSlide(pptx, "Executive Summary", slides.executive_summary.title, slides.executive_summary.body, slides.executive_summary.highlights),
    s.about_company ? buildTextSlide(pptx, "About the Company", s.about_company.title, s.about_company.body) : null,
    buildTextSlide(pptx, "Business Problem", slides.business_problem.title, slides.business_problem.body),
    buildTextSlide(pptx, "Current Situation", slides.current_situation.title, slides.current_situation.body, slides.current_situation.points),
    buildBulletSlide(pptx, "Pain Points", slides.pain_points.title, slides.pain_points.items),
    s.our_understanding ? buildTextSlide(pptx, "Our Understanding", s.our_understanding.title, s.our_understanding.body, s.our_understanding.points) : null,
    s.vision ? buildTextSlide(pptx, "Vision", s.vision.title, s.vision.body) : null,
    buildTextSlide(pptx, "Solution", slides.solution.title, slides.solution.body),
    buildScope(pptx, slides.scope.in_scope, slides.scope.out_of_scope),
    buildBulletSlide(pptx, "Key Features", slides.features.title, slides.features.features),
    s.modules ? buildBulletSlide(pptx, "System Modules", s.modules.title, s.modules.items) : null,
    s.workflow ? buildBulletSlide(pptx, "Workflow", s.workflow.title, s.workflow.items) : null,
    s.before_after ? buildPairTable(pptx, s.before_after.title, "Before / After", "قبل الحل", "بعد الحل", s.before_after.pairs) : null,
    s.departments ? buildBulletSlide(pptx, "Departments", s.departments.title, s.departments.items) : null,
    s.user_roles ? buildBulletSlide(pptx, "Users & Roles", s.user_roles.title, s.user_roles.items) : null,
    s.reports ? buildBulletSlide(pptx, "Reports & Dashboards", s.reports.title, s.reports.items) : null,
    s.ai_capabilities ? buildBulletSlide(pptx, "AI Capabilities", s.ai_capabilities.title, s.ai_capabilities.items) : null,
    buildTimeline(pptx, slides.timeline.title, slides.timeline.phases),
    buildArchitecture(pptx, slides.architecture),
    buildRisks(pptx, slides.risks.title, slides.risks.items),
    s.roi ? buildKpis(pptx, s.roi.title, s.roi.metrics, "ROI") : null,
    buildKpis(pptx, slides.kpis.title, slides.kpis.metrics),
    buildRoadmap(pptx, slides.roadmap.title, slides.roadmap.milestones),
    s.transformation ? buildTextSlide(pptx, "Transformation", s.transformation.title, s.transformation.body, s.transformation.points) : null,
    buildBulletSlide(pptx, "Next Steps", slides.next_steps.title, slides.next_steps.items),
    buildBulletSlide(pptx, "Q&A", slides.qa.title, slides.qa.items),
    buildClosing(pptx, slides.closing),
  ];
  const finalSlides = created.filter((sl): sl is PptxGenJS.Slide => sl !== null);

  const totalSlides = finalSlides.length;
  finalSlides.forEach((slide, i) => addBrandFooter(pptx, slide, i + 1, totalSlides));

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
  return buffer;
}
