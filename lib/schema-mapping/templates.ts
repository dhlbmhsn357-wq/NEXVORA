import type { NormalizedSchema } from "@/lib/migration-discovery/schema-model";

/**
 * قوالب الـMapping القابلة لإعادة الاستخدام — **وحدة نقية بلا I/O**.
 *
 * من المواصفة: قوالب مثل SAP→ERP، Odoo→ERP، Excel→ERP... تُكتشَف بصمة
 * النظام المصدر لاقتراح قالب جاهز. القوالب المعتمَدة تُحفَظ لاحقًا في
 * الذاكرة المؤسسية لإعادة الاستخدام التلقائي.
 */

export interface MappingTemplateSignature {
  key: string;
  label: string;
  /** أنماط أسماء جداول مميّزة لنظام المصدر. */
  tablePatterns: RegExp[];
}

const SIGNATURES: MappingTemplateSignature[] = [
  { key: "sap_to_erp", label: "SAP → ERP", tablePatterns: [/^(kna1|lfa1|mara|vbak|bkpf|bseg|t\d{3})/i, /^z[a-z]{2,}/i] },
  { key: "odoo_to_erp", label: "Odoo → ERP", tablePatterns: [/^(res_partner|res_users|account_move|sale_order|product_template|stock_)/i] },
  { key: "dynamics_to_crm", label: "Dynamics → CRM", tablePatterns: [/^(accountbase|contactbase|opportunitybase|systemuserbase)/i] },
  { key: "quickbooks_to_erp", label: "QuickBooks → ERP", tablePatterns: [/^(qb_|customer_ref|txn_)/i] },
  { key: "excel_to_erp", label: "Excel → ERP", tablePatterns: [/^(sheet\d*|imported|book\d*)/i] },
];

/**
 * يكتشف بصمة نظام المصدر من أسماء جداوله. يرجّع أفضل قالب مطابق أو null.
 */
export function detectSourceSignature(schema: NormalizedSchema): { key: string; label: string; matches: number } | null {
  let best: { key: string; label: string; matches: number } | null = null;
  for (const sig of SIGNATURES) {
    let matches = 0;
    for (const obj of schema.objects) {
      if (sig.tablePatterns.some((p) => p.test(obj.name))) matches += 1;
    }
    if (matches > 0 && (!best || matches > best.matches)) {
      best = { key: sig.key, label: sig.label, matches };
    }
  }
  return best;
}

export const KNOWN_TEMPLATES = SIGNATURES.map((s) => ({ key: s.key, label: s.label }));
