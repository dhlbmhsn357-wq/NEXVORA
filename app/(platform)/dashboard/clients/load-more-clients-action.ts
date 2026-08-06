"use server";

import { createClient } from "@/lib/supabase/server";
import { CLIENTS_PAGE_SIZE } from "@/lib/pagination/page-sizes";

interface RawContact {
  id: string;
  client_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface RawProject {
  id: string;
  name: string;
  stage: string;
  client_id: string | null;
  stage_changed_at: string;
}

export interface ClientListItem {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  country: string | null;
  created_at: string;
  contacts: RawContact[];
  projects: RawProject[];
}

export async function loadMoreClients(
  offset: number
): Promise<{ items: ClientListItem[]; hasMore: boolean }> {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + CLIENTS_PAGE_SIZE - 1);

  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length === 0) return { items: [], hasMore: false };

  const [{ data: contacts }, { data: projects }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, client_id, full_name, email, phone")
      .in("client_id", clientIds),
    supabase
      .from("projects")
      .select("id, name, stage, client_id, stage_changed_at")
      .in("client_id", clientIds)
      .is("archived_at", null),
  ]);

  const contactsByClient = new Map<string, RawContact[]>();
  for (const c of (contacts as RawContact[] | null) ?? []) {
    if (!c.client_id) continue;
    const arr = contactsByClient.get(c.client_id) ?? [];
    arr.push(c);
    contactsByClient.set(c.client_id, arr);
  }

  const projectsByClient = new Map<string, RawProject[]>();
  for (const p of (projects as RawProject[] | null) ?? []) {
    if (!p.client_id) continue;
    const arr = projectsByClient.get(p.client_id) ?? [];
    arr.push(p);
    projectsByClient.set(p.client_id, arr);
  }

  const items: ClientListItem[] = (clients ?? []).map((c) => ({
    id: c.id,
    company_name: c.company_name,
    industry: c.industry,
    website: c.website,
    country: c.country,
    created_at: c.created_at,
    contacts: contactsByClient.get(c.id) ?? [],
    projects: projectsByClient.get(c.id) ?? [],
  }));

  return { items, hasMore: clientIds.length === CLIENTS_PAGE_SIZE };
}
