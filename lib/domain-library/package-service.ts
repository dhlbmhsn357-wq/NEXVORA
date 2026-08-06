import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computePackageQuality } from "./package-model";

/**
 * خدمة حزم المجال — تأليف الخبرة القياسية (الجزء الموسّع).
 *
 * الحوكمة (المدير وحده يؤلّف) تُفرض في طبقة الإجراءات بـ requireRole؛
 * الخدمة تنفّذ. الجودة تُعاد حسابها عند أي تغيير في البنود — الحزمة
 * الناقصة تُعرَف فورًا.
 */

const UNDEFINED_TABLE = "42P01";

export interface DomainPackage {
  id: string;
  domain: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  quality_score: number;
  completeness: number;
  coverage: number;
  item_count: number;
  usage_count: number;
  created_at: string;
}

export interface DomainPackageItem {
  id: string;
  package_id: string;
  item_type: string;
  title: string;
  content: string;
  detail: Record<string, unknown>;
  importance: number;
}

export async function listPackages(
  client?: SupabaseClient,
  opts: { publishedOnly?: boolean; domain?: string } = {}
): Promise<DomainPackage[]> {
  const db = client ?? createServiceClient();
  let query = db.from("domain_packages").select("*").order("usage_count", { ascending: false });
  if (opts.publishedOnly) query = query.eq("status", "published");
  if (opts.domain) query = query.eq("domain", opts.domain);

  const { data, error } = await query.limit(500);
  if (error) {
    if (error.code !== UNDEFINED_TABLE) console.error(`[DomainLibrary] تعذّر قراءة الحزم: ${error.message}`);
    return [];
  }
  return (data ?? []) as DomainPackage[];
}

export async function getPackageItems(
  packageId: string,
  client?: SupabaseClient
): Promise<DomainPackageItem[]> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("domain_package_items")
    .select("*")
    .eq("package_id", packageId)
    .order("item_type")
    .limit(2000);
  if (error) return [];
  return (data ?? []) as DomainPackageItem[];
}

export async function createPackage(
  input: { domain: string; name: string; description?: string },
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string; id?: string }> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("domain_packages")
    .insert({
      domain: input.domain.trim(),
      name: input.name.trim(),
      description: input.description ?? "",
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "جدول المكتبة غير مطبَّق بعد (0081)." };
    return { ok: false, message: error.message };
  }
  return { ok: true, id: data?.id as string | undefined };
}

export async function addPackageItem(
  packageId: string,
  item: { item_type: string; title: string; content?: string; detail?: Record<string, unknown>; importance?: number },
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from("domain_package_items").insert({
    package_id: packageId,
    item_type: item.item_type,
    title: item.title.trim(),
    content: item.content ?? "",
    detail: item.detail ?? {},
    importance: item.importance ?? 50,
  });
  if (error) return { ok: false, message: error.message };
  await recomputePackageQuality(packageId, db);
  return { ok: true };
}

export async function removePackageItem(
  itemId: string,
  packageId: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from("domain_package_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  await recomputePackageQuality(packageId, db);
  return { ok: true };
}

export async function setPackageStatus(
  packageId: string,
  status: DomainPackage["status"],
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  // النشر يتطلّب جودة دنيا — حزمة فارغة لا تُنشَر كمرجع للذكاء.
  if (status === "published") {
    await recomputePackageQuality(packageId, db);
    const { data } = await db.from("domain_packages").select("quality_score").eq("id", packageId).maybeSingle();
    if (((data?.quality_score as number) ?? 0) < 30) {
      return { ok: false, message: "الحزمة ناقصة جدًا للنشر — أضِف بنودًا أساسية أولًا." };
    }
  }
  const { error } = await db.from("domain_packages").update({ status }).eq("id", packageId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** يعيد حساب جودة الحزمة وعدد بنودها من بنودها الفعلية. */
export async function recomputePackageQuality(packageId: string, client?: SupabaseClient): Promise<void> {
  const db = client ?? createServiceClient();
  const { data } = await db.from("domain_package_items").select("item_type").eq("package_id", packageId).limit(2000);
  const items = (data ?? []) as Array<{ item_type: string }>;
  const q = computePackageQuality(items);
  await db
    .from("domain_packages")
    .update({
      quality_score: q.score,
      completeness: q.completeness,
      coverage: q.coverage,
      item_count: items.length,
    })
    .eq("id", packageId);
}
