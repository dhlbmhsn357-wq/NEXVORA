"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import Logo from "../components/logo";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { completeInitialSetup } from "./actions";

/** نموذج الإعداد الأولي — إنشاء أول مسؤول نظام. يظهر مرة واحدة فقط. */
export default function SetupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "done">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const result = await completeInitialSetup({ fullName, email, password, confirmPassword });
    if (!result.ok) {
      setStatus("error");
      setErrorMsg(result.message ?? "فشل الإعداد.");
      return;
    }
    setStatus("done");
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--v-bg-soft)] px-6">
      <Card padding="lg" className="w-full max-w-sm">
        <Logo size={36} subtitle="PM Operating System" />
        <h1 className="font-display mt-4 flex items-center gap-2 text-2xl text-[var(--v-text)]">
          <ShieldCheck size={22} className="text-[var(--v-primary)]" /> الإعداد الأولي للمنصة
        </h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          أول تشغيل للمنصة — أنشئ حساب مسؤول النظام. الصفحة دي بتظهر مرة واحدة فقط.
        </p>

        {status === "done" ? (
          <div className="mt-6 rounded-[var(--v-radius-lg)] border border-[var(--v-green)]/30 bg-[var(--v-green)]/10 p-3 text-sm text-[var(--v-green)]">
            تم إنشاء مسؤول النظام بنجاح — جاري تحويلك لتسجيل الدخول…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <Input
              required
              placeholder="الاسم الكامل"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="إيميل الشركة"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              required
              autoComplete="new-password"
              placeholder="كلمة المرور (10 أحرف على الأقل: كبير + صغير + رقم)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              type="password"
              required
              autoComplete="new-password"
              placeholder="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={status === "error" ? errorMsg : undefined}
            />
            <Button type="submit" variant="primary" className="w-full" loading={status === "sending"}>
              إنشاء مسؤول النظام
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
