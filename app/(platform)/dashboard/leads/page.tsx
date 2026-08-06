import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/rbac";
import PageHeader from "@/components/ui/PageHeader";
import NewLeadForm from "./new-lead-form";
import LeadsList from "./leads-list";
import { type LeadListItem } from "./load-more-leads-action";
import { LEADS_PAGE_SIZE } from "@/lib/pagination/page-sizes";
import { getActiveTemplates } from "@/lib/discovery-templates/queries";
import type { LeadStatus } from "@/lib/types/database";

interface RawContact {
  whatsapp: string | null;
  phone: string | null;
  full_name: string | null;
}
interface RawLead {
  id: string;
  client_id: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  created_at: string;
  converted_to_project_id: string | null;
  clients: { company_name: string | null } | { company_name: string | null }[] | null;
  contacts: RawContact | RawContact[] | null;
}

export default async function LeadsPage() {
  const supabase = await createClient();

  const [{ data: leads }, templates] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, client_id, status, source, notes, created_at, converted_to_project_id, archived_at, clients(company_name), contacts:contact_id(whatsapp, phone, full_name)"
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(0, LEADS_PAGE_SIZE - 1),
    getActiveTemplates(supabase),
  ]);

  // Supabase بترجّع clients إما ككائن أو كمصفوفة حسب نوع العلاقة —
  // نطبّعها هنا لكائن واحد أو null قبل تمريرها للـ Client Component.
  const normalized: LeadListItem[] = ((leads as RawLead[] | null) ?? []).map((l) => ({
    id: l.id,
    client_id: l.client_id,
    status: l.status,
    source: l.source,
    notes: l.notes,
    created_at: l.created_at,
    converted_to_project_id: l.converted_to_project_id,
    clients: Array.isArray(l.clients) ? (l.clients[0] ?? null) : (l.clients ?? null),
    contact: Array.isArray(l.contacts) ? (l.contacts[0] ?? null) : (l.contacts ?? null),
  }));

  const newCount = normalized.filter((l) => l.status === "new").length;
  const convertedCount = normalized.filter((l) => l.status === "converted").length;

  // تعديل العملاء: owner/admin/supervisor فقط (المنفّذ لأ).
  const editAuth = await requireRole(["owner", "admin", "supervisor"]);
  const canEditLeads = editAuth.ok;

  return (
    <div>
      <div className="hud-frame rounded-[var(--v-radius-lg)] p-4">
        <PageHeader title="العملاء المحتملون" icon={Users} className="mb-2" />
        <p className="text-sm text-[var(--v-text-secondary)]">
          {normalized.length} عميل محتمل محمّل حاليًا — {newCount} جديد، {convertedCount} تم تحويله لمشروع.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <LeadsList initialLeads={normalized} initialHasMore={normalized.length === LEADS_PAGE_SIZE} canEdit={canEditLeads} />
        <NewLeadForm templates={templates} />
      </div>
    </div>
  );
}
