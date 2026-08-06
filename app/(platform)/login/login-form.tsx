"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "../components/logo";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { useT } from "@/lib/i18n/context";
import { loginAction } from "./actions";

/**
 * نموذج الدخول المؤسسي (Enterprise IAM): Email + Password + نسيت كلمة
 * المرور فقط. لا Google، لا Magic Link، لا تسجيل ذاتي — الحسابات
 * بيعملها مسؤول النظام من إدارة المستخدمين.
 */
export default function LoginForm() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    // الـ try/catch مش تزيين: من غيره، رمية الأكشن (فشل شبكة، خطأ خادم،
    // مهلة) كانت بتخرج من الدالة، فالحالة تفضل "sending" للأبد ومفيش أي
    // رسالة — الزرار بيبان كأنه مش شغّال خالص.
    try {
      const result = await loginAction(email, password);
      if (!result.ok) {
        setStatus("error");
        setErrorMsg(result.message ?? "فشل تسجيل الدخول.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error && err.message
          ? `تعذّر الوصول للخادم: ${err.message}`
          : "تعذّر الوصول للخادم. راجع اتصالك وحاول تاني."
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--v-bg-soft)] px-6">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <Logo size={64} />
        <p className="mt-3 text-xs text-[var(--v-text-muted)]">{t("login.subtitle")}</p>
        <h1 className="font-display mt-4 text-2xl text-[var(--v-text)]">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">{t("login.internalOnly")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            required
            autoComplete="current-password"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={status === "error" ? errorMsg : undefined}
          />
          <Button type="submit" variant="primary" className="w-full" loading={status === "sending"}>
            {t("login.submit")}
          </Button>
        </form>

        <Link
          href="/forgot-password"
          className="mt-4 block w-full text-center text-xs text-[var(--v-text-muted)] underline-offset-2 hover:text-[var(--v-primary)] hover:underline"
        >
          {t("login.forgot")}
        </Link>
      </Card>
    </div>
  );
}
