/**
 * NEXVORA Commercial Foundations — Types (P3)
 * ===========================================
 *
 * الأساسيات التجارية اللي تبدأ من تحويل Lead لمشروع:
 *   • Client Lifecycle Status (حالة العميل)
 *   • Contracts (عقد أساسي)
 *   • Payment Schedules (جدول دفعات أساسي)
 *
 * الميزات الأشمل (Proposals، Pricing، Change Requests بأثر على السعر
 * والزمن) تُبنى في P9.
 */

// ---------------------------------------------------------------------------
// Client Lifecycle
// ---------------------------------------------------------------------------
export type ClientLifecycleStatus =
  | "prospect"     // Lead اتحوّل لمشروع، لسه في مرحلة الاستكشاف
  | "active"       // المشروع شغّال
  | "paused"       // متوقّف مؤقتًا
  | "completed"    // سُلِّم بنجاح
  | "lost"         // انسحب العميل أو ما اكتملت الصفقة
  | "archived";    // مؤرشف للرجوع فقط

export const CLIENT_LIFECYCLE_STATUSES: readonly ClientLifecycleStatus[] = [
  "prospect",
  "active",
  "paused",
  "completed",
  "lost",
  "archived",
] as const;

export interface ClientLifecycleStatusRow {
  projectId: string;
  status: ClientLifecycleStatus;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export type ContractStatus = "draft" | "sent" | "signed" | "cancelled";

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "draft",
  "sent",
  "signed",
  "cancelled",
] as const;

export interface ContractRow {
  id: string;
  projectId: string;
  title: string;
  status: ContractStatus;
  totalAmount: number | null;
  currency: string; // ISO 4217 (3 حروف)
  signedAt: string | null;
  signedByClient: string | null;
  documentUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export type PaymentStatus =
  | "pending"
  | "invoiced"
  | "paid"
  | "overdue"
  | "cancelled";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "pending",
  "invoiced",
  "paid",
  "overdue",
  "cancelled",
] as const;

export interface PaymentScheduleRow {
  id: string;
  projectId: string;
  contractId: string | null;
  installmentNo: number;
  title: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  status: PaymentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// UI labels (Arabic)
// ---------------------------------------------------------------------------
export const CLIENT_LIFECYCLE_LABELS: Record<ClientLifecycleStatus, string> = {
  prospect: "مرشح",
  active: "نشط",
  paused: "متوقّف",
  completed: "منتهي",
  lost: "خسارة",
  archived: "مؤرشف",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "مسودّة",
  sent: "مُرسَل",
  signed: "موقّع",
  cancelled: "ملغى",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "في الانتظار",
  invoiced: "تمّت الفاتورة",
  paid: "مدفوع",
  overdue: "متأخّر",
  cancelled: "ملغى",
};
