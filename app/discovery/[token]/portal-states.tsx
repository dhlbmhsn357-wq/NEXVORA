import { LinkIcon, Clock, Ban } from "lucide-react";
import type { ReactNode } from "react";

function StateShell({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
      <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[var(--v-surface-2)] p-5 text-[var(--v-text-muted)]">
        {icon}
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold text-[var(--v-text)]">{title}</h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--v-text-secondary)]">
        {message}
      </p>
      <p className="mt-8 font-display text-lg font-extrabold tracking-tight text-[var(--v-text-subtle)]">
        VELORA
      </p>
    </div>
  );
}

export function ExpiredScreen() {
  return (
    <StateShell
      icon={<Clock size={30} />}
      title="انتهت صلاحية الرابط"
      message="الرابط ده مبقاش صالح. لو لسه محتاج تكمّل نموذج الاكتشاف، تواصل مع فريق VELORA وهنبعتلك رابط جديد."
    />
  );
}

export function CancelledScreen() {
  return (
    <StateShell
      icon={<Ban size={30} />}
      title="تم إيقاف الرابط"
      message="الرابط ده تم إيقافه من فريق VELORA. تواصل معنا للحصول على رابط جديد لو محتاج."
    />
  );
}

export function InvalidScreen() {
  return (
    <StateShell
      icon={<LinkIcon size={30} />}
      title="الرابط غير صالح"
      message="الرابط ده غير صحيح أو غير موجود. تأكد إنك فتحت الرابط كامل زي ما وصلك من فريق VELORA."
    />
  );
}
