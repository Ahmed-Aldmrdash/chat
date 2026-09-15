"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, MessageReaction } from "@/lib/types";
import { cn, extractFirstUrl, formatTime, splitByUrls } from "@/lib/utils";
import { translateMessage } from "@/actions/tools";
import { ChatImage } from "./ChatImage";
import { VoicePlayer } from "./VoicePlayer";
import { LinkPreviewCard } from "./LinkPreviewCard";
import {
  CheckIcon,
  ClockIcon,
  DoubleCheckIcon,
  EditIcon,
  EmojiIcon,
  ForwardIcon,
  MoreIcon,
  ReplyIcon,
  TimerIcon,
  TranslateIcon,
  TrashIcon,
} from "./Icons";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageBubbleProps {
  message: Message;
  outgoing: boolean;
  senderName?: string;
  showSender?: boolean;
  replyTo?: Message | null;
  replyToName?: string;
  reactions: MessageReaction[];
  myId: string;
  readOnly?: boolean;
  highlight?: string;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onReact?: (message: Message, emoji: string) => void;
}

/** بيلوّن الكلمة اللي المستخدم بيدوّر عليها جوه الرسالة */
function Highlighted({ text, term }: { text: string; term?: string }) {
  if (!term || term.length < 2) return <>{text}</>;

  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-yellow-300/70 text-inherit dark:bg-yellow-500/50">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

export function MessageBubble({
  message,
  outgoing,
  senderName,
  showSender,
  replyTo,
  replyToName,
  reactions,
  myId,
  readOnly,
  highlight,
  onReply,
  onForward,
  onDelete,
  onEdit,
  onReact,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !emojiOpen) return;

    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen, emojiOpen]);

  const handleTranslate = async () => {
    setMenuOpen(false);
    if (translation) {
      setTranslation(null);
      return;
    }
    setTranslating(true);
    const result = await translateMessage(message.content);
    setTranslating(false);
    setTranslation(result.ok ? result.data.translated : "مش قادر يترجم دلوقتي");
  };

  const firstUrl =
    message.content_type === "text" && !message.is_deleted
      ? extractFirstUrl(message.content)
      : null;

  const myReaction = reactions.find((r) => r.user_id === myId)?.emoji;
  const canEdit = outgoing && message.content_type === "text" && !message.is_deleted;

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex w-full wa-fade-in",
        outgoing ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-2 pb-5 pt-1.5 text-[14.2px] leading-[19px] shadow-[var(--wa-shadow)] sm:max-w-[65%]",
          outgoing
            ? "wa-tail-out rounded-te-none bg-wa-bubble-out text-wa-text"
            : "wa-tail-in rounded-ts-none bg-wa-bubble-in text-wa-text",
          reactions.length > 0 && "mb-3",
        )}
      >
        {/* اسم الراسل — بيظهر في محادثات أكتر من طرفين وفي شاشة المتابعة */}
        {showSender && senderName && !outgoing && (
          <p className="mb-0.5 text-[13px] font-semibold text-wa-primary">{senderName}</p>
        )}

        {message.is_forwarded && !message.is_deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-[12px] italic opacity-60">
            <ForwardIcon width={12} height={12} /> محوّلة
          </p>
        )}

        {message.is_broadcast && !message.is_deleted && (
          <p className="mb-0.5 text-[12px] italic opacity-60">رسالة جماعية</p>
        )}

        {/* اقتباس الرسالة اللي بنرد عليها */}
        {replyTo && (
          <div className="mb-1 rounded border-s-4 border-wa-primary bg-black/5 px-2 py-1 dark:bg-white/5">
            <p className="text-[12px] font-semibold text-wa-primary">
              {replyToName ?? "رسالة"}
            </p>
            <p className="line-clamp-2 text-[12.5px] opacity-70">
              {replyTo.is_deleted
                ? "رسالة اتمسحت"
                : replyTo.content_type === "image"
                  ? "📷 صورة"
                  : replyTo.content_type === "voice"
                    ? "🎤 رسالة صوتية"
                    : replyTo.content}
            </p>
          </div>
        )}

        {/* المحتوى */}
        {message.is_deleted ? (
          <p className="italic opacity-60">🚫 الرسالة دي اتمسحت</p>
        ) : message.content_type === "image" ? (
          <div className="mb-1">
            <ChatImage messageId={message.id} alt={message.content} />
            {message.content && message.content !== "📷 صورة" && (
              <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        ) : message.content_type === "voice" ? (
          <VoicePlayer messageId={message.id} outgoing={outgoing} />
        ) : (
          <>
            {firstUrl && <LinkPreviewCard url={firstUrl} />}
            <p className="whitespace-pre-wrap break-words">
              {splitByUrls(message.content).map((part, index) =>
                part.type === "url" ? (
                  <a
                    key={index}
                    href={part.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-wa-tick underline underline-offset-2"
                  >
                    {part.value}
                  </a>
                ) : (
                  <Highlighted key={index} text={part.value} term={highlight} />
                ),
              )}
            </p>
          </>
        )}

        {/* الترجمة */}
        {(translating || translation) && (
          <div className="mt-1 rounded border-s-2 border-wa-tick bg-black/5 px-2 py-1 text-[13px] dark:bg-white/5">
            <p className="text-[11px] font-semibold opacity-60">الترجمة</p>
            <p className="whitespace-pre-wrap break-words">
              {translating ? "بيترجم..." : translation}
            </p>
          </div>
        )}

        {/* الوقت + علامات القراءة */}
        <div className="absolute bottom-1 end-2 flex items-center gap-1 text-[11px] text-wa-secondary">
          {message.expires_at && !message.is_deleted && (
            <TimerIcon width={11} height={11} aria-label="رسالة بتختفي" />
          )}
          {message.edited_at && !message.is_deleted && <span>معدّلة</span>}
          <span>{formatTime(message.created_at)}</span>
          {outgoing &&
            !message.is_deleted &&
            (message.pending ? (
              <ClockIcon width={12} height={12} aria-label="بيتبعت" />
            ) : message.is_read ? (
              <DoubleCheckIcon className="text-wa-tick" aria-label="اتقرت" />
            ) : (
              <CheckIcon aria-label="اتبعتت" />
            ))}
        </div>

        {/* التفاعلات */}
        {reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-wa-border bg-wa-panel px-1.5 py-0.5 text-[12px] shadow",
              outgoing ? "start-1" : "end-1",
            )}
          >
            {Array.from(new Set(reactions.map((r) => r.emoji))).slice(0, 3).map((emoji) => (
              <span key={emoji}>{emoji}</span>
            ))}
            {reactions.length > 1 && (
              <span className="text-[11px] text-wa-secondary">{reactions.length}</span>
            )}
          </div>
        )}

        {/* زرار القايمة */}
        {!readOnly && !message.is_deleted && !message.pending && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen((open) => !open);
              setEmojiOpen(false);
            }}
            aria-label="خيارات الرسالة"
            className={cn(
              "absolute top-0 rounded p-1 text-wa-secondary opacity-0 transition group-hover:opacity-100 focus:opacity-100",
              outgoing ? "start-0 -ms-7" : "end-0 -me-7",
              menuOpen && "opacity-100",
            )}
          >
            <MoreIcon width={16} height={16} />
          </button>
        )}

        {/* القايمة */}
        {menuOpen && !readOnly && (
          <div
            className={cn(
              "absolute top-6 z-20 w-44 overflow-hidden rounded-lg border border-wa-border bg-wa-panel py-1 text-[13px] shadow-lg",
              outgoing ? "start-0 -ms-2" : "end-0 -me-2",
            )}
          >
            <MenuItem
              icon={<ReplyIcon width={15} height={15} />}
              label="رد"
              onClick={() => {
                onReply?.(message);
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<EmojiIcon width={15} height={15} />}
              label="تفاعل"
              onClick={() => {
                setEmojiOpen(true);
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<ForwardIcon width={15} height={15} />}
              label="تحويل"
              onClick={() => {
                onForward?.(message);
                setMenuOpen(false);
              }}
            />
            {message.content_type === "text" && (
              <MenuItem
                icon={<TranslateIcon width={15} height={15} />}
                label={translation ? "إخفاء الترجمة" : "ترجم"}
                onClick={handleTranslate}
              />
            )}
            {canEdit && (
              <MenuItem
                icon={<EditIcon width={15} height={15} />}
                label="تعديل"
                onClick={() => {
                  onEdit?.(message);
                  setMenuOpen(false);
                }}
              />
            )}
            {outgoing && (
              <MenuItem
                icon={<TrashIcon width={15} height={15} />}
                label="حذف"
                danger
                onClick={() => {
                  onDelete?.(message);
                  setMenuOpen(false);
                }}
              />
            )}
          </div>
        )}

        {/* اختيار الإيموجي */}
        {emojiOpen && !readOnly && (
          <div
            className={cn(
              "absolute -top-10 z-20 flex gap-1 rounded-full border border-wa-border bg-wa-panel px-2 py-1 shadow-lg",
              outgoing ? "start-0" : "end-0",
            )}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact?.(message, emoji);
                  setEmojiOpen(false);
                }}
                className={cn(
                  "rounded-full px-1 text-lg transition hover:scale-125",
                  myReaction === emoji && "bg-wa-primary/20",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
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
