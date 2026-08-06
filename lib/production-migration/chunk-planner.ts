/**
 * مخطّط الدفعات (Chunk Planner) — **وحدة نقية بلا I/O**.
 *
 * لا يُنقَل ملايين السجلات دفعة واحدة. يقسّم صفوف كل كيان إلى دفعات بحجم
 * قابل للتعديل، مرتّبة بترتيب التبعية. الكيانات بنفس المستوى يمكن أن
 * تُنفَّذ بالتوازي (مع احترام حدّ العمّال).
 */

import type { OrderedEntity, ChunkTask } from "./execution-types";
import { PM_LIMITS } from "./execution-types";

export function clampChunkSize(size: number): number {
  if (!Number.isFinite(size)) return PM_LIMITS.defaultChunkSize;
  return Math.max(PM_LIMITS.minChunkSize, Math.min(PM_LIMITS.maxChunkSize, Math.round(size)));
}

export function clampWorkers(n: number): number {
  if (!Number.isFinite(n)) return PM_LIMITS.defaultWorkers;
  return Math.max(1, Math.min(PM_LIMITS.maxWorkers, Math.round(n)));
}

export function planChunks(ordered: OrderedEntity[], chunkSize: number): ChunkTask[] {
  const size = clampChunkSize(chunkSize);
  const tasks: ChunkTask[] = [];
  let taskOrder = 0;

  for (const e of ordered) {
    const chunks = Math.max(1, Math.ceil(e.rows / size));
    for (let ci = 0; ci < chunks; ci++) {
      const rowStart = ci * size;
      const rowEnd = Math.min(e.rows, rowStart + size);
      if (e.rows > 0 && rowStart >= e.rows) break;
      tasks.push({
        entity: e.entity,
        label: e.label,
        taskOrder: ++taskOrder,
        level: e.level,
        chunkIndex: ci,
        chunkSize: size,
        rowStart,
        rowEnd: e.rows > 0 ? rowEnd : 0,
      });
    }
  }
  return tasks;
}

/** إجمالي عدد الدفعات (للعرض والتقدير). */
export function totalChunks(ordered: OrderedEntity[], chunkSize: number): number {
  const size = clampChunkSize(chunkSize);
  return ordered.reduce((s, e) => s + Math.max(1, Math.ceil(e.rows / size)), 0);
}
