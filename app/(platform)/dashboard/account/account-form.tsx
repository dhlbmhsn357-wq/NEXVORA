"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User as UserIcon, ShieldCheck, Mail, Monitor, Camera } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useT } from "@/lib/i18n/context";
import {
  updateOwnName,
  updateOwnAvatar,
  changeOwnPassword,
  changeOwnEmail,
  signOutOtherSessions,
} from "./actions";

type Msg = { tone: "ok" | "error"; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={`text-xs ${msg.tone === "ok" ? "text-[var(--v-green)]" : "text-[var(--v-red)]"}`}>{msg.text}</p>
  );
}

export default function AccountForm({
  initialName,
  email,
  avatarUrl,
  roleLabel,
}: {
  initialName: string;
  email: string;
  avatarUrl: string | null;
  roleLabel: string;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();

  // الاسم + الصورة
  const [name, setName] = useState(initialName);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // كلمة المرور
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  // البريد
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);

  // الجلسات
  const [sessionMsg, setSessionMsg] = useState<Msg>(null);

  function saveName() {
    setProfileMsg(null);
    startTransition(async () => {
      const res = await updateOwnName(name);
      setProfileMsg(res.ok ? { tone: "ok", text: "تم حفظ الاسم." } : { tone: "error", text: res.message ?? "فشل الحفظ." });
      if (res.ok) router.refresh();
    });
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileMsg(null);
    setPreview(URL.createObjectURL(file));
    setAvatarBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await updateOwnAvatar(fd);
    setAvatarBusy(false);
    setProfileMsg(res.ok ? { tone: "ok", text: "تم تحديث الصورة." } : { tone: "error", text: res.message ?? "فشل رفع الصورة." });
    if (res.ok) router.refresh();
  }

  function savePassword() {
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ tone: "error", text: "كلمتا المرور غير متطابقتين." });
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPassword(curPw, newPw);
      if (res.ok) {
        setCurPw("");
        setNewPw("");
        setConfirmPw("");
        setPwMsg({ tone: "ok", text: "تم تغيير كلمة المرور. تقدر تستخدمها في الدخول القادم." });
      } else {
        setPwMsg({ tone: "error", text: res.message ?? "فشل التغيير." });
      }
    });
  }

  function saveEmail() {
    setEmailMsg(null);
    startTransition(async () => {
      const res = await changeOwnEmail(newEmail, emailPw);
      if (res.ok) {
        setEmailPw("");
        setEmailMsg({ tone: "ok", text: "تم تغيير البريد. استخدمه في الدخول القادم." });
        router.refresh();
      } else {
        setEmailMsg({ tone: "error", text: res.message ?? "فشل التغيير." });
      }
    });
  }

  function endOtherSessions() {
    setSessionMsg(null);
    startTransition(async () => {
      const res = await signOutOtherSessions();
      setSessionMsg(
        res.ok
          ? { tone: "ok", text: "تم إنهاء الجلسات على الأجهزة الأخرى." }
          : { tone: "error", text: res.message ?? "فشل الإجراء." }
      );
    });
  }

  const initials = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="mt-6 grid max-w-2xl gap-5">
      {/* الملف الشخصي */}
      <Card padding="md">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <UserIcon size={16} /> {t("account.profile")}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--v-primary-tint)] text-lg font-semibold text-[var(--v-primary)]">
              {preview ? (
                <img src={preview} alt="الصورة" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              aria-label={t("account.changeAvatar")}
              className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--v-border)] bg-[var(--v-bg)] text-[var(--v-text-secondary)] shadow-[var(--v-shadow-sm)] transition hover:text-[var(--v-primary)] disabled:opacity-50"
            >
              <Camera size={14} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--v-text)]">{name || "—"}</p>
            <p className="truncate text-xs text-[var(--v-text-muted)]">{email}</p>
            <p className="mt-0.5 text-[11px] text-[var(--v-text-subtle)]">{roleLabel}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-xs text-[var(--v-text-muted)]">{t("account.fullName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("account.fullName")} />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={saveName} loading={pending} disabled={name.trim() === initialName.trim()}>
              {t("account.saveName")}
            </Button>
            <Note msg={profileMsg} />
          </div>
        </div>
      </Card>

      {/* كلمة المرور */}
      <Card padding="md">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <ShieldCheck size={16} /> {t("account.password")}
        </div>
        <div className="space-y-3">
          <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder={t("account.currentPassword")} autoComplete="current-password" />
          <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t("account.newPassword")} autoComplete="new-password" />
          <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder={t("account.confirmPassword")} autoComplete="new-password" />
          <p className="text-[11px] text-[var(--v-text-subtle)]">{t("account.passwordHint")}</p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={savePassword} loading={pending} disabled={!curPw || !newPw || !confirmPw}>
              {t("account.changePassword")}
            </Button>
            <Note msg={pwMsg} />
          </div>
        </div>
      </Card>

      {/* البريد */}
      <Card padding="md">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Mail size={16} /> {t("account.email")}
        </div>
        <p className="mb-3 text-xs text-[var(--v-text-muted)]">
          {t("account.currentEmail")}: <span className="font-medium text-[var(--v-text)]">{email}</span>
        </p>
        <div className="space-y-3">
          <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("account.newEmail")} autoComplete="off" />
          <Input type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} placeholder={t("account.confirmWithPassword")} autoComplete="current-password" />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={saveEmail} loading={pending} disabled={!newEmail || !emailPw}>
              {t("account.changeEmail")}
            </Button>
            <Note msg={emailMsg} />
          </div>
        </div>
      </Card>

      {/* الجلسات */}
      <Card padding="md">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Monitor size={16} /> {t("account.sessions")}
        </div>
        <p className="mb-3 text-xs text-[var(--v-text-muted)]">
          {t("account.sessionsHint")}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={endOtherSessions} loading={pending}>
            {t("account.endOtherSessions")}
          </Button>
          <Note msg={sessionMsg} />
        </div>
      </Card>
    </div>
  );
}
