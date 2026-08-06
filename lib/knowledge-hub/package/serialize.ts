import type { KnowledgePackage, PackageObject } from "./package-model";

/**
 * تحويل حزمة المعرفة لصيغ قابلة للقراءة البشرية — **وحدة نقية بلا I/O**.
 *
 * JSON صيغة النقل والاستيراد (تحافظ على كل شيء). دي بتضيف صيغتين
 * **للقراءة والتقارير**: CSV للجداول، Markdown للمستندات. الاتنين
 * **تصدير أحادي الاتجاه** — للعرض لا لإعادة الاستيراد (الاستيراد من
 * JSON فقط، عشان مايضيعش شيء).
 */

/** يهرّب قيمة CSV: يلفّها باقتباس لو فيها فاصلة أو سطر أو اقتباس. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * يصدّر الكائنات كـ CSV مسطّح.
 *
 * كل نوع كائن له حقوله، فبنسطّح `data` لأعمدة موحّدة: النوع + المعرّف +
 * أشيع الحقول (عنوان/اسم/محتوى/وصف) + تمثيل JSON للباقي. ده بيدّي جدولًا
 * قابلًا للفتح في Excel بلا فقدان المعلومة.
 */
export function packageToCsv(pkg: KnowledgePackage): string {
  const headers = ["type", "source_id", "title", "body", "extra"];
  const lines: string[] = [headers.join(",")];

  for (const obj of pkg.objects) {
    const { title, body, extra } = flatten(obj);
    lines.push([
      csvCell(obj.type),
      csvCell(obj.sourceId),
      csvCell(title),
      csvCell(body),
      csvCell(extra),
    ].join(","));
  }

  return lines.join("\r\n");
}

function flatten(obj: PackageObject): { title: string; body: string; extra: string } {
  const d = obj.data;
  const title = String(d.title ?? d.name ?? d.statement ?? d.decision ?? d.description ?? "");
  const body = String(d.content ?? d.description ?? d.rationale ?? d.condition ?? "");
  // الباقي (اللي مش في العمودين) كـ JSON مضغوط.
  const used = new Set(["title", "name", "statement", "decision", "content", "description", "rationale", "condition"]);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (!used.has(k)) rest[k] = v;
  }
  const extra = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
  return { title, body, extra };
}

/**
 * يصدّر الحزمة كمستند Markdown مقروء، مجمّعًا بالنوع.
 */
export function packageToMarkdown(pkg: KnowledgePackage): string {
  const lines: string[] = [];
  lines.push(`# معرفة المشروع: ${pkg.projectName}`);
  lines.push("");
  lines.push(`> صُدِّر في ${pkg.generatedAt}${pkg.piiMasked ? " · بيانات حسّاسة مُخفاة" : ""}`);
  lines.push("");

  // عدّادات.
  const countLine = Object.entries(pkg.counts)
    .filter(([k]) => k !== "relations")
    .map(([k, n]) => `${typeLabel(k)}: ${n}`)
    .join(" · ");
  if (countLine) {
    lines.push(`**المحتوى:** ${countLine}`);
    lines.push("");
  }

  // تجميع بالنوع.
  const byType = new Map<string, PackageObject[]>();
  for (const obj of pkg.objects) {
    const list = byType.get(obj.type) ?? [];
    list.push(obj);
    byType.set(obj.type, list);
  }

  for (const [type, objs] of byType) {
    lines.push(`## ${typeLabel(type)} (${objs.length})`);
    lines.push("");
    for (const obj of objs) {
      const { title, body } = flatten(obj);
      lines.push(`### ${title || obj.sourceId}`);
      if (body) {
        lines.push("");
        lines.push(body);
      }
      lines.push("");
    }
  }

  if (pkg.relations.length > 0) {
    lines.push(`## العلاقات (${pkg.relations.length})`);
    lines.push("");
    for (const r of pkg.relations) {
      lines.push(`- ${r.fromSourceId} —(${r.relationType})→ ${r.toSourceId}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const TYPE_LABELS: Record<string, string> = {
  item: "عناصر المعرفة",
  entity: "الكيانات",
  business_rule: "قواعد العمل",
  requirement: "المتطلبات",
  decision: "القرارات",
  risk: "المخاطر",
  workflow: "سير العمل",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
