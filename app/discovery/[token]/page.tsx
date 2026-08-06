import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePortalPage } from "@/lib/discovery-portal/link-service";
import DiscoveryPortal from "./discovery-portal";
import PortalSuccess from "./portal-success";
import { ExpiredScreen, CancelledScreen, InvalidScreen } from "./portal-states";

export const dynamic = "force-dynamic";

// خصوصية: البوابة العامة يجب ألا تُفهرس في محركات البحث.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "نموذج الاكتشاف — VELORA",
};

export default async function DiscoveryPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();
  const h = await headers();
  const result = await resolvePortalPage(supabase, token, {
    userAgent: h.get("user-agent"),
    country: h.get("x-vercel-ip-country"),
  });

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen bg-[var(--v-bg)]" dir="rtl">
      {content}
    </div>
  );

  switch (result.kind) {
    case "invalid":
    case "misconfigured":
      return shell(<InvalidScreen />);
    case "cancelled":
      return shell(<CancelledScreen />);
    case "expired":
      return shell(<ExpiredScreen />);
    case "submitted":
      return shell(
        <PortalSuccess
          projectName={result.projectName}
          referenceCode={result.referenceCode}
          alreadySubmitted
        />
      );
    case "ok":
      return shell(
        <DiscoveryPortal
          token={token}
          projectName={result.context.projectName}
          referenceCode={result.context.referenceCode}
          companyName={result.context.companyName}
          contactName={result.context.contactName}
          templateName={result.context.template!.name}
          questions={result.context.questions}
          initialAnswers={result.context.answers}
        />
      );
  }
}
