import Link from "next/link";
import { Building2 } from "lucide-react";
import { loadMoreClients } from "./load-more-clients-action";
import PageHeader from "@/components/ui/PageHeader";
import ClientsList from "./clients-list";

export default async function ClientsPage() {
  const { items, hasMore } = await loadMoreClients(0);

  return (
    <div>
      <PageHeader
        title="العملاء"
        icon={Building2}
        actions={
          <Link
            href="/dashboard/leads"
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:border-[var(--v-primary)]"
          >
            إضافة عميل جديد من العملاء المحتملين
          </Link>
        }
      />

      <div>
        <ClientsList initialClients={items} initialHasMore={hasMore} />
      </div>
    </div>
  );
}
