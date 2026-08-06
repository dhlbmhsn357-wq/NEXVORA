/**
 * محاكاة الأعطال (Failure Simulation) — **وحدة نقية بلا I/O**.
 *
 * تحاكي سيناريوهات الفشل (شبكة/كهرباء/تعطّل قاعدة بيانات/فشل API/تخزين/
 * طابور/تجاوز ذاكرة/ترحيل جزئي) وتقرّر قدرة النظام على الاستئناف والاستعادة
 * وإعادة المحاولة الآمنة — استنادًا لخصائص المحرّك: طابور بنقاط تحقّق (0073)،
 * وتحويلات نقيّة **متعادلة (Idempotent)**، وكتابة على دفعات.
 */

import type { FailureScenarioResult, FailureReport, FailureKind, StepStatus } from "./simulation-types";

interface FailureInput {
  /** هل المحرّك يعتمد طابورًا بنقاط تحقّق (resume) — نعم في VELORA (0073). */
  hasCheckpointQueue: boolean;
  /** هل التحويلات متعادلة (نفس الإدخال → نفس المخرَج) — نعم (وحدات نقيّة). */
  idempotent: boolean;
  /** هل الكتابة على دفعات (batch) — نعم. */
  batched: boolean;
}

const SCENARIOS: Array<{ kind: FailureKind; title: string }> = [
  { kind: "network", title: "انقطاع الشبكة" },
  { kind: "power", title: "انقطاع الكهرباء" },
  { kind: "database_crash", title: "تعطّل قاعدة البيانات" },
  { kind: "api_failure", title: "فشل API" },
  { kind: "storage_failure", title: "فشل التخزين" },
  { kind: "queue_failure", title: "فشل الطابور" },
  { kind: "memory_overflow", title: "تجاوز الذاكرة" },
  { kind: "partial_migration", title: "ترحيل جزئي" },
];

export function simulateFailures(input: FailureInput = { hasCheckpointQueue: true, idempotent: true, batched: true }): FailureReport {
  const scenarios: FailureScenarioResult[] = SCENARIOS.map((s) => evaluate(s.kind, s.title, input));
  const resilient = scenarios.every((s) => s.canResume && s.canRecover && !s.dataLossRisk);
  const weakest = scenarios.find((s) => s.verdict === "failed")?.kind ?? scenarios.find((s) => s.verdict === "warning")?.kind ?? null;
  return { scenarios, resilient, weakest };
}

function evaluate(kind: FailureKind, title: string, i: FailureInput): FailureScenarioResult {
  const resume = i.hasCheckpointQueue;
  const retry = i.idempotent;
  let canResume = resume;
  let canRecover = resume && retry;
  let safeRetry = retry;
  let dataLossRisk = false;
  let explanation = "";

  switch (kind) {
    case "network":
    case "api_failure":
      explanation = "الطلب يفشل ويُعاد على نفس الدفعة؛ التعادل يمنع الازدواج.";
      break;
    case "power":
    case "database_crash":
      explanation = "الاستئناف من آخر نقطة تحقّق ناجحة عبر الطابور؛ الدفعة غير المكتملة تُعاد كاملة (لا التزام جزئي).";
      dataLossRisk = !(resume && i.batched);
      break;
    case "storage_failure":
      explanation = "المرفقات تُعاد رفعها عند فشل التخزين؛ البيانات الوصفية في الطابور.";
      break;
    case "queue_failure":
      explanation = "فشل الطابور نفسه هو نقطة الضعف — يتطلّب حالة الطابور مُخزَّنة بشكل دائم لاستعادتها.";
      canResume = resume;
      canRecover = resume;
      safeRetry = retry;
      break;
    case "memory_overflow":
      explanation = "معالجة على دفعات + Streaming تمنع تحميل كل البيانات دفعة واحدة؛ Batch Size الأمثل يحدّ من الذروة.";
      dataLossRisk = !i.batched;
      break;
    case "partial_migration":
      explanation = "الترحيل الجزئي قابل للاستئناف من آخر دفعة ملتزمة؛ التعادل يضمن عدم تكرار المُرحَّل.";
      dataLossRisk = !(resume && retry);
      break;
  }

  const verdict: StepStatus = dataLossRisk ? "failed" : canResume && canRecover ? "passed" : "warning";
  return { kind, title, canResume, canRecover, safeRetry, dataLossRisk, verdict, explanation };
}
