import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/rbac";
import PageHeader from "@/components/ui/PageHeader";
import { getProspectById } from "@/lib/prospecting/service";
import ProspectDetailClient from "./prospect-detail-client";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [prospect, auth, profilesRes] = await Promise.all([
    getProspectById(id),
    requireRole(["owner", "admin", "supervisor", "member"]),
    supabase.from("profiles").select("id, full_name, email").neq("status", "deleted").order("full_name"),
  ]);

  if (!prospect) notFound();

  const canManage = auth.ok && ["owner", "admin", "supervisor"].includes(auth.role ?? "member");
  const isOwnerOrAdmin = auth.ok && ["owner", "admin"].includes(auth.role ?? "member");

  const profiles = (profilesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || (p.email as string | null) || "بدون اسم",
  }));

  return (
    <div>
      <div className="hud-frame rounded-[var(--v-radius-lg)] p-4">
        <PageHeader title={prospect.organizationName} icon={Target} className="mb-0" />
      </div>

      <div className="mt-6">
        <ProspectDetailClient prospect={prospect} canManage={canManage} isOwnerOrAdmin={isOwnerOrAdmin} profiles={profiles} />
      </div>
    </div>
  );
}
