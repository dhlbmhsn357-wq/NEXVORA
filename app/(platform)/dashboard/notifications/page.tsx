import { Bell } from "lucide-react";
import { getNotificationHistory } from "../notifications-actions";
import PageHeader from "@/components/ui/PageHeader";
import NotificationsHistoryClient from "./notifications-history-client";

export default async function NotificationsHistoryPage() {
  const initial = await getNotificationHistory({ status: "active", readState: "all", page: 1 });

  return (
    <div>
      <PageHeader
        title="كل الإشعارات"
        icon={Bell}
        description="سجل كامل للإشعارات — بحث، فلترة، أرشفة، وحذف ناعم (بدون حذف نهائي من قاعدة البيانات)."
      />

      <div>
        <NotificationsHistoryClient initialItems={initial.items} initialTotal={initial.total} />
      </div>
    </div>
  );
}
