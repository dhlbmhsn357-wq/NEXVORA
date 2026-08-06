"use client";

import Tabs from "@/components/ui/Tabs";

export default function SettingsTabs({
  ai,
  brain,
  whatsapp,
  integrations,
  team,
  showTeam = false,
}: {
  ai: React.ReactNode;
  brain: React.ReactNode;
  whatsapp: React.ReactNode;
  integrations: React.ReactNode;
  team: React.ReactNode;
  /** تبويب «الفريق والصلاحيات» يظهر لمسؤول النظام/المسؤول فقط. */
  showTeam?: boolean;
}) {
  return (
    <Tabs
      items={[
        { key: "ai", label: "الذكاء الاصطناعي", content: ai },
        { key: "brain", label: "Project Brain", content: brain },
        { key: "whatsapp", label: "واتساب", content: whatsapp },
        { key: "integrations", label: "التكاملات", content: integrations },
        ...(showTeam ? [{ key: "team", label: "الفريق والصلاحيات", content: team }] : []),
      ]}
    />
  );
}
