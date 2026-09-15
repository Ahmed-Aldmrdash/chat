"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/lib/types";
import { ChatWindow } from "@/components/ChatWindow";
import { Avatar } from "@/components/Avatar";
import { cn, formatConversationTime } from "@/lib/utils";
import { EyeIcon } from "@/components/Icons";

export function MonitorView({
  myId,
  conversations,
}: {
  myId: string;
  conversations: ConversationSummary[];
}) {
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.conversation.id ?? null,
  );

  const active = conversations.find(
    (summary) => summary.conversation.id === activeId,
  );

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-wa-border bg-wa-panel p-10 text-center">
        <EyeIcon width={36} height={36} className="mx-auto mb-3 text-wa-secondary" />
        <p className="text-wa-secondary">
          مفيش محادثات بين الناس لسه — افتح إذن من صفحة الصلاحيات الأول
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="h-fit overflow-hidden rounded-2xl border border-wa-border bg-wa-panel">
        <h2 className="border-b border-wa-border px-4 py-3 text-sm font-semibold">
          المحادثات ({conversations.length})
        </h2>
        <ul className="wa-scroll max-h-[60vh] overflow-y-auto">
          {conversations.map((summary) => {
            const name = summary.others.map((o) => o.display_name).join(" ↔ ");
            return (
              <li key={summary.conversation.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(summary.conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-start transition",
                    summary.conversation.id === activeId
                      ? "bg-wa-active"
                      : "hover:bg-wa-hover",
                  )}
                >
                  <div className="flex items-center -space-x-2 rtl:space-x-reverse">
                    {summary.others.slice(0, 2).map((contact) => (
                      <Avatar
                        key={contact.id}
                        name={contact.display_name}
                        id={contact.id}
                        url={contact.avatar_url}
                        size={32}
                      />
                    ))}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-wa-secondary">
                      {summary.lastMessage?.content ?? "مفيش رسايل"}
                    </p>
                  </div>

                  <span className="shrink-0 text-[11px] text-wa-secondary">
                    {summary.lastMessage
                      ? formatConversationTime(summary.lastMessage.created_at)
                      : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="h-[70vh] overflow-hidden rounded-xl border border-wa-border">
        {active && (
          <ChatWindow
            key={active.conversation.id}
            myId={myId}
            myName="الأدمن"
            summary={active}
            readOnly
            isAdmin
          />
        )}
      </div>
    </div>
  );
}
