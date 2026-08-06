"use server";

import { createClient } from "@/lib/supabase/server";
import { LEADS_PAGE_SIZE } from "@/lib/pagination/page-sizes";
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

export interface LeadListItem {
  id: string;
  client_id: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  created_at: string;
  converted_to_project_id: string | null;
  clients: { company_name: string | null } | null;
  contact: RawContact | null;
}

export async function loadMoreLeads(offset: number): Promise<{ items: LeadListItem[]; hasMore: boolean }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select(
      "id, client_id, status, source, notes, created_at, converted_to_project_id, archived_at, clients(company_name), contacts:contact_id(whatsapp, phone, full_name)"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + LEADS_PAGE_SIZE - 1);

  const rows = (data as RawLead[] | null) ?? [];
  const items: LeadListItem[] = rows.map((l) => ({
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

  return { items, hasMore: rows.length === LEADS_PAGE_SIZE };
}
