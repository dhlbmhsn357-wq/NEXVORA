import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface SearchResult {
  type: "project" | "lead" | "client";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/**
 * بحث عام (Global Search) — محمي بجلسة تسجيل الدخول العادية (مش
 * Service Role)، بيدور في المشاريع والعملاء المحتملين والعملاء
 * بالاسم بس. نتائج محدودة (5 لكل نوع) لسرعة الاستجابة.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, results: [] }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const [{ data: projects }, { data: leads }, { data: clients }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, clients(company_name)")
      .ilike("name", `%${q}%`)
      .is("archived_at", null)
      .limit(5),
    supabase
      .from("leads")
      .select("id, clients(company_name)")
      .is("archived_at", null)
      .limit(30),
    supabase.from("clients").select("id, company_name").ilike("company_name", `%${q}%`).limit(5),
  ]);

  const results: SearchResult[] = [];

  for (const p of projects ?? []) {
    const clientName = Array.isArray(p.clients) ? p.clients[0]?.company_name : (p.clients as { company_name: string } | null)?.company_name;
    results.push({ type: "project", id: p.id, title: p.name, subtitle: clientName ?? null, href: `/dashboard/projects/${p.id}` });
  }

  const qLower = q.toLowerCase();
  for (const l of leads ?? []) {
    const clientName = Array.isArray(l.clients) ? l.clients[0]?.company_name : (l.clients as { company_name: string } | null)?.company_name;
    if (clientName && clientName.toLowerCase().includes(qLower)) {
      results.push({ type: "lead", id: l.id, title: clientName, subtitle: "عميل محتمل", href: `/dashboard/leads` });
      if (results.filter((r) => r.type === "lead").length >= 5) break;
    }
  }

  for (const c of clients ?? []) {
    results.push({ type: "client", id: c.id, title: c.company_name, subtitle: "عميل", href: `/dashboard/clients` });
  }

  return NextResponse.json({ ok: true, results });
}
