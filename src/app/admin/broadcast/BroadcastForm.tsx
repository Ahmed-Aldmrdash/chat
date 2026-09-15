"use client";

import { useState } from "react";
import type { Contact } from "@/lib/types";
import { broadcastMessage } from "@/actions/admin";
import { Avatar } from "@/components/Avatar";
import { BroadcastIcon, SpinnerIcon } from "@/components/Icons";

export function BroadcastForm({ contacts }: { contacts: Contact[] }) {
  const [content, setContent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const active = contacts.filter((contact) => !contact.is_blocked);
  const allSelected = selected.length === active.length && active.length > 0;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const send = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);

    const result = await broadcastMessage(content, selected);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(`الرسالة اتبعتت لـ ${result.data.delivered} محادثة ✅`);
    setContent("");
    setSelected([]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-wa-border bg-wa-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <BroadcastIcon width={18} height={18} /> نص الرسالة
        </h2>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={7}
          placeholder="اكتب الرسالة اللي هتتبعت للكل..."
          className="w-full resize-none rounded-lg border border-wa-border bg-wa-input px-4 py-3 outline-none focus:border-wa-primary"
        />

        {error && <p className="mt-2 text-sm text-wa-danger">{error}</p>}
        {success && <p className="mt-2 text-sm text-wa-primary">{success}</p>}

        <button
          type="button"
          onClick={send}
          disabled={busy || !content.trim() || selected.length === 0}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-wa-primary px-6 py-2.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy && <SpinnerIcon width={16} height={16} />}
          ابعت لـ {selected.length} شخص
        </button>
      </section>

      <section className="h-fit overflow-hidden rounded-xl border border-wa-border bg-wa-panel">
        <div className="flex items-center justify-between border-b border-wa-border px-4 py-3">
          <h2 className="text-sm font-semibold">المستقبلين</h2>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : active.map((c) => c.id))}
            className="text-xs text-wa-primary"
          >
            {allSelected ? "إلغاء الكل" : "اختار الكل"}
          </button>
        </div>

        {active.length === 0 ? (
          <p className="p-6 text-center text-sm text-wa-secondary">مفيش مستخدمين</p>
        ) : (
          <ul className="wa-scroll max-h-[55vh] divide-y divide-wa-border overflow-y-auto">
            {active.map((contact) => {
              const isSelected = selected.includes(contact.id);
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => toggle(contact.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-wa-hover"
                  >
                    <Avatar
                      name={contact.display_name}
                      id={contact.id}
                      url={contact.avatar_url}
                      size={34}
                    />
                    <span className="flex-1 truncate text-sm">{contact.display_name}</span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                        isSelected
                          ? "border-wa-primary bg-wa-primary text-white"
                          : "border-wa-border"
                      }`}
                    >
                      {isSelected && "✓"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
