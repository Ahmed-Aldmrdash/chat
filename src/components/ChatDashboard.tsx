"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Contact,
  ConversationSummary,
  ConversationType,
  Message,
} from "@/lib/types";
import { cn, formatConversationTime } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRealtimeConversationList } from "@/hooks/useRealtimeMessages";
import { useNow } from "@/hooks/useNow";
import { refreshConversations, searchMessages } from "@/actions/messages";
import {
  addContactTag,
  removeContactTag,
  setConversationFlags,
  toggleBlockContact,
  toggleFavoriteContact,
} from "@/actions/admin";
import { signOut } from "@/actions/auth";
import { updateStatusText } from "@/actions/profile";
import { ChatWindow } from "./ChatWindow";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import {
  BellIcon,
  BlockIcon,
  CloseIcon,
  DoubleCheckIcon,
  LogoutIcon,
  MoreIcon,
  MuteIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  StarIcon,
  TagIcon,
} from "./Icons";

const TAG_COLORS = ["#00a884", "#53bdeb", "#ff8a65", "#a78bfa", "#f472b6", "#fbbf24"];

interface ChatDashboardProps {
  myId: string;
  myName: string;
  myAvatar?: string | null;
  myStatus?: string | null;
  initialConversations: ConversationSummary[];
  isAdmin: boolean;
  types?: ConversationType[];
  readOnly?: boolean;
  amBlocked?: boolean;
  navLinks?: { href: string; label: string; icon: React.ReactNode }[];
  emptyHint?: string;
  /** زرار بيظهر في نص الشاشة الفاضية — عشان الأدمن يعرف يبدأ منين */
  emptyAction?: { href: string; label: string };
}

export function ChatDashboard({
  myId,
  myName,
  myAvatar,
  myStatus,
  initialConversations,
  isAdmin,
  types,
  readOnly = false,
  amBlocked = false,
  navLinks = [],
  emptyHint,
  emptyAction,
}: ChatDashboardProps) {
  const router = useRouter();

  // ?c=<id> بييجي من الضغط على إشعار — بيفتح المحادثة على طول
  const requestedId = useSearchParams().get("c");

  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    requestedId ?? initialConversations[0]?.conversation.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [messageResults, setMessageResults] = useState<
    { message: Message; conversationLabel: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"all" | "favorites" | "unread">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [tagEditorFor, setTagEditorFor] = useState<Contact | null>(null);
  const [showListOnMobile, setShowListOnMobile] = useState(!requestedId);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState(myStatus ?? "متاح");
  const [statusSaving, setStatusSaving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const now = useNow();
  usePresence(myId);
  const push = usePushNotifications(myId);

  /* ------------------------------ تحديث القايمة ------------------------------ */
  const refresh = useCallback(async () => {
    const result = await refreshConversations(types);
    if (result.ok) setConversations(result.data);
  }, [types]);

  useRealtimeConversationList(refresh);

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  /* ------------------------------ البحث العام ------------------------------ */
  useEffect(() => {
    const term = search.trim();

    const timer = setTimeout(async () => {
      if (term.length < 2) {
        setMessageResults([]);
        return;
      }

      setSearching(true);
      const result = await searchMessages(term);
      if (result.ok) setMessageResults(result.data);
      setSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  /* ------------------------------ الفلترة ------------------------------ */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    conversations.forEach((summary) => summary.tags.forEach((tag) => set.add(tag.tag)));
    return Array.from(set);
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversations.filter((summary) => {
      if (tab === "favorites" && !summary.others.some((other) => other.is_favorite)) {
        return false;
      }
      if (tab === "unread" && summary.unreadCount === 0) return false;
      if (tagFilter && !summary.tags.some((tag) => tag.tag === tagFilter)) return false;

      if (term) {
        const name = summary.others.map((other) => other.display_name).join(" ").toLowerCase();
        const last = summary.lastMessage?.content?.toLowerCase() ?? "";
        return name.includes(term) || last.includes(term);
      }
      return true;
    });
  }, [conversations, search, tab, tagFilter]);

  const active = useMemo(
    () => conversations.find((summary) => summary.conversation.id === activeId) ?? null,
    [conversations, activeId],
  );

  const totalUnread = conversations.reduce((sum, summary) => sum + summary.unreadCount, 0);

  /* ------------------------------ أوامر الأدمن ------------------------------ */
  const runAdminAction = async (action: Promise<{ ok: boolean; error?: string }>) => {
    const result = await action;
    if (!result.ok) setNotice(result.error ?? "حصل خطأ");
    else await refresh();
    setMenuFor(null);
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  const openConversation = (id: string) => {
    setActiveId(id);
    setShowListOnMobile(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-wa-bg">
      {/* ==================== القايمة الجانبية ==================== */}
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-e border-wa-border bg-wa-panel md:w-[400px] md:shrink-0",
          showListOnMobile ? "flex" : "hidden md:flex",
        )}
      >
        {/* هيدر */}
        <header className="flex items-center gap-2 bg-wa-panel-header px-3 py-2">
          <Avatar name={myName} id={myId} url={myAvatar} size={40} />
          <button
            type="button"
            onClick={() => setStatusOpen((open) => !open)}
            className="min-w-0 flex-1 text-start"
            title="غيّر حالتك"
          >
            <p className="truncate font-medium">{myName}</p>
            <p className="truncate text-xs text-wa-secondary">
              {totalUnread > 0 ? (
                <span className="text-wa-primary">{totalUnread} رسالة جديدة</span>
              ) : (
                statusDraft || "متاح"
              )}
            </p>
          </button>

          <button
            type="button"
            onClick={async () => {
              const result = await push.subscribe();
              setNotice(result.ok ? "الإشعارات اتفعّلت ✅" : (result.error ?? null));
            }}
            className={cn(
              "rounded-full p-2 transition hover:bg-wa-hover",
              push.subscribed ? "text-wa-primary" : "text-wa-secondary",
            )}
            title={push.subscribed ? "الإشعارات مفعّلة" : "فعّل الإشعارات"}
            aria-label="الإشعارات"
          >
            <BellIcon />
          </button>

          <ThemeToggle />

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full p-2 text-wa-secondary transition hover:bg-wa-hover"
            title="تسجيل خروج"
            aria-label="تسجيل خروج"
          >
            <LogoutIcon />
          </button>
        </header>

        {/* محرّر الحالة النصية */}
        {statusOpen && (
          <div className="flex items-center gap-2 border-b border-wa-border bg-wa-panel px-3 py-2">
            <input
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value)}
              maxLength={120}
              placeholder="إيه أخبارك؟"
              className="flex-1 rounded-lg bg-wa-input px-3 py-1.5 text-sm outline-none"
            />
            <button
              type="button"
              disabled={statusSaving}
              onClick={async () => {
                setStatusSaving(true);
                const result = await updateStatusText(statusDraft);
                setStatusSaving(false);
                setStatusOpen(false);
                setNotice(result.ok ? "الحالة اتحدّثت ✅" : result.error);
              }}
              className="rounded-full bg-wa-primary px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        )}

        {/* روابط الأدمن */}
        {navLinks.length > 0 && (
          <nav className="wa-scroll flex gap-1 overflow-x-auto border-b border-wa-border bg-wa-panel px-2 py-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-wa-hover px-3 py-1.5 text-xs text-wa-text transition hover:bg-wa-active"
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* البحث */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-wa-input px-3 py-1.5">
            <SearchIcon className="text-wa-secondary" width={16} height={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="دوّر أو ابدأ محادثة"
              className="w-full bg-transparent py-1 text-sm outline-none"
            />
            {searching && <SpinnerIcon width={14} height={14} className="text-wa-secondary" />}
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="مسح">
                <CloseIcon width={14} height={14} className="text-wa-secondary" />
              </button>
            )}
          </div>
        </div>

        {/* التابات */}
        <div className="flex items-center gap-2 px-3 pb-2">
          {(
            [
              { key: "all", label: "الكل" },
              { key: "favorites", label: "المفضلة" },
              { key: "unread", label: "غير مقروءة" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                tab === item.key
                  ? "bg-wa-primary/20 text-wa-primary"
                  : "bg-wa-hover text-wa-secondary hover:bg-wa-active",
              )}
            >
              {item.label}
            </button>
          ))}

          {allTags.length > 0 && (
            <select
              value={tagFilter ?? ""}
              onChange={(event) => setTagFilter(event.target.value || null)}
              className="ms-auto rounded-full bg-wa-hover px-2 py-1 text-xs text-wa-secondary outline-none"
            >
              <option value="">كل التاجات</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* نتايج البحث في الرسايل */}
        {search.trim().length >= 2 && messageResults.length > 0 && (
          <div className="border-y border-wa-border bg-wa-hover/40">
            <p className="px-3 py-1.5 text-xs font-semibold text-wa-secondary">
              رسايل ({messageResults.length})
            </p>
            <ul className="wa-scroll max-h-52 overflow-y-auto">
              {messageResults.map(({ message, conversationLabel }) => (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(message.conversation_id)}
                    className="w-full px-3 py-2 text-start transition hover:bg-wa-hover"
                  >
                    <p className="text-xs text-wa-primary">{conversationLabel}</p>
                    <p className="line-clamp-2 text-sm">{message.content}</p>
                    <p className="text-[11px] text-wa-secondary">
                      {new Date(message.created_at).toLocaleString("ar-EG")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* قايمة المحادثات */}
        <ul className="wa-scroll flex-1 overflow-y-auto">
          {visibleConversations.length === 0 && (
            <li className="p-6 text-center text-sm text-wa-secondary">
              {emptyHint ?? "مفيش محادثات"}
            </li>
          )}

          {visibleConversations.map((summary) => {
            const other = summary.others[0];
            const name = summary.others.map((o) => o.display_name).join("، ") || "محادثة";
            const isActive = summary.conversation.id === activeId;
            const online =
              !!other?.last_seen && now - new Date(other.last_seen).getTime() < 60_000;

            return (
              <li key={summary.conversation.id} className="relative">
                <button
                  type="button"
                  onClick={() => openConversation(summary.conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-start transition",
                    isActive ? "bg-wa-active" : "hover:bg-wa-hover",
                  )}
                >
                  <Avatar
                    name={name}
                    id={other?.id ?? summary.conversation.id}
                    url={other?.avatar_url}
                    online={online}
                  />

                  <div className="min-w-0 flex-1 border-b border-wa-border pb-3 -mb-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {summary.conversation.is_pinned && (
                        <PinIcon width={13} height={13} className="shrink-0 text-wa-secondary" />
                      )}
                      {summary.conversation.is_muted && (
                        <MuteIcon width={13} height={13} className="shrink-0 text-wa-secondary" />
                      )}
                      {other?.is_favorite && (
                        <StarIcon width={13} height={13} className="shrink-0 text-yellow-500" />
                      )}
                      {other?.is_blocked && (
                        <BlockIcon width={13} height={13} className="shrink-0 text-wa-danger" />
                      )}
                      <span className="ms-auto shrink-0 text-[11px] text-wa-secondary">
                        {summary.lastMessage
                          ? formatConversationTime(summary.lastMessage.created_at)
                          : ""}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-wa-secondary">
                        {summary.lastMessage?.sender_id === myId && (
                          <DoubleCheckIcon
                            width={14}
                            height={12}
                            className={
                              summary.lastMessage?.is_read ? "text-wa-tick" : "text-wa-secondary"
                            }
                          />
                        )}
                        {summary.lastMessage
                          ? summary.lastMessage.is_deleted
                            ? "رسالة اتمسحت"
                            : summary.lastMessage.content_type === "image"
                              ? "📷 صورة"
                              : summary.lastMessage.content_type === "voice"
                                ? "🎤 رسالة صوتية"
                                : summary.lastMessage.content
                          : "مفيش رسايل لسه"}
                      </span>

                      {summary.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-primary px-1.5 text-[11px] font-medium text-white">
                          {summary.unreadCount}
                        </span>
                      )}
                    </div>

                    {summary.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {summary.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                {/* قايمة أوامر الأدمن */}
                {isAdmin && other && (
                  <div className="absolute end-2 top-2" ref={menuFor === summary.conversation.id ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={() =>
                        setMenuFor((current) =>
                          current === summary.conversation.id ? null : summary.conversation.id,
                        )
                      }
                      className="rounded-full p-1 text-wa-secondary opacity-0 transition hover:bg-wa-active focus:opacity-100 group-hover:opacity-100 [li:hover_&]:opacity-100"
                      aria-label="خيارات المحادثة"
                    >
                      <MoreIcon width={16} height={16} />
                    </button>

                    {menuFor === summary.conversation.id && (
                      <div className="absolute end-0 top-8 z-30 w-52 overflow-hidden rounded-lg border border-wa-border bg-wa-panel py-1 text-sm shadow-lg">
                        <MenuRow
                          icon={<PinIcon width={15} height={15} />}
                          label={summary.conversation.is_pinned ? "إلغاء التثبيت" : "تثبيت"}
                          onClick={() =>
                            runAdminAction(
                              setConversationFlags(summary.conversation.id, {
                                is_pinned: !summary.conversation.is_pinned,
                              }),
                            )
                          }
                        />
                        <MenuRow
                          icon={<MuteIcon width={15} height={15} />}
                          label={summary.conversation.is_muted ? "إلغاء الكتم" : "كتم الإشعارات"}
                          onClick={() =>
                            runAdminAction(
                              setConversationFlags(summary.conversation.id, {
                                is_muted: !summary.conversation.is_muted,
                              }),
                            )
                          }
                        />
                        <MenuRow
                          icon={<StarIcon width={15} height={15} />}
                          label={other.is_favorite ? "شيل من المفضلة" : "ضيف للمفضلة"}
                          onClick={() =>
                            runAdminAction(toggleFavoriteContact(other.id, !other.is_favorite))
                          }
                        />
                        <MenuRow
                          icon={<TagIcon width={15} height={15} />}
                          label="التاجات"
                          onClick={() => {
                            setTagEditorFor(other);
                            setMenuFor(null);
                          }}
                        />
                        <MenuRow
                          icon={<BlockIcon width={15} height={15} />}
                          label={other.is_blocked ? "فك الحظر" : "حظر"}
                          danger={!other.is_blocked}
                          onClick={() =>
                            runAdminAction(toggleBlockContact(other.id, !other.is_blocked))
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ==================== نافذة الشات ==================== */}
      <main
        className={cn(
          "min-w-0 flex-1",
          showListOnMobile ? "hidden md:flex" : "flex",
        )}
      >
        {active ? (
          <ChatWindow
            key={active.conversation.id}
            myId={myId}
            myName={myName}
            summary={active}
            allConversations={conversations}
            readOnly={readOnly}
            isAdmin={isAdmin}
            canSend={!amBlocked}
            blockedReason={
              amBlocked ? "حسابك متوقف عن الإرسال — تقدر تقرا بس" : null
            }
            onBack={() => setShowListOnMobile(true)}
            onChanged={refresh}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-wa-chat-bg px-6 text-center">
            <div className="rounded-full bg-wa-panel p-6 shadow">
              <SearchIcon width={40} height={40} className="text-wa-secondary" />
            </div>
            <p className="max-w-xs text-wa-secondary">
              {emptyHint ?? "اختار محادثة عشان تبدأ"}
            </p>
            {emptyAction && (
              <Link
                href={emptyAction.href}
                className="flex items-center gap-2 rounded-full bg-wa-primary px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              >
                <PlusIcon width={16} height={16} />
                {emptyAction.label}
              </Link>
            )}
          </div>
        )}
      </main>

      {/* ==================== محرر التاجات ==================== */}
      {tagEditorFor && (
        <TagEditor
          contact={tagEditorFor}
          existing={
            conversations
              .find((summary) => summary.others.some((o) => o.id === tagEditorFor.id))
              ?.tags.filter((tag) => tag.contact_id === tagEditorFor.id) ?? []
          }
          onClose={() => setTagEditorFor(null)}
          onChanged={refresh}
        />
      )}

      {/* ==================== تنبيه ==================== */}
      {notice && (
        <div className="fixed bottom-4 start-1/2 z-50 -translate-x-1/2 rounded-full bg-wa-panel px-5 py-2 text-sm shadow-lg">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ms-3 text-wa-secondary"
            aria-label="إخفاء"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-start transition hover:bg-wa-hover",
        danger ? "text-wa-danger" : "text-wa-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TagEditor({
  contact,
  existing,
  onClose,
  onChanged,
}: {
  contact: Contact;
  existing: { id: string; tag: string; color: string }[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!tag.trim()) return;
    setBusy(true);
    const result = await addContactTag(contact.id, tag, color);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTag("");
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-wa-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">تاجات {contact.display_name}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-wa-secondary">
            <CloseIcon />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          {existing.length === 0 && (
            <p className="text-sm text-wa-secondary">مفيش تاجات لسه</p>
          )}
          {existing.map((item) => (
            <span
              key={item.id}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-white"
              style={{ backgroundColor: item.color }}
            >
              {item.tag}
              <button
                type="button"
                onClick={async () => {
                  await removeContactTag(item.id);
                  await onChanged();
                }}
                aria-label={`شيل ${item.tag}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="اسم التاج"
            className="flex-1 rounded-lg bg-wa-input px-3 py-2 text-sm outline-none"
          />
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-9 cursor-pointer rounded border border-wa-border bg-transparent"
            aria-label="لون التاج"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !tag.trim()}
            className="rounded-full bg-wa-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            ضيف
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-wa-danger">{error}</p>}
      </div>
    </div>
  );
}
