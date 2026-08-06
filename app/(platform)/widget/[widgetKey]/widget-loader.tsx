"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./chat-widget"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full items-center justify-center rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)]">
      <p className="text-xs text-[var(--v-text-muted)]">جاري تحميل الدعم…</p>
    </div>
  ),
});

export default function WidgetLoader({ widgetKey, projectName }: { widgetKey: string; projectName: string }) {
  return <ChatWidget widgetKey={widgetKey} projectName={projectName} />;
}
