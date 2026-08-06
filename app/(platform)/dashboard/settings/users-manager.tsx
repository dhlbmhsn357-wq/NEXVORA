"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Lock, Unlock, UserX, Trash2, KeyRound, Mail, History, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import { ROLE_LABELS, STATUS_LABELS, ALL_ROLES } from "@/lib/auth/roles";
import {
  createManagedUser,
  setUserStatus,
  deleteManagedUser,
  adminResetPassword,
  changeUserEmail,
  changeUserRole,
  getUserAuditHistory,
  type UserAuditRow,
} from "./users-actions";
import type { UserRole, UserStatus } from "@/lib/types/database";

export interface ManagedUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<UserStatus, BadgeTone> = {
  active: "success",
  inactive: "neutral",
  locked: "danger",
  suspended: "warning",
  pending: "info",
  deleted: "danger",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  failed_login: "محاولة دخول فاشلة",
  setup_completed: "إعداد المنصة",
  user_created: "إنشاء الحساب",
  user_updated: "تعديل الحساب",
  user_deleted: "حذف الحساب",
  role_change: "تغيير الدور",
  password_reset: "إعادة تعيين كلمة المرور",
  password_changed: "تغيير كلمة المرور",
  email_changed: "تغيير الإيميل",
  user_locked: "قفل الحساب",
  user_unlocked: "فتح الحساب",
  user_deactivated: "تعطيل الحساب",
  user_reactivated: "تفعيل الحساب",
  user_suspended: "إيقاف الحساب",
};

/**
 * إدارة المستخدمين الداخلية (Enterprise IAM) — بديل TeamRoles القديم:
 * إنشاء مستخدمين (لا تسجيل ذاتي)، أدوار هرمية، حالات، قفل/فتح، حذف،
 * إعادة تعيين كلمة مرور، تغيير إيميل، آخر دخول، وسجل نشاط لكل مستخدم.
 */
export default function UsersManager({
  users,
  currentUserId,
  currentUserRole,
}: {
  users: ManagedUser[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const isSystemAdmin = currentUserRole === "owner";
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleUsers = users.filter((u) => u.status !== "deleted");

  async function run(userId: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyId(userId);
    const result = await fn();
    setBusyId(null);
    if (!result.ok) return toast.error(result.message ?? "فشلت العملية.");
    toast.success("تمت العملية بنجاح.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--v-text)]">إدارة المستخدمين</p>
            <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">
              منصة داخلية — لا تسجيل ذاتي. الحسابات بيعملها مسؤول النظام فقط.
            </p>
          </div>
          {isSystemAdmin && (
            <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "إلغاء" : "مستخدم جديد"}
            </Button>
          )}
        </div>

        {showCreate && isSystemAdmin && (
          <CreateUserForm
            onDone={() => {
              setShowCreate(false);
              router.refresh();
            }}
          />
        )}

        <div className="mt-4 space-y-3">
          {visibleUsers.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUserId}
              isSystemAdmin={isSystemAdmin}
              busy={busyId === u.id}
              onAction={(fn) => run(u.id, fn)}
            />
          ))}
          {visibleUsers.length === 0 && (
            <p className="text-xs text-[var(--v-text-muted)]">لا يوجد مستخدمون بعد.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createManagedUser({ fullName, email, password, role });
    setSaving(false);
    if (!result.ok) return toast.error(result.message ?? "فشل الإنشاء.");
    toast.success("تم إنشاء المستخدم.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3 sm:grid-cols-2">
      <Input required placeholder="الاسم الكامل" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Input type="email" required placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input
        type="password"
        required
        placeholder="كلمة مرور مؤقتة (10+ أحرف: كبير/صغير/رقم)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-2 text-sm text-[var(--v-text)]"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" size="sm" loading={saving}>
          إنشاء المستخدم
        </Button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  isSystemAdmin,
  busy,
  onAction,
}: {
  user: ManagedUser;
  isSelf: boolean;
  isSystemAdmin: boolean;
  busy: boolean;
  onAction: (fn: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const [expanded, setExpanded] = useState<"none" | "password" | "email" | "audit">("none");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState(user.email ?? "");
  const [auditEvents, setAuditEvents] = useState<UserAuditRow[] | null>(null);
  // مسؤول النظام (owner) محميّ: ممنوع قفله/تعطيله من الواجهة (والسيرفر كمان يمنعه).
  const isOwnerRow = user.role === "owner";

  async function toggleAudit() {
    if (expanded === "audit") return setExpanded("none");
    setExpanded("audit");
    if (auditEvents === null) {
      const result = await getUserAuditHistory(user.id);
      setAuditEvents(result.ok ? result.events : []);
    }
  }

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--v-text)]">
            {user.full_name || user.email || user.id}
            {isSelf && <span className="mr-1 text-[10px] text-[var(--v-text-muted)]">(أنت)</span>}
          </p>
          <p className="text-[11px] text-[var(--v-text-muted)]">
            {user.email}
            {user.last_login_at && ` · آخر دخول: ${new Date(user.last_login_at).toLocaleString("ar-EG")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABELS[user.status]}</Badge>
          <select
            value={user.role}
            disabled={busy || isSelf}
            onChange={(e) => onAction(() => changeUserRole(user.id, e.target.value as UserRole))}
            className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-xs text-[var(--v-text)] disabled:opacity-50"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isSelf && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isOwnerRow ? (
            <span className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2 py-1 text-[11px] text-[var(--v-text-muted)]">
              حساب مسؤول النظام محميّ — لا يمكن قفله أو تعطيله
            </span>
          ) : (
            <>
              {user.status === "locked" ? (
                <Button variant="outline" size="sm" icon={<Unlock size={12} />} disabled={busy} onClick={() => onAction(() => setUserStatus(user.id, "active"))}>
                  فتح القفل
                </Button>
              ) : (
                <Button variant="outline" size="sm" icon={<Lock size={12} />} disabled={busy} onClick={() => onAction(() => setUserStatus(user.id, "locked"))}>
                  قفل
                </Button>
              )}
              {user.status === "active" ? (
                <Button variant="outline" size="sm" icon={<UserX size={12} />} disabled={busy} onClick={() => onAction(() => setUserStatus(user.id, "inactive"))}>
                  تعطيل
                </Button>
              ) : (
                user.status !== "locked" && (
                  <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} disabled={busy} onClick={() => onAction(() => setUserStatus(user.id, "active"))}>
                    تفعيل
                  </Button>
                )
              )}
            </>
          )}
          {isSystemAdmin && (
            <>
              <Button variant="outline" size="sm" icon={<KeyRound size={12} />} disabled={busy} onClick={() => setExpanded(expanded === "password" ? "none" : "password")}>
                كلمة المرور
              </Button>
              <Button variant="outline" size="sm" icon={<Mail size={12} />} disabled={busy} onClick={() => setExpanded(expanded === "email" ? "none" : "email")}>
                الإيميل
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={12} />}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`متأكد من حذف ${user.full_name || user.email}؟ الحذف نهائي ومش هيقدر يدخل تاني.`)) {
                    onAction(() => deleteManagedUser(user.id));
                  }
                }}
              >
                حذف
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" icon={<History size={12} />} onClick={toggleAudit}>
            سجل النشاط
          </Button>
        </div>
      )}

      {expanded === "password" && isSystemAdmin && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder="كلمة المرور الجديدة"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !newPassword}
            onClick={() => {
              onAction(() => adminResetPassword(user.id, newPassword));
              setNewPassword("");
              setExpanded("none");
            }}
          >
            حفظ
          </Button>
        </div>
      )}

      {expanded === "email" && isSystemAdmin && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="max-w-xs" />
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !newEmail}
            onClick={() => {
              onAction(() => changeUserEmail(user.id, newEmail));
              setExpanded("none");
            }}
          >
            حفظ
          </Button>
        </div>
      )}

      {expanded === "audit" && (
        <div className="mt-2 space-y-1 border-t border-[var(--v-border)] pt-2">
          {auditEvents === null ? (
            <p className="text-[11px] text-[var(--v-text-muted)]">جاري التحميل…</p>
          ) : auditEvents.length === 0 ? (
            <p className="text-[11px] text-[var(--v-text-muted)]">لا يوجد نشاط مسجّل بعد.</p>
          ) : (
            auditEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--v-text-secondary)]">{AUDIT_ACTION_LABELS[ev.action] ?? ev.action}</span>
                <span className="text-[var(--v-text-muted)]">{new Date(ev.created_at).toLocaleString("ar-EG")}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
