"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/lib/types";
import { Avatar } from "./Avatar";
import { CloseIcon, ForwardIcon, SpinnerIcon } from "./Icons";

interface ForwardDialogProps {
  conversations: ConversationSummary[];
  currentConversationId: string;
  onCancel: () => void;
  onConfirm: (conversationIds: string[]) => Promise<void>;
}

export function ForwardDialog({
  conversations,
  currentConversationId,
  onCancel,
  onConfirm,
}: ForwardDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const targets = conversations.filter(
    (summary) => summary.conversation.id !== currentConversationId,
  );

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-wa-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-wa-border px-4 py-3">
          <h3 className="font-semibold">تحويل لـ...</h3>
          <button type="button" onClick={onCancel} aria-label="إغلاق" className="text-wa-secondary">
            <CloseIcon />
          </button>
        </header>

        <div className="wa-scroll flex-1 overflow-y-auto">
          {targets.length === 0 && (
            <p className="p-6 text-center text-sm text-wa-secondary">مفيش محادثات تانية</p>
          )}

          {targets.map((summary) => {
            const other = summary.others[0];
            const name = summary.others.map((o) => o.display_name).join("، ") || "محادثة";
            const isSelected = selected.includes(summary.conversation.id);

            return (
              <button
                key={summary.conversation.id}
                type="button"
                onClick={() => toggle(summary.conversation.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-wa-hover"
              >
                <Avatar
                  name={name}
                  id={other?.id ?? summary.conversation.id}
                  url={other?.avatar_url}
                  size={40}
                />
                <span className="flex-1 truncate">{name}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-wa-primary bg-wa-primary text-white"
                      : "border-wa-border"
                  }`}
                >
                  {isSelected && "✓"}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-wa-border px-4 py-3">
          <span className="text-sm text-wa-secondary">{selected.length} مختارة</span>
          <button
            type="button"
            disabled={selected.length === 0 || busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(selected);
              setBusy(false);
            }}
            className="flex items-center gap-2 rounded-full bg-wa-primary px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? <SpinnerIcon width={16} height={16} /> : <ForwardIcon width={16} height={16} />}
            تحويل
          </button>
        </footer>
      </div>
    </div>
  );
}
