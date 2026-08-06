"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hash, Megaphone, MessageSquare, Send, Paperclip, Pin, Trash2, Pencil,
  CornerUpLeft, Sparkles, Search, X, Building2, ChevronDown, Loader2, Reply,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toaster";
import { renderSafeMarkdown } from "@/lib/collaboration/safe-markdown";
import { channelLabel } from "@/lib/collaboration/service";
import { CONVERTIBLE_NOTE_TYPES } from "@/lib/collaboration/note-types";
import { useRealtimeMessages } from "@/lib/collaboration/use-realtime-messages";
import {
  canCreateAnnouncement, canPinMessage, canEditMessage, canDeleteMessage,
} from "@/lib/collaboration/permissions";
import {
  loadMessages, loadThread, sendMessage, editMessage, deleteMessage, pinMessage,
  toggleReaction, startDirectConversation, createDepartmentChannel, getAttachmentUrl,
  summarize, convertToBrain, convertToSupport, convertToTask, uploadAttachment, searchConversationMessages,
} from "./actions";
import type {
  Conversation, ProjectChannelKey, MessageAttachment, MessageReaction, UserRole, MessagePriority,
} from "@/lib/types/database";
import type { MessageWithMeta } from "@/lib/collaboration/service";
import type { CollaborationExtraction } from "@/lib/collaboration/summary-service";

export interface CollabInitialData {
  currentUserId: string;
  role: UserRole;
  projects: { id: string; name: string; channels: Conversation[] }[];
  departmentChannels: Conversation[];
  announcementChannels: Conversation[];
  directConversations: Conversation[];
  users: { id: string; full_name: string | null; email: string | null }[];
}

const REACTIONS = ["👍", "❤️", "✅", "🎉", "👀", "🙏"];

type ActiveConv = { id: string; title: string; type: Conversation["type"]; projectId: string | null };

export default function CollaborationClient({ initial }: { initial: CollabInitialData }) {
  const [active, setActive] = useState<ActiveConv | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Conversation[]>(initial.departmentChannels);
  const [rightTab, setRightTab] = useState<"pinned" | "files" | "summary">("pinned");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshMessages = useCallback(async () => {
    if (!active) return;
    const r = await loadMessages(active.id);
    if (r.ok) setMessages(r.messages);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    loadMessages(active.id).then((r) => {
      if (r.ok) setMessages(r.messages);
      setLoading(false);
    });
  }, [active]);

  useRealtimeMessages(active?.id ?? null, refreshMessages);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-3 md:grid-cols-[16rem_1fr] lg:grid-cols-[16rem_1fr_18rem]">
      {/* الشريط الأيمن: القنوات */}
      <ChannelSidebar
        initial={initial}
        departments={departments}
        active={active}
        onSelect={setActive}
        onDepartmentCreated={(c) => setDepartments((d) => [...d, c])}
      />

      {/* المركز: المحادثة */}
      <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
        {active ? (
          <ConversationView
            active={active}
            messages={messages}
            loading={loading}
            initial={initial}
            scrollRef={scrollRef}
            onChanged={refreshMessages}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--v-primary-tint)] text-[var(--v-primary)]"><MessageSquare size={26} /></span>
            <p className="text-base font-semibold text-[var(--v-text)]">مساحة تعاون فريقك</p>
            <p className="max-w-sm text-sm text-[var(--v-text-muted)]">اختر محادثة من القائمة للبدء — أو ابدأ رسالة مباشرة مع زميل. كل نقاش هنا مرتبط بمشاريعك ومهامك.</p>
          </div>
        )}
      </Card>

      {/* الشريط الأيسر: معلومات */}
      <div className="hidden lg:block">
        {active && (
          <RightPanel active={active} messages={messages} rightTab={rightTab} setRightTab={setRightTab} />
        )}
      </div>
    </div>
  );
}

// ============ الشريط الجانبي ============
function ChannelSidebar({
  initial, departments, active, onSelect, onDepartmentCreated,
}: {
  initial: CollabInitialData;
  departments: Conversation[];
  active: ActiveConv | null;
  onSelect: (c: ActiveConv) => void;
  onDepartmentCreated: (c: Conversation) => void;
}) {
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [newDept, setNewDept] = useState("");
  const canManageDept = initial.role === "owner" || initial.role === "admin";
  const dmNameById = new Map(initial.users.map((u) => [u.id, u.full_name || u.email || "مستخدم"]));

  function toggleProject(id: string) {
    setOpenProjects((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addDept() {
    if (!newDept.trim()) return;
    const r = await createDepartmentChannel(newDept.trim());
    if (!r.ok || !r.conversationId) return toast.error(r.message ?? "فشل الإنشاء.");
    onDepartmentCreated({ id: r.conversationId, type: "department", department: newDept.trim(), name: newDept.trim(), project_id: null, channel_key: null, created_by: null, is_archived: false, last_message_at: null, created_at: new Date().toISOString() });
    setNewDept("");
    toast.success("تم إنشاء قناة القسم.");
  }

  const isActive = (id: string) => active?.id === id;

  return (
    <Card padding="sm" className="hidden min-h-0 flex-col overflow-y-auto md:flex">
      {/* الإعلانات */}
      <SidebarSection icon={<Megaphone size={13} />} label="الإعلانات">
        {initial.announcementChannels.map((c) => (
          <SidebarItem key={c.id} active={isActive(c.id)} onClick={() => onSelect({ id: c.id, title: c.name || "إعلانات", type: "announcement", projectId: null })}>
            {c.name || "إعلانات الشركة"}
          </SidebarItem>
        ))}
      </SidebarSection>

      {/* الأقسام */}
      <SidebarSection icon={<Building2 size={13} />} label="الأقسام">
        {departments.map((c) => (
          <SidebarItem key={c.id} active={isActive(c.id)} onClick={() => onSelect({ id: c.id, title: c.department || "قسم", type: "department", projectId: null })}>
            {c.department}
          </SidebarItem>
        ))}
        {canManageDept && (
          <div className="mt-1 flex items-center gap-1">
            <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="قسم جديد" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-[11px] text-[var(--v-text)]" />
            <button type="button" onClick={addDept} className="text-[11px] text-[var(--v-primary)]">إضافة</button>
          </div>
        )}
      </SidebarSection>

      {/* المشاريع + قنواتها */}
      <SidebarSection icon={<Hash size={13} />} label="المشاريع">
        {initial.projects.map((p) => (
          <div key={p.id}>
            <button type="button" onClick={() => toggleProject(p.id)} className="flex w-full items-center gap-1 rounded-[var(--v-radius-sm)] px-2 py-1 text-right text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)]">
              <ChevronDown size={12} className={openProjects.has(p.id) ? "" : "-rotate-90"} /> {p.name}
            </button>
            {openProjects.has(p.id) && (
              <div className="mr-3 border-r border-[var(--v-border)] pr-1">
                {p.channels.map((c) => (
                  <SidebarItem key={c.id} active={isActive(c.id)} onClick={() => onSelect({ id: c.id, title: `${p.name} · ${channelLabel(c.channel_key as ProjectChannelKey)}`, type: "project", projectId: p.id })}>
                    # {channelLabel(c.channel_key as ProjectChannelKey)}
                  </SidebarItem>
                ))}
              </div>
            )}
          </div>
        ))}
      </SidebarSection>

      {/* رسائل مباشرة */}
      <SidebarSection icon={<MessageSquare size={13} />} label="رسائل مباشرة">
        {initial.directConversations.map((c) => (
          <SidebarItem key={c.id} active={isActive(c.id)} onClick={() => onSelect({ id: c.id, title: "محادثة مباشرة", type: "direct", projectId: null })}>
            محادثة مباشرة
          </SidebarItem>
        ))}
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-[var(--v-primary)]">+ ابدأ محادثة</summary>
          <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {initial.users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={async () => {
                  const r = await startDirectConversation(u.id);
                  if (r.ok && r.conversationId) onSelect({ id: r.conversationId, title: dmNameById.get(u.id) || "محادثة", type: "direct", projectId: null });
                }}
                className="flex w-full items-center gap-1.5 rounded-[var(--v-radius-sm)] px-2 py-1 text-right text-[11px] text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)]"
              >
                <Avatar name={u.full_name || u.email} size={18} /> {u.full_name || u.email}
              </button>
            ))}
          </div>
        </details>
      </SidebarSection>
    </Card>
  );
}

function SidebarSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--v-text-muted)]">{icon} {label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block w-full truncate rounded-[var(--v-radius-sm)] px-2 py-1.5 text-right text-xs transition ${active ? "bg-[var(--v-primary)]/10 font-medium text-[var(--v-primary)]" : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)]"}`}
    >
      {active && <span className="absolute inset-y-1 right-0 w-0.5 rounded-full bg-[var(--v-primary)]" aria-hidden />}
      {children}
    </button>
  );
}

// ============ عرض المحادثة ============
function ConversationView({
  active, messages, loading, initial, scrollRef, onChanged,
}: {
  active: ActiveConv;
  messages: MessageWithMeta[];
  loading: boolean;
  initial: CollabInitialData;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onChanged: () => void;
}) {
  const [threadParent, setThreadParent] = useState<MessageWithMeta | null>(null);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--v-border)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--v-radius-md)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]">
            {active.type === "announcement" ? <Megaphone size={14} /> : active.type === "direct" ? <MessageSquare size={14} /> : active.type === "department" ? <Building2 size={14} /> : <Hash size={14} />}
          </span>
          <p className="truncate text-sm font-semibold text-[var(--v-text)]">{active.title}</p>
        </div>
        <SearchBox conversationId={active.id} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="py-8 text-center text-xs text-[var(--v-text-muted)]"><Loader2 size={14} className="inline animate-spin" /> جاري التحميل…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--v-primary-tint)] text-[var(--v-primary)]"><MessageSquare size={22} /></span>
            <p className="text-sm font-medium text-[var(--v-text)]">ابدأ المحادثة</p>
            <p className="max-w-xs text-xs text-[var(--v-text-muted)]">مفيش رسائل هنا بعد. اكتب أول رسالة — الـ Markdown و@المنشن والمرفقات كلها مدعومة.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const sameDay = prev && new Date(prev.created_at).toDateString() === new Date(m.created_at).toDateString();
            const grouped = !!prev && !!sameDay && prev.author_id === m.author_id && !m.parent_message_id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
            return (
              <div key={m.id}>
                {!sameDay && <DateSeparator date={m.created_at} />}
                <MessageBubble message={m} grouped={grouped} initial={initial} projectId={active.projectId} onChanged={onChanged} onOpenThread={() => setThreadParent(m)} />
              </div>
            );
          })
        )}
      </div>

      <Composer
        conversationId={active.id}
        isAnnouncement={active.type === "announcement"}
        canAnnounce={canCreateAnnouncement(initial.role)}
        onSent={onChanged}
      />

      {threadParent && (
        <ThreadDrawer parent={threadParent} initial={initial} projectId={active.projectId} onClose={() => setThreadParent(null)} onChanged={onChanged} />
      )}
    </>
  );
}

function SearchBox({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MessageWithMeta[] | null>(null);

  async function run() {
    if (!q.trim()) return;
    const r = await searchConversationMessages(q.trim(), { conversationId });
    setResults(r.messages);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"><Search size={15} /></button>
      {open && (
        <div className="absolute left-0 top-7 z-20 w-72 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-2 shadow-lg">
          <div className="flex gap-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="بحث في الرسائل…" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-xs" />
            <button type="button" onClick={run} className="text-xs text-[var(--v-primary)]">بحث</button>
          </div>
          {results && (
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {results.length === 0 ? <p className="text-[11px] text-[var(--v-text-muted)]">لا نتائج.</p> : results.map((r) => (
                <p key={r.id} className="truncate rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2 py-1 text-[11px] text-[var(--v-text-secondary)]">{r.body}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ فقاعة رسالة ============
function MessageBubble({
  message, initial, projectId, onChanged, onOpenThread, grouped = false,
}: {
  message: MessageWithMeta;
  initial: CollabInitialData;
  projectId: string | null;
  onChanged: () => void;
  onOpenThread: () => void;
  grouped?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [showActions, setShowActions] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const isMine = message.author_id === initial.currentUserId;
  const deleted = !!message.deleted_at;

  const reactionGroups = useMemo(() => groupReactions(message.reactions), [message.reactions]);

  async function doEdit() {
    const r = await editMessage(message.id, editBody);
    setEditing(false);
    if (!r.ok) return toast.error(r.message ?? "فشل التعديل.");
    onChanged();
  }
  async function doDelete() {
    if (!window.confirm("حذف الرسالة؟")) return;
    const r = await deleteMessage(message.id);
    if (!r.ok) return toast.error(r.message ?? "فشل الحذف.");
    onChanged();
  }
  async function doPin() {
    const r = await pinMessage(message.id, !message.is_pinned);
    if (!r.ok) return toast.error(r.message ?? "فشل التثبيت.");
    onChanged();
  }
  async function doReact(emoji: string) {
    await toggleReaction(message.id, emoji);
    onChanged();
  }
  async function doConvertBrain(noteType: string) {
    setShowConvert(false);
    const r = await convertToBrain(message.id, noteType as never);
    if (!r.ok) return toast.error(r.message ?? "فشل التحويل.");
    toast.success(r.message ?? "تم التحويل.");
  }
  async function doConvertSupport() {
    setShowConvert(false);
    const r = await convertToSupport(message.id);
    if (!r.ok) return toast.error(r.message ?? "فشل التحويل.");
    toast.success(r.message ?? "تم إنشاء تذكرة الدعم.");
  }
  async function doConvertTask() {
    setShowConvert(false);
    const r = await convertToTask(message.id);
    if (!r.ok) return toast.error(r.message ?? "فشل التحويل.");
    toast.success(r.message ?? "تم إنشاء مهمة.");
  }

  return (
    <div
      className={`group flex gap-2 rounded-[var(--v-radius-md)] px-2 hover:bg-[var(--v-surface)]/50 ${grouped ? "py-0.5" : "mt-1.5 py-1"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowConvert(false); }}
    >
      {grouped ? (
        <span className="w-[30px] shrink-0 pt-0.5 text-center text-[9px] text-[var(--v-text-subtle)] opacity-0 group-hover:opacity-100">
          {new Date(message.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : (
        <Avatar name={message.author_name} size={30} />
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--v-text)]">{message.author_name || "مستخدم"}</span>
            <span className="text-[10px] text-[var(--v-text-muted)]">{new Date(message.created_at).toLocaleString("ar-EG")}</span>
            {message.is_pinned && <Pin size={11} className="text-[var(--v-amber)]" />}
            {message.priority && message.priority !== "normal" && (
              <Badge tone={message.priority === "urgent" ? "danger" : "warning"}>{message.priority === "urgent" ? "عاجل" : "مهم"}</Badge>
            )}
            {message.edited_at && <span className="text-[9px] text-[var(--v-text-muted)]">(معدّلة)</span>}
          </div>
        )}

        {deleted ? (
          <p className="text-xs italic text-[var(--v-text-muted)]">تم حذف هذه الرسالة.</p>
        ) : editing ? (
          <div className="mt-1 flex gap-1">
            <input value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-xs" />
            <button type="button" onClick={doEdit} className="text-xs text-[var(--v-primary)]">حفظ</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-[var(--v-text-muted)]">إلغاء</button>
          </div>
        ) : (
          <div className="v-md text-sm text-[var(--v-text)]" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(message.body) }} />
        )}

        {/* المرفقات */}
        {message.attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => <AttachmentChip key={a.id} attachment={a} />)}
          </div>
        )}

        {/* التفاعلات */}
        {reactionGroups.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactionGroups.map((g) => (
              <button key={g.emoji} type="button" onClick={() => doReact(g.emoji)} className="rounded-full border border-[var(--v-border)] bg-[var(--v-surface)] px-1.5 py-0.5 text-[11px]">
                {g.emoji} {g.count}
              </button>
            ))}
          </div>
        )}

        {/* عدّاد الردود */}
        {message.reply_count > 0 && (
          <button type="button" onClick={onOpenThread} className="mt-1 flex items-center gap-1 text-[11px] text-[var(--v-primary)] hover:underline">
            <Reply size={11} /> {message.reply_count} رد
          </button>
        )}
      </div>

      {/* أدوات الرسالة */}
      {showActions && !deleted && !editing && (
        <div className="relative flex items-start gap-0.5">
          <div className="flex items-center gap-0.5">
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => doReact(e)} className="rounded px-0.5 text-sm transition hover:scale-125">{e}</button>
            ))}
            <IconBtn title="رد في Thread" onClick={onOpenThread}><CornerUpLeft size={13} /></IconBtn>
            {canPinMessage(initial.role) && <IconBtn title="تثبيت" onClick={doPin}><Pin size={13} /></IconBtn>}
            {projectId && (
              <IconBtn title="تحويل لمعرفة" onClick={() => setShowConvert((v) => !v)}><Sparkles size={13} /></IconBtn>
            )}
            {canEditMessage(initial.role, message.author_id, initial.currentUserId) && isMine && (
              <IconBtn title="تعديل" onClick={() => { setEditBody(message.body); setEditing(true); }}><Pencil size={13} /></IconBtn>
            )}
            {canDeleteMessage(initial.role, message.author_id, initial.currentUserId) && (
              <IconBtn title="حذف" onClick={doDelete}><Trash2 size={13} /></IconBtn>
            )}
          </div>
          {showConvert && projectId && (
            <div className="absolute left-0 top-6 z-20 w-40 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-1 shadow-lg">
              <p className="px-2 py-1 text-[10px] text-[var(--v-text-muted)]">حوّل إلى:</p>
              {CONVERTIBLE_NOTE_TYPES.map((t) => (
                <button key={t.type} type="button" onClick={() => doConvertBrain(t.type)} className="block w-full rounded-[var(--v-radius-sm)] px-2 py-1 text-right text-xs text-[var(--v-text)] hover:bg-[var(--v-surface)]">{t.label}</button>
              ))}
              <button type="button" onClick={doConvertTask} className="block w-full rounded-[var(--v-radius-sm)] px-2 py-1 text-right text-xs text-[var(--v-text)] hover:bg-[var(--v-surface)]">مهمة</button>
              <button type="button" onClick={doConvertSupport} className="block w-full rounded-[var(--v-radius-sm)] px-2 py-1 text-right text-xs text-[var(--v-text)] hover:bg-[var(--v-surface)]">تذكرة دعم</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="rounded p-1 text-[var(--v-text-muted)] hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]">
      {children}
    </button>
  );
}

function AttachmentChip({ attachment }: { attachment: MessageAttachment }) {
  async function open() {
    const url = await getAttachmentUrl(attachment.storage_path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("تعذّر فتح المرفق.");
  }
  return (
    <button type="button" onClick={open} className="flex items-center gap-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-[11px] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]">
      <Paperclip size={11} /> {attachment.file_name}
    </button>
  );
}

// ============ صندوق الكتابة ============
function Composer({
  conversationId, isAnnouncement, canAnnounce, onSent,
}: {
  conversationId: string;
  isAnnouncement: boolean;
  canAnnounce: boolean;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [pending, setPending] = useState<{ storagePath: string; fileName: string; mimeType: string; sizeBytes: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const blockedAnnouncement = isAnnouncement && !canAnnounce;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadAttachment(conversationId, fd);
    if (!r.ok || !r.attachment) return toast.error(r.message ?? "فشل الرفع.");
    setPending((p) => [...p, r.attachment!]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if ((!body.trim() && pending.length === 0) || sending) return;
    setSending(true);
    const r = await sendMessage({
      conversationId,
      body,
      priority: isAnnouncement ? priority : null,
      attachments: pending,
    });
    setSending(false);
    if (!r.ok) return toast.error(r.message ?? "فشل الإرسال.");
    setBody("");
    setPending([]);
    onSent();
  }

  if (blockedAnnouncement) {
    return <div className="border-t border-[var(--v-border)] px-4 py-3 text-center text-xs text-[var(--v-text-muted)]">الإعلانات لمسؤولي النظام والمسؤولين فقط.</div>;
  }

  return (
    <div className="border-t border-[var(--v-border)] px-3 py-2">
      {pending.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {pending.map((a, i) => (
            <span key={i} className="flex items-center gap-1 rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2 py-0.5 text-[11px]">
              <Paperclip size={10} /> {a.fileName}
              <button type="button" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {isAnnouncement && (
          <select value={priority} onChange={(e) => setPriority(e.target.value as MessagePriority)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1 py-2 text-xs">
            <option value="normal">عادي</option>
            <option value="high">مهم</option>
            <option value="urgent">عاجل</option>
          </select>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className="p-2 text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"><Paperclip size={16} /></button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          placeholder="اكتب رسالة… (Markdown مدعوم، @ للمنشن)"
          className="max-h-32 flex-1 resize-none rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)]"
        />
        <Button variant="primary" size="sm" icon={sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} onClick={submit} disabled={sending}>
          إرسال
        </Button>
      </div>
    </div>
  );
}

// ============ Thread ============
function ThreadDrawer({
  parent, initial, projectId, onClose, onChanged,
}: {
  parent: MessageWithMeta;
  initial: CollabInitialData;
  projectId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [replies, setReplies] = useState<MessageWithMeta[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(async () => {
    const r = await loadThread(parent.id);
    if (r.ok) setReplies(r.messages);
  }, [parent.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  async function reply() {
    if (!body.trim()) return;
    const r = await sendMessage({ conversationId: parent.conversation_id, body, parentMessageId: parent.id });
    if (!r.ok) return toast.error(r.message ?? "فشل الرد.");
    setBody("");
    reload();
    onChanged();
  }

  return (
    <div className="fixed inset-y-0 left-0 z-30 flex w-full max-w-md flex-col border-r border-[var(--v-border)] bg-[var(--v-bg)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--v-border)] px-4 py-2.5">
        <p className="text-sm font-semibold text-[var(--v-text)]">Thread</p>
        <button type="button" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        <MessageBubble message={parent} initial={initial} projectId={projectId} onChanged={onChanged} onOpenThread={() => {}} />
        <div className="my-2 border-t border-[var(--v-border)]" />
        {replies.map((m) => (
          <MessageBubble key={m.id} message={m} initial={initial} projectId={projectId} onChanged={reload} onOpenThread={() => {}} />
        ))}
      </div>
      <div className="border-t border-[var(--v-border)] p-2">
        <div className="flex gap-2">
          <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reply()} placeholder="رد…" className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm" />
          <Button variant="primary" size="sm" onClick={reply}>رد</Button>
        </div>
      </div>
    </div>
  );
}

// ============ الشريط الأيسر ============
function RightPanel({
  active, messages, rightTab, setRightTab,
}: {
  active: ActiveConv;
  messages: MessageWithMeta[];
  rightTab: "pinned" | "files" | "summary";
  setRightTab: (t: "pinned" | "files" | "summary") => void;
}) {
  const [summary, setSummary] = useState<CollaborationExtraction | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const pinned = messages.filter((m) => m.is_pinned && !m.deleted_at);
  const files = messages.flatMap((m) => m.attachments);

  async function runSummary() {
    setSummarizing(true);
    const r = await summarize(active.id);
    setSummarizing(false);
    if (!r.ok) return toast.error(r.message ?? "فشل التلخيص.");
    setSummary(r.extraction ?? null);
    setRightTab("summary");
  }

  return (
    <Card padding="sm" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-2 flex gap-1 text-[11px]">
        {(["pinned", "files", "summary"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setRightTab(t)} className={`flex-1 rounded-[var(--v-radius-sm)] px-2 py-1 ${rightTab === t ? "bg-[var(--v-primary)]/10 text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"}`}>
            {t === "pinned" ? "مثبّت" : t === "files" ? "ملفات" : "AI"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rightTab === "pinned" && (
          pinned.length === 0 ? <Empty text="مفيش رسائل مثبّتة." /> : pinned.map((m) => (
            <p key={m.id} className="mb-1 rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-2 py-1 text-[11px] text-[var(--v-text-secondary)]">{m.body}</p>
          ))
        )}
        {rightTab === "files" && (
          files.length === 0 ? <Empty text="مفيش ملفات." /> : files.map((a) => <div key={a.id} className="mb-1"><AttachmentChip attachment={a} /></div>)
        )}
        {rightTab === "summary" && (
          <div className="space-y-2">
            <Button variant="outline" size="sm" icon={summarizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} onClick={runSummary} disabled={summarizing}>
              {summarizing ? "جاري التحليل…" : "تلخيص واستخراج"}
            </Button>
            {summary && (
              <div className="space-y-2 text-[11px]">
                {summary.summary && <p className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] p-2 text-[var(--v-text-secondary)]">{summary.summary}</p>}
                <SummaryList title="قرارات" items={summary.decisions} />
                <SummaryList title="مخاطر" items={summary.risks} />
                <SummaryList title="متطلبات" items={summary.requirements} />
                <SummaryList title="مهام" items={summary.action_items} />
                <SummaryList title="أسئلة متابعة" items={summary.follow_up_questions} />
                <SummaryList title="غير محسوم" items={summary.unresolved} />
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-0.5 font-semibold text-[var(--v-text)]">{title}</p>
      <ul className="list-inside list-disc space-y-0.5 text-[var(--v-text-secondary)]">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[11px] text-[var(--v-text-muted)]">{text}</p>;
}

/** فاصل يوم بين الرسائل (Slack-style) — نص التاريخ في المنتصف على خط خفيف. */
function DateSeparator({ date }: { date: string }) {
  const today = new Date().toDateString();
  const d = new Date(date);
  const label = d.toDateString() === today ? "اليوم" : d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="my-3 flex items-center gap-3" aria-hidden>
      <div className="h-px flex-1 bg-[var(--v-border)]" />
      <span className="rounded-full bg-[var(--v-surface)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--v-text-muted)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--v-border)]" />
    </div>
  );
}

function groupReactions(reactions: MessageReaction[]): { emoji: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
  return [...map.entries()].map(([emoji, count]) => ({ emoji, count }));
}
