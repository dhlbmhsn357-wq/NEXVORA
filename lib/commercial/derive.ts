/**
 * NEXVORA Commercial — Pure Derivations (P4)
 * ==========================================
 *
 * دوال نقيّة (بدون I/O) بتحوّل صفوف الجداول لمعلومات مشتقّة:
 *   • allowedLifecycleTransitions       — الانتقالات المسموحة من حالة لأخرى
 *   • deriveEffectivePaymentStatus      — كشف overdue من due_date + status
 *   • summarizePayments                 — إجماليات (paid/pending/overdue…)
 *   • summarizeContracts                — إجمالي قيم العقود الموقّعة
 *
 * كل شيء pure — يستقبل قيم ويرجّع قيم — عشان يتقدر يتاختبر بلا mocks.
 */
import type {
  ClientLifecycleStatus,
  ContractRow,
  PaymentScheduleRow,
  PaymentStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Lifecycle Transitions
// ---------------------------------------------------------------------------
/**
 * الانتقالات المسموحة لكل حالة. لا يُسمح بالرجوع من `completed`/`lost`/`archived`
 * إلا لـ `archived` (لأرشفة سجل قديم). Owner/Admin يقدر يعدّل من قاعدة البيانات
 * يدويًا لو محتاج حالة استثنائية.
 */
export const LIFECYCLE_TRANSITIONS: Record<ClientLifecycleStatus, readonly ClientLifecycleStatus[]> = {
  prospect: ["active", "lost", "archived"],
  active: ["paused", "completed", "lost", "archived"],
  paused: ["active", "lost", "archived"],
  completed: ["archived"],
  lost: ["archived"],
  archived: [],
} as const;

export function allowedLifecycleTransitions(from: ClientLifecycleStatus): readonly ClientLifecycleStatus[] {
  return LIFECYCLE_TRANSITIONS[from] ?? [];
}

export function isLifecycleTransitionAllowed(
  from: ClientLifecycleStatus,
  to: ClientLifecycleStatus
): boolean {
  return allowedLifecycleTransitions(from).includes(to);
}

// ---------------------------------------------------------------------------
// Payment overdue detection
// ---------------------------------------------------------------------------
/**
 * الحالة الفعّالة للدفعة على شاشة العرض:
 *   • لو `status` غير `pending`/`invoiced` → يفضل كما هو (paid/cancelled/overdue-explicit)
 *   • لو `due_date` عدّى تاريخ الحاضر ولسه في pending/invoiced → overdue
 *
 * `nowISO` حقن صريح عشان الاختبارات تكون deterministic.
 */
export function deriveEffectivePaymentStatus(
  row: Pick<PaymentScheduleRow, "status" | "dueDate">,
  nowISO: string
): PaymentStatus {
  if (row.status !== "pending" && row.status !== "invoiced") return row.status;
  if (!row.dueDate) return row.status;
  // مقارنة تواريخ فقط (YYYY-MM-DD مقابل تاريخ اليوم).
  const today = nowISO.slice(0, 10);
  return row.dueDate < today ? "overdue" : row.status;
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------
export interface PaymentSummary {
  total: number;
  paid: number;
  pending: number;
  invoiced: number;
  overdue: number;
  cancelled: number;
  paidAmount: number;
  pendingAmount: number;  // pending + invoiced (المتبقّي المتوقّع)
  overdueAmount: number;
  totalAmount: number;    // paid + pending + invoiced + overdue (يستثني cancelled)
}

/**
 * ملخّص جدول الدفعات لعرضه في الشريط العلوي. `nowISO` حقن صريح عشان
 * كشف الـ overdue يتم بنفس الساعة اللي المستخدم شايفها.
 */
export function summarizePayments(
  rows: readonly PaymentScheduleRow[],
  nowISO: string
): PaymentSummary {
  const summary: PaymentSummary = {
    total: rows.length,
    paid: 0, pending: 0, invoiced: 0, overdue: 0, cancelled: 0,
    paidAmount: 0, pendingAmount: 0, overdueAmount: 0, totalAmount: 0,
  };

  for (const r of rows) {
    const eff = deriveEffectivePaymentStatus(r, nowISO);
    switch (eff) {
      case "paid":
        summary.paid++;
        summary.paidAmount += r.amount;
        summary.totalAmount += r.amount;
        break;
      case "overdue":
        summary.overdue++;
        summary.overdueAmount += r.amount;
        summary.totalAmount += r.amount;
        break;
      case "pending":
        summary.pending++;
        summary.pendingAmount += r.amount;
        summary.totalAmount += r.amount;
        break;
      case "invoiced":
        summary.invoiced++;
        summary.pendingAmount += r.amount;
        summary.totalAmount += r.amount;
        break;
      case "cancelled":
        summary.cancelled++;
        break;
    }
  }
  return summary;
}

export interface ContractSummary {
  total: number;
  signed: number;
  draft: number;
  sent: number;
  cancelled: number;
  /** إجمالي قيم العقود الموقّعة فقط (بحسب العملة). */
  signedTotalByCurrency: Record<string, number>;
}

export function summarizeContracts(rows: readonly ContractRow[]): ContractSummary {
  const summary: ContractSummary = {
    total: rows.length,
    signed: 0, draft: 0, sent: 0, cancelled: 0,
    signedTotalByCurrency: {},
  };
  for (const c of rows) {
    switch (c.status) {
      case "signed":
        summary.signed++;
        if (c.totalAmount != null) {
          summary.signedTotalByCurrency[c.currency] =
            (summary.signedTotalByCurrency[c.currency] ?? 0) + c.totalAmount;
        }
        break;
      case "draft":     summary.draft++;     break;
      case "sent":      summary.sent++;      break;
      case "cancelled": summary.cancelled++; break;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function formatMoney(amount: number, currency: string, locale = "ar-EG"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    // fallback لو العملة مش معروفة للـ Intl
    return `${amount.toLocaleString(locale, { maximumFractionDigits: 2 })} ${currency}`;
  }
}
