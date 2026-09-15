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
  /** رسالة ورا رسالة من نفس الشخص — بتتلزق في اللي قبلها ومن غير ذيل */
  grouped?: boolean;
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
      <mark className="rounded bg-amber-300/80 px-0.5 text-inherit dark:bg-amber-400/40">
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
  grouped = false,
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
  const showTail = !grouped;

  /**
   * الوقت بيعوم في آخر سطر بدل ما ياخد سطر لوحده — فالرسالة القصيرة
   * بتفضل قصيرة والوقت بيقعد جنبها زي واتساب بالظبط.
   */
  const meta = (
    <span
      className={cn(
        "float-end ms-2 mt-1.5 inline-flex select-none items-center gap-1 text-[10.5px] leading-none",
        outgoing ? "text-wa-text/55" : "text-wa-secondary",
      )}
    >
      {message.expires_at && !message.is_deleted && (
        <TimerIcon width={11} height={11} aria-label="رسالة بتختفي" />
      )}
      {message.edited_at && !message.is_deleted && <span>معدّلة</span>}
      <span className="tabular-nums">{formatTime(message.created_at)}</span>
      {outgoing &&
        !message.is_deleted &&
        (message.pending ? (
          <ClockIcon width={11} height={11} aria-label="بيتبعت" />
        ) : message.is_read ? (
          <DoubleCheckIcon width={15} height={12} className="text-wa-tick" aria-label="اتقرت" />
        ) : (
          <CheckIcon width={13} height={13} aria-label="اتبعتت" />
        ))}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex w-full wa-fade-in",
        outgoing ? "justify-end" : "justify-start",
        grouped ? "mt-[3px]" : "mt-2.5",
        reactions.length > 0 && "mb-3.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[82%] rounded-xl px-2.5 py-1.5 text-[14.5px] leading-[1.55] shadow-[var(--wa-shadow)] sm:max-w-[62%]",
          outgoing ? "bg-wa-bubble-out text-wa-text" : "bg-wa-bubble-in text-wa-text",
          // rounded-se / rounded-ss = زوايا منطقية: في RTL دول فوق-شمال وفوق-يمين
          showTail && (outgoing ? "wa-tail-out rounded-se-[3px]" : "wa-tail-in rounded-ss-[3px]"),
        )}
      >
        {/* اسم الراسل — في المحادثات اللي فيها أكتر من طرفين وفي المتابعة */}
        {showSender && senderName && !outgoing && !grouped && (
          <p className="mb-0.5 text-[13px] font-semibold text-wa-primary">{senderName}</p>
        )}

        {message.is_forwarded && !message.is_deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-[11.5px] italic opacity-55">
            <ForwardIcon width={12} height={12} /> محوّلة
          </p>
        )}

        {message.is_broadcast && !message.is_deleted && (
          <p className="mb-0.5 text-[11.5px] italic opacity-55">رسالة جماعية</p>
        )}

        {/* اقتباس الرسالة اللي بنرد عليها */}
        {replyTo && (
          <div className="mb-1 overflow-hidden rounded-md border-s-[3px] border-wa-primary bg-black/[0.06] px-2 py-1 dark:bg-white/[0.07]">
            <p className="text-[12px] font-semibold text-wa-primary">
              {replyToName ?? "رسالة"}
            </p>
            <p className="line-clamp-2 text-[12.5px] opacity-65">
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

        {/* ------------------------------ المحتوى ------------------------------ */}
        {message.is_deleted ? (
          <p className="italic opacity-55">
            🚫 الرسالة دي اتمسحت
            {meta}
          </p>
        ) : message.content_type === "image" ? (
          <>
            <div className="-mx-1 mb-1 overflow-hidden rounded-lg">
              <ChatImage messageId={message.id} alt={message.content} />
            </div>
            <p className="whitespace-pre-wrap break-words">
              {message.content && message.content !== "📷 صورة" ? message.content : ""}
              {meta}
            </p>
          </>
        ) : message.content_type === "voice" ? (
          <>
            <VoicePlayer messageId={message.id} outgoing={outgoing} />
            <p className="clear-both">{meta}</p>
          </>
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
                    className="text-wa-tick underline decoration-wa-tick/40 underline-offset-2 hover:decoration-wa-tick"
                  >
                    {part.value}
                  </a>
                ) : (
                  <Highlighted key={index} text={part.value} term={highlight} />
                ),
              )}
              {meta}
            </p>
          </>
        )}

        {/* الترجمة */}
        {(translating || translation) && (
          <div className="clear-both mt-1.5 rounded-md border-s-2 border-wa-tick bg-black/[0.06] px-2 py-1 text-[13px] dark:bg-white/[0.07]">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-55">
              الترجمة
            </p>
            <p className="whitespace-pre-wrap break-words">
              {translating ? "بيترجم..." : translation}
            </p>
          </div>
        )}

        {/* التفاعلات */}
        {reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-wa-border bg-wa-panel px-1.5 py-0.5 text-[12px] shadow-sm",
              outgoing ? "start-2" : "end-2",
            )}
          >
            {Array.from(new Set(reactions.map((r) => r.emoji)))
              .slice(0, 3)
              .map((emoji) => (
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
              "absolute top-1 rounded-full p-1 text-wa-secondary opacity-0 transition hover:bg-wa-hover focus:opacity-100 group-hover:opacity-100",
              outgoing ? "start-0 -ms-8" : "end-0 -me-8",
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
              "absolute top-7 z-30 w-44 overflow-hidden rounded-xl border border-wa-border bg-wa-panel py-1 text-[13px] shadow-xl",
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
              "absolute -top-11 z-30 flex gap-0.5 rounded-full border border-wa-border bg-wa-panel px-2 py-1.5 shadow-xl",
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
                  "rounded-full px-1.5 text-lg transition hover:scale-125",
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
        "flex w-full items-center gap-2.5 px-3 py-2 text-start transition hover:bg-wa-hover",
        danger ? "text-wa-danger" : "text-wa-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
