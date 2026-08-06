"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../../components/logo";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { recordPasswordChanged } from "../../forgot-password/actions";

/**
 * تعيين كلمة مرور جديدة بعد فتح رابط الاستعادة. رابط Supabase بيوصل هنا
 * مباشرة إما بـ ?code= (PKCE) أو بـ tokens في الـ hash؛ بنبادل الـ code
 * لإنشاء جلسة recovery مؤقتة، ثم updateUser بيغيّر الباسورد ويبطّل الرابط.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "done">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  // إنشاء جلسة الاستعادة من الرابط عند فتح الصفحة (code أو hash tokens).
  useEffect(() => {
    const supabase = createClient();
    async function establish() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        /* لو فشل التبادل، بنكمّل — ممكن الجلسة اتعملت من الـ hash تلقائيًا */
      }
      const { data } = await supabase.auth.getSession();
      setSessionReady(!!data.session);
    }
    establish();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password !== confirmPassword) {
      setStatus("error");
      setErrorMsg("كلمتا المرور غير متطابقتين.");
      return;
    }
    const policy = validatePasswordStrength(password);
    if (!policy.ok) {
      setStatus("error");
      setErrorMsg(policy.issues.join(" "));
      return;
    }

    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setErrorMsg(
        error.message.includes("session")
          ? "رابط الاستعادة منتهي أو غير صالح. اطلب رابط جديد من صفحة نسيت كلمة المرور."
          : error.message
      );
      return;
    }

    await recordPasswordChanged();
    setStatus("done");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--v-bg-soft)] px-6">
      <Card padding="lg" className="w-full max-w-sm">
        <Logo size={36} subtitle="PM Operating System" />
        <h1 className="font-display mt-4 text-2xl text-[var(--v-text)]">تعيين كلمة مرور جديدة</h1>

        {status === "done" ? (
          <div className="mt-6 rounded-[var(--v-radius-lg)] border border-[var(--v-green)]/30 bg-[var(--v-green)]/10 p-3 text-sm text-[var(--v-green)]">
            تم تغيير كلمة المرور بنجاح — جاري تحويلك…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            {!sessionReady && (
              <p className="rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-2 text-[11px] text-[var(--v-amber)]">
                لو ظهر خطأ عند الحفظ، الرابط غالبًا منتهي — اطلب رابط جديد من صفحة «نسيت كلمة المرور».
              </p>
            )}
            <Input
              type="password"
              required
              autoComplete="new-password"
              placeholder="كلمة المرور الجديدة (10 أحرف على الأقل: كبير + صغير + رقم)"
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
              حفظ كلمة المرور الجديدة
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
