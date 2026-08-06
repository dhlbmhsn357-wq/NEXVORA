import type { NormalizedObject, NormalizedSchema } from "./schema-model";
import { tokenize } from "./semantic-detection";

/**
 * ذكاء العلاقات — **وحدة نقية بلا I/O**.
 *
 * يبني رسم العلاقات بين الكائنات من المفاتيح الخارجية + دلائل التسمية،
 * يصنّف كل علاقة، ويكشف الدورات والاعتماديات والجداول الحرجة/الميتة.
 */

export type RelationshipKind =
  | "parent_child" | "one_to_one" | "many_to_many" | "recursive"
  | "circular" | "weak" | "missing" | "broken";

export interface DetectedRelationship {
  from: string;
  to: string;
  kind: RelationshipKind;
  viaColumns: string[];
  confidence: number;
}

export interface DependencyReport {
  relationships: DetectedRelationship[];
  circularChains: string[][];
  criticalTables: string[]; // مرجَّعة من كثير — تكسيرها يكسر النظام
  coreEntities: string[]; // أعلى درجة اتصال
  sharedTables: string[]; // مرجَّعة من ٣+ جداول
  unusedTables: string[]; // لا تُرجِع ولا تُرجَع
  deadTables: string[]; // بلا أعمدة/صفوف ولا علاقات
}

function norm(name: string): string {
  return name.toLowerCase().replace(/[`"[\]]/g, "");
}

/** يبني فهرس أسماء الكائنات (يطابق جدول الإشارة رغم اختلاف الحالة/البادئة). */
function buildNameIndex(objects: NormalizedObject[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const o of objects) {
    index.set(norm(o.name), o.name);
    // مطابقة مرنة بالـtokens (customers ↔ customer).
    for (const t of tokenize(o.name)) if (!index.has(t)) index.set(t, o.name);
  }
  return index;
}

function resolveTarget(ref: string, index: Map<string, string>): string | null {
  const direct = index.get(norm(ref));
  if (direct) return direct;
  for (const t of tokenize(ref)) {
    const hit = index.get(t);
    if (hit) return hit;
  }
  return null;
}

/**
 * يكتشف العلاقات: من المفاتيح الخارجية الصريحة أولًا، ثم من دلائل التسمية
 * (`customer_id` بلا FK صريح → علاقة **weak** أو **missing**). المفاتيح
 * الخارجية التي تشير لجدول غير موجود → **broken**.
 */
export function detectRelationships(schema: NormalizedSchema): DetectedRelationship[] {
  const index = buildNameIndex(schema.objects);
  const rels: DetectedRelationship[] = [];
  const seen = new Set<string>();

  for (const obj of schema.objects) {
    for (const c of obj.columns) {
      const isFk = c.isForeignKey || (/_id$/i.test(c.name) && c.name.toLowerCase() !== "id");
      if (!isFk) continue;

      let target: string | null = null;
      let broken = false;
      if (c.references) {
        target = resolveTarget(c.references.table, index);
        if (!target) broken = true;
      } else {
        // استنتج الهدف من اسم العمود: customer_id → customer.
        const base = c.name.replace(/_?id$/i, "");
        target = resolveTarget(base, index);
      }

      if (broken) {
        const key = `${obj.name}~broken~${c.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          rels.push({ from: obj.name, to: c.references?.table ?? c.name, kind: "broken", viaColumns: [c.name], confidence: 80 });
        }
        continue;
      }
      if (!target) {
        // اسم يوحي بعلاقة لكن الهدف غير موجود → missing.
        rels.push({ from: obj.name, to: c.name.replace(/_?id$/i, ""), kind: "missing", viaColumns: [c.name], confidence: 45 });
        continue;
      }

      const recursive = norm(target) === norm(obj.name);
      let kind: RelationshipKind = recursive ? "recursive" : c.references ? "parent_child" : "weak";
      // عمود FK فريد (unique/pk) → 1:1.
      if (!recursive && c.isPrimaryKey) kind = "one_to_one";

      const key = `${obj.name}~${target}~${c.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rels.push({ from: obj.name, to: target, kind, viaColumns: [c.name], confidence: c.references ? 90 : 55 });
    }
  }

  // كشف many_to_many: جدول وصل (كل أعمدته تقريبًا FKs لجدولين).
  for (const obj of schema.objects) {
    const fkTargets = rels.filter((r) => r.from === obj.name && (r.kind === "parent_child" || r.kind === "weak"));
    const nonKeyCols = obj.columns.filter((c) => !c.isForeignKey && !/_id$/i.test(c.name) && c.name.toLowerCase() !== "id" && !/(created|updated|at)$/i.test(c.name));
    if (fkTargets.length === 2 && nonKeyCols.length <= 2) {
      for (const r of fkTargets) r.kind = "many_to_many";
    }
  }

  return rels;
}

/** كشف الدورات في رسم العلاقات (DFS على حواف parent_child/weak). */
export function detectCircularChains(rels: DetectedRelationship[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const r of rels) {
    if (r.kind === "broken" || r.kind === "missing" || r.kind === "recursive") continue;
    if (!adj.has(r.from)) adj.set(r.from, []);
    adj.get(r.from)!.push(r.to);
  }

  const chains: string[][] = [];
  const seenCycle = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string) => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      if (idx >= 0) {
        const cycle = stack.slice(idx);
        const key = [...cycle].sort().join("~");
        if (!seenCycle.has(key)) {
          seenCycle.add(key);
          chains.push([...cycle, node]);
        }
      }
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of adj.get(node) ?? []) dfs(next);
    stack.pop();
    visiting.delete(node);
  };

  for (const node of adj.keys()) dfs(node);
  return chains;
}

/**
 * تحليل الاعتماديات الكامل: يصنّف الجداول الحرجة (مرجَّعة كثيرًا)،
 * الأساسية (أعلى اتصال)، المشتركة، غير المستخدمة، والميتة.
 */
export function analyzeDependencies(schema: NormalizedSchema): DependencyReport {
  const relationships = detectRelationships(schema);
  const circularChains = detectCircularChains(relationships);

  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const o of schema.objects) {
    inbound.set(o.name, 0);
    outbound.set(o.name, 0);
  }
  for (const r of relationships) {
    if (r.kind === "broken" || r.kind === "missing") continue;
    outbound.set(r.from, (outbound.get(r.from) ?? 0) + 1);
    inbound.set(r.to, (inbound.get(r.to) ?? 0) + 1);
  }

  const criticalTables = [...inbound.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const sharedTables = [...inbound.entries()].filter(([, n]) => n >= 3).map(([name]) => name);
  const coreEntities = [...schema.objects]
    .map((o) => ({ name: o.name, degree: (inbound.get(o.name) ?? 0) + (outbound.get(o.name) ?? 0) }))
    .filter((x) => x.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 8)
    .map((x) => x.name);

  const unusedTables = schema.objects
    .filter((o) => (inbound.get(o.name) ?? 0) === 0 && (outbound.get(o.name) ?? 0) === 0)
    .map((o) => o.name);

  const deadTables = schema.objects
    .filter((o) => o.columns.length === 0 || (o.rowCount === 0 && (inbound.get(o.name) ?? 0) === 0 && (outbound.get(o.name) ?? 0) === 0))
    .map((o) => o.name);

  return { relationships, circularChains, criticalTables, coreEntities, sharedTables, unusedTables, deadTables };
}
