"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "../components/logo";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { requestPasswordReset } from "./actions";

/** نسيت كلمة المرور — إرسال رابط استعادة آمن لمرة واحدة عبر الإيميل. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    await requestPasswordReset(email, window.location.origin);
    // الرد ثابت دايمًا — مانكشفش هل الإيميل مسجّل ولا لأ.
    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--v-bg-soft)] px-6">
      <Card padding="lg" className="w-full max-w-sm">
        <Logo size={36} subtitle="PM Operating System" />
        <h1 className="font-display mt-4 text-2xl text-[var(--v-text)]">استعادة كلمة المرور</h1>

        {status === "sent" ? (
          <div className="mt-6 rounded-[var(--v-radius-lg)] border border-[var(--v-green)]/30 bg-[var(--v-green)]/10 p-3 text-sm text-[var(--v-green)]">
            لو الإيميل ده مسجّل عندنا، هيوصله رابط استعادة خلال دقائق. الرابط صالح لمرة واحدة وبينتهي تلقائيًا.
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
              أدخل إيميلك وسنرسل لك رابط إعادة تعيين آمن.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="بريدك الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="primary" className="w-full" loading={status === "sending"}>
                إرسال رابط الاستعادة
              </Button>
            </form>
          </>
        )}

        <Link
          href="/login"
          className="mt-4 block w-full text-center text-xs text-[var(--v-text-muted)] underline-offset-2 hover:text-[var(--v-primary)] hover:underline"
        >
          الرجوع لتسجيل الدخول
        </Link>
      </Card>
    </div>
  );
}
