"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Contact, ConversationSummary, Message, MessageReaction } from "@/lib/types";
import { cn, formatDayLabel, formatLastSeen, formatDuration } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";
import { useNow } from "@/hooks/useNow";
import {
  cancelScheduledMessage,
  deleteMessage,
  editMessage,
  exportConversation,
  fetchMessages,
  forwardMessage,
  listScheduledMessages,
  markConversationRead,
  scheduleMessage,
  sendMessage,
  toggleReaction,
} from "@/actions/messages";
import { buildUploadPath } from "@/actions/media";
import { setConversationFlags } from "@/actions/admin";
import { MessageBubble } from "./MessageBubble";
import { Avatar } from "./Avatar";
import { CallOverlay } from "./CallOverlay";
import { ForwardDialog } from "./ForwardDialog";
import {
  BackIcon,
  CloseIcon,
  DownloadIcon,
  ImageIcon,
  MicIcon,
  MoreIcon,
  PhoneIcon,
  SearchIcon,
  SendIcon,
  SpinnerIcon,
  TimerIcon,
  TrashIcon,
  VideoIcon,
} from "./Icons";

const DISAPPEARING_OPTIONS = [
  { label: "معطّل", value: "" },
  { label: "ساعة", value: "1" },
  { label: "24 ساعة", value: "24" },
  { label: "7 أيام", value: "168" },
];

interface ChatWindowProps {
  myId: string;
  myName: string;
  summary: ConversationSummary;
  allConversations?: ConversationSummary[];
  readOnly?: boolean;
  isAdmin?: boolean;
  canSend?: boolean;
  blockedReason?: string | null;
  onBack?: () => void;
  onChanged?: () => void;
}

export function ChatWindow({
  myId,
  myName,
  summary,
  allConversations = [],
  readOnly = false,
  isAdmin = false,
  canSend = true,
  blockedReason = null,
  onBack,
  onChanged,
}: ChatWindowProps) {
  const conversation = summary.conversation;
  const conversationId = conversation.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwardSource, setForwardSource] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduled, setScheduled] = useState<{ id: string; content: string; send_at: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const others = summary.others;
  const otherNames = others.map((contact) => contact.display_name).join("، ") || "محادثة";
  const primaryOther: Contact | undefined = others[0];

  const now = useNow();
  const recorder = useVoiceRecorder();
  const call = useWebRTCCall(readOnly ? null : conversationId, myId, myName);
  const typing = useTypingIndicator(readOnly ? null : conversationId, myId, myName);

  /* ------------------------------ تحميل الرسايل ------------------------------ */
  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setReactions({});
      return;
    }
    const { data } = await getSupabaseBrowser()
      .from("message_reactions")
      .select("*")
      .in("message_id", ids);

    const grouped: Record<string, MessageReaction[]> = {};
    for (const reaction of (data ?? []) as MessageReaction[]) {
      (grouped[reaction.message_id] ??= []).push(reaction);
    }
    setReactions(grouped);
  }, []);

  // الـ component بيتعمله remount مع كل محادثة (الـ key = conversation id)
  // فالحالة بتتصفّر لوحدها ومحتاجين نحمّل بس
  useEffect(() => {
    let cancelled = false;

    fetchMessages(conversationId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setMessages(result.data);
        void loadReactions(result.data.map((message) => message.id));
      } else {
        setError(result.error);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId, loadReactions]);

  // ids الرسايل الحالية — بنستخدمها في تحديث التفاعلات من الريل تايم
  const messageIdsRef = useRef<string[]>([]);
  useEffect(() => {
    messageIdsRef.current = messages.map((message) => message.id);
  }, [messages]);

  /* ------------------------------ تعليم كمقروء ------------------------------ */
  const markRead = useCallback(async () => {
    if (readOnly) return;
    const result = await markConversationRead(conversationId);
    if (result.ok && result.data.updated > 0) onChanged?.();
  }, [conversationId, onChanged, readOnly]);

  useEffect(() => {
    if (loading) return;
    void markRead();
  }, [loading, markRead]);

  /* ------------------------------ الريل تايم ------------------------------ */
  useRealtimeMessages(conversationId, {
    onInsert: (message) => {
      setMessages((current) => {
        if (current.some((existing) => existing.id === message.id)) return current;
        // رسالتي رجعت من الريل تايم قبل رد الأكشن → نشيل النسخة المؤقتة
        const cleaned =
          message.sender_id === myId
            ? current.filter(
                (existing) => !(existing.pending && existing.content === message.content),
              )
            : current;
        return [...cleaned, message];
      });
      if (message.sender_id !== myId) void markRead();
      onChanged?.();
    },
    onUpdate: (message) => {
      setMessages((current) =>
        current.map((existing) => (existing.id === message.id ? message : existing)),
      );
    },
    onReactionChange: () => {
      void loadReactions(messageIdsRef.current);
    },
  });

  /* ------------------------------ سكرول لآخر رسالة ------------------------------ */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" });
  }, [messages.length, loading]);

  /* ------------------------------ قفل القايمة عند الضغط بره ------------------------------ */
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  /* ------------------------------ الإرسال ------------------------------ */
  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;

    setError(null);
    typing.notifyStopTyping();

    if (editing) {
      setEditing(null);
      setDraft("");
      const result = await editMessage(editing.id, text);
      if (!result.ok) setError(result.error);
      return;
    }

    /**
     * بنعرض الرسالة على طول بعلامة ساعة، من غير ما نستنى السيرفر.
     * لما الرد يوصل بنستبدلها بالرسالة الحقيقية، ولو فشل بنشيلها
     * ونرجّع النص في صندوق الكتابة عشان ميضيعش.
     */
    const tempId = `pending-${crypto.randomUUID()}`;
    const replyToId = replyTo?.id ?? null;

    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
      content_type: "text",
      media_path: null,
      reply_to_id: replyToId,
      is_forwarded: false,
      is_broadcast: false,
      is_read: false,
      is_deleted: false,
      edited_at: null,
      expires_at: null,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setReplyTo(null);

    const result = await sendMessage({ conversationId, content: text, replyToId });

    if (result.ok) {
      setMessages((current) => {
        const withoutTemp = current.filter((message) => message.id !== tempId);
        // ممكن الريل تايم يكون سبقنا وجابها بالفعل
        return withoutTemp.some((message) => message.id === result.data.id)
          ? withoutTemp
          : [...withoutTemp, result.data];
      });
      onChanged?.();
    } else {
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setDraft(text);
      setError(result.error);
    }
  };

  /* ------------------------------ رفع صورة ------------------------------ */
  const handleImage = async (file: File) => {
    setUploading(true);
    setError(null);

    const extension = file.name.split(".").pop() ?? "jpg";
    const pathResult = await buildUploadPath(extension);
    if (!pathResult.ok) {
      setError(pathResult.error);
      setUploading(false);
      return;
    }

    const { error: uploadError } = await getSupabaseBrowser()
      .storage.from("chat-media")
      .upload(pathResult.data.path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError("مش قادر يرفع الصورة");
      setUploading(false);
      return;
    }

    const result = await sendMessage({
      conversationId,
      content: draft.trim() || "📷 صورة",
      contentType: "image",
      mediaPath: pathResult.data.path,
      replyToId: replyTo?.id ?? null,
    });

    if (result.ok) {
      setDraft("");
      setReplyTo(null);
      setMessages((current) =>
        current.some((message) => message.id === result.data.id)
          ? current
          : [...current, result.data],
      );
      onChanged?.();
    } else {
      setError(result.error);
    }
    setUploading(false);
  };

  /* ------------------------------ رسالة صوتية ------------------------------ */
  const handleStopRecording = async () => {
    const recording = await recorder.stop();
    if (!recording) return;

    setUploading(true);
    const pathResult = await buildUploadPath(recording.extension);
    if (!pathResult.ok) {
      setError(pathResult.error);
      setUploading(false);
      return;
    }

    const { error: uploadError } = await getSupabaseBrowser()
      .storage.from("chat-media")
      .upload(pathResult.data.path, recording.blob, {
        contentType: recording.blob.type || "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      setError("مش قادر يرفع الرسالة الصوتية");
      setUploading(false);
      return;
    }

    const result = await sendMessage({
      conversationId,
      content: `🎤 رسالة صوتية (${formatDuration(recording.durationSeconds)})`,
      contentType: "voice",
      mediaPath: pathResult.data.path,
    });

    if (result.ok) {
      setMessages((current) =>
        current.some((message) => message.id === result.data.id)
          ? current
          : [...current, result.data],
      );
      onChanged?.();
    } else {
      setError(result.error);
    }
    setUploading(false);
  };

  /* ------------------------------ أوامر الرسالة ------------------------------ */
  const handleReact = async (message: Message, emoji: string) => {
    const result = await toggleReaction(message.id, emoji);
    if (!result.ok) setError(result.error);
    else void loadReactions(messageIdsRef.current);
  };

  const handleDelete = async (message: Message) => {
    const result = await deleteMessage(message.id);
    if (!result.ok) setError(result.error);
  };

  const handleForward = async (conversationIds: string[]) => {
    if (!forwardSource) return;
    const result = await forwardMessage(forwardSource.id, conversationIds);
    if (!result.ok) setError(result.error);
    setForwardSource(null);
    onChanged?.();
  };

  const handleExport = async () => {
    setMenuOpen(false);
    const result = await exportConversation(conversationId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const blob = new Blob([result.data.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openSchedule = async () => {
    setMenuOpen(false);
    setScheduleOpen(true);
    const result = await listScheduledMessages(conversationId);
    if (result.ok) setScheduled(result.data);
  };

  const handleSchedule = async () => {
    if (!draft.trim() || !scheduleAt) return;
    const result = await scheduleMessage(
      conversationId,
      draft,
      new Date(scheduleAt).toISOString(),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    setScheduleAt("");
    const refreshed = await listScheduledMessages(conversationId);
    if (refreshed.ok) setScheduled(refreshed.data);
  };

  const handleDisappearing = async (value: string) => {
    const hours = value ? Number(value) : null;
    const result = await setConversationFlags(conversationId, {
      disappearing_duration_hours: hours,
    });
    if (!result.ok) setError(result.error);
    else onChanged?.();
    setMenuOpen(false);
  };

  /* ------------------------------ العرض ------------------------------ */
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    map.set(myId, myName);
    others.forEach((contact) => map.set(contact.id, contact.display_name));
    return map;
  }, [myId, myName, others]);

  const visibleMessages = useMemo(() => {
    if (!searchTerm.trim()) return messages;
    const term = searchTerm.trim().toLowerCase();
    return messages.filter((message) => message.content.toLowerCase().includes(term));
  }, [messages, searchTerm]);

  const isOnline =
    !!primaryOther?.last_seen &&
    now - new Date(primaryOther.last_seen).getTime() < 60_000;

  const headerSubtitle = typing.typingUsers.length
    ? "بيكتب دلوقتي..."
    : others.length > 1
      ? `${others.length} أشخاص`
      : primaryOther
        ? isOnline
          ? primaryOther.status_text || "متصل دلوقتي"
          : formatLastSeen(primaryOther.last_seen)
        : "";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-wa-chat-bg">
      {/* ------------------------------ الهيدر ------------------------------ */}
      <header className="z-10 flex items-center gap-3 border-b border-wa-border bg-wa-panel-header px-3 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-1 text-wa-secondary md:hidden"
            aria-label="رجوع"
          >
            <BackIcon />
          </button>
        )}

        <Avatar
          name={otherNames}
          id={primaryOther?.id ?? conversationId}
          url={primaryOther?.avatar_url}
          size={40}
          online={isOnline}
        />

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-wa-text">{otherNames}</h2>
          <p
            className={cn(
              "truncate text-xs",
              typing.typingUsers.length ? "text-wa-primary" : "text-wa-secondary",
            )}
          >
            {headerSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-1 text-wa-secondary">
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            className="rounded-full p-2 transition hover:bg-wa-hover"
            aria-label="بحث في المحادثة"
          >
            <SearchIcon />
          </button>

          {!readOnly && others.length === 1 && (
            <>
              <button
                type="button"
                onClick={() => call.startCall(false)}
                className="rounded-full p-2 transition hover:bg-wa-hover"
                aria-label="مكالمة صوتية"
              >
                <PhoneIcon />
              </button>
              <button
                type="button"
                onClick={() => call.startCall(true)}
                className="rounded-full p-2 transition hover:bg-wa-hover"
                aria-label="مكالمة فيديو"
              >
                <VideoIcon />
              </button>
            </>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-full p-2 transition hover:bg-wa-hover"
              aria-label="خيارات"
            >
              <MoreIcon />
            </button>

            {menuOpen && (
              <div className="absolute end-0 top-10 z-30 w-56 overflow-hidden rounded-lg border border-wa-border bg-wa-panel py-1 text-sm shadow-lg">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start transition hover:bg-wa-hover"
                >
                  <DownloadIcon width={16} height={16} /> تصدير المحادثة (.txt)
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={openSchedule}
                    className="flex w-full items-center gap-2 px-3 py-2 text-start transition hover:bg-wa-hover"
                  >
                    <TimerIcon width={16} height={16} /> رسالة مجدولة
                  </button>
                )}

                {isAdmin && (
                  <div className="border-t border-wa-border px-3 py-2">
                    <p className="mb-1 flex items-center gap-2 text-xs text-wa-secondary">
                      <TimerIcon width={14} height={14} /> الرسايل تختفي بعد
                    </p>
                    <select
                      value={conversation.disappearing_duration_hours?.toString() ?? ""}
                      onChange={(event) => handleDisappearing(event.target.value)}
                      className="w-full rounded border border-wa-border bg-wa-input px-2 py-1 text-sm"
                    >
                      {DISAPPEARING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------ شريط البحث ------------------------------ */}
      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-wa-border bg-wa-panel px-3 py-2">
          <SearchIcon className="text-wa-secondary" width={16} height={16} />
          <input
            autoFocus
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="دوّر جوه المحادثة..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <span className="text-xs text-wa-secondary">
            {searchTerm ? `${visibleMessages.length} نتيجة` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchTerm("");
            }}
            className="text-wa-secondary"
            aria-label="إغلاق البحث"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}

      {/* ------------------------------ الرسايل ------------------------------ */}
      <div className="wa-scroll wa-chat-pattern flex-1 overflow-y-auto px-3 py-3 sm:px-8">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <SpinnerIcon className="text-wa-secondary" width={28} height={28} />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-lg bg-wa-panel px-4 py-2 text-sm text-wa-secondary shadow">
              {searchTerm ? "مفيش نتايج" : "مفيش رسايل لسه — ابدأ الكلام 👋"}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {visibleMessages.map((message, index) => {
              const previous = visibleMessages[index - 1];
              const showDay =
                !previous ||
                new Date(previous.created_at).toDateString() !==
                  new Date(message.created_at).toDateString();

              return (
                <div key={message.id} className="flex flex-col gap-2">
                  {showDay && (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-lg bg-wa-panel px-3 py-1 text-[12px] text-wa-secondary shadow">
                        {formatDayLabel(message.created_at)}
                      </span>
                    </div>
                  )}

                  <MessageBubble
                    message={message}
                    outgoing={message.sender_id === myId}
                    senderName={nameById.get(message.sender_id)}
                    showSender={others.length > 1 || readOnly}
                    replyTo={
                      message.reply_to_id
                        ? (messagesById.get(message.reply_to_id) ?? null)
                        : null
                    }
                    replyToName={
                      message.reply_to_id
                        ? nameById.get(
                            messagesById.get(message.reply_to_id)?.sender_id ?? "",
                          )
                        : undefined
                    }
                    reactions={reactions[message.id] ?? []}
                    myId={myId}
                    readOnly={readOnly}
                    highlight={searchTerm}
                    onReply={setReplyTo}
                    onForward={setForwardSource}
                    onDelete={handleDelete}
                    onEdit={(target) => {
                      setEditing(target);
                      setDraft(target.content);
                      textareaRef.current?.focus();
                    }}
                    onReact={handleReact}
                  />
                </div>
              );
            })}

            {typing.typingUsers.length > 0 && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-lg bg-wa-bubble-in px-3 py-2 shadow">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="wa-typing-dot h-1.5 w-1.5 rounded-full bg-wa-secondary"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ------------------------------ رسالة الخطأ ------------------------------ */}
      {error && (
        <div className="flex items-center justify-between gap-2 bg-wa-danger/10 px-4 py-2 text-sm text-wa-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="إخفاء">
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}

      {/* ------------------------------ الرسايل المجدولة ------------------------------ */}
      {scheduleOpen && !readOnly && (
        <div className="border-t border-wa-border bg-wa-panel px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <TimerIcon width={16} height={16} /> رسايل مجدولة
            </h4>
            <button
              type="button"
              onClick={() => setScheduleOpen(false)}
              className="text-wa-secondary"
              aria-label="إغلاق"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>

          {scheduled.length > 0 && (
            <ul className="mb-2 max-h-28 space-y-1 overflow-y-auto text-sm">
              {scheduled.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded bg-wa-hover px-2 py-1"
                >
                  <span className="truncate">{item.content}</span>
                  <span className="shrink-0 text-xs text-wa-secondary">
                    {new Date(item.send_at).toLocaleString("ar-EG")}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await cancelScheduledMessage(item.id);
                      setScheduled((current) => current.filter((s) => s.id !== item.id));
                    }}
                    className="shrink-0 text-wa-danger"
                    aria-label="إلغاء"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
              className="rounded border border-wa-border bg-wa-input px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleSchedule}
              disabled={!draft.trim() || !scheduleAt}
              className="rounded-full bg-wa-primary px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              جدولة اللي مكتوب تحت
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ الرد/التعديل ------------------------------ */}
      {(replyTo || editing) && !readOnly && (
        <div className="flex items-center gap-2 border-t border-wa-border bg-wa-panel px-3 py-2">
          <div className="min-w-0 flex-1 rounded border-s-4 border-wa-primary bg-wa-hover px-2 py-1">
            <p className="text-xs font-semibold text-wa-primary">
              {editing ? "تعديل الرسالة" : `رد على ${nameById.get(replyTo!.sender_id) ?? ""}`}
            </p>
            <p className="truncate text-sm text-wa-secondary">
              {(editing ?? replyTo)?.content}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              if (editing) setDraft("");
              setEditing(null);
            }}
            className="text-wa-secondary"
            aria-label="إلغاء"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* ------------------------------ صندوق الكتابة ------------------------------ */}
      {readOnly ? (
        <div className="border-t border-wa-border bg-wa-panel-header px-4 py-3 text-center text-sm text-wa-secondary">
          👁️ وضع المتابعة — بتتفرّج بس من غير تدخّل
        </div>
      ) : !canSend ? (
        <div className="border-t border-wa-border bg-wa-panel-header px-4 py-3 text-center text-sm text-wa-danger">
          {blockedReason ?? "مش مسموح لك تبعت في المحادثة دي"}
        </div>
      ) : recorder.isRecording ? (
        <div className="flex items-center gap-3 border-t border-wa-border bg-wa-panel-header px-4 py-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-wa-danger" />
          <span className="flex-1 text-sm">
            بيسجّل... {formatDuration(recorder.seconds)}
          </span>
          <button
            type="button"
            onClick={recorder.cancel}
            className="rounded-full p-2 text-wa-danger transition hover:bg-wa-hover"
            aria-label="إلغاء التسجيل"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            onClick={handleStopRecording}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-primary text-white"
            aria-label="إرسال"
          >
            <SendIcon width={18} height={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-wa-border bg-wa-panel-header px-3 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="wa-hidden-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImage(file);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-full p-2 text-wa-secondary transition hover:bg-wa-hover disabled:opacity-50"
            aria-label="إرفاق صورة"
          >
            {uploading ? <SpinnerIcon /> : <ImageIcon />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              typing.notifyTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="اكتب رسالة"
            className="wa-scroll max-h-32 flex-1 resize-none rounded-lg bg-wa-input px-4 py-2.5 text-[15px] outline-none placeholder:text-wa-secondary"
          />

          {draft.trim() ? (
            <button
              type="button"
              onClick={handleSend}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-primary text-white transition hover:brightness-110"
              aria-label="إرسال"
            >
              <SendIcon width={18} height={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void recorder.start()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-primary text-white transition hover:brightness-110"
              aria-label="تسجيل رسالة صوتية"
            >
              <MicIcon width={18} height={18} />
            </button>
          )}
        </div>
      )}

      {recorder.error && (
        <p className="bg-wa-danger/10 px-4 py-2 text-center text-sm text-wa-danger">
          {recorder.error}
        </p>
      )}

      {/* ------------------------------ نوافذ منبثقة ------------------------------ */}
      {forwardSource && (
        <ForwardDialog
          conversations={allConversations}
          currentConversationId={conversationId}
          onCancel={() => setForwardSource(null)}
          onConfirm={handleForward}
        />
      )}

      {!readOnly && (
        <CallOverlay
          status={call.status}
          isVideo={call.isVideo}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          peerName={call.peerName || otherNames}
          peerId={primaryOther?.id ?? conversationId}
          muted={call.muted}
          cameraOff={call.cameraOff}
          error={call.error}
          onAccept={call.acceptCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
          onToggleCamera={call.toggleCamera}
        />
      )}
    </div>
  );
}
