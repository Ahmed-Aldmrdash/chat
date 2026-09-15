"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/types";
import { createUserForContact, toggleBlockContact } from "@/actions/admin";
import { Avatar } from "@/components/Avatar";
import { formatLastSeen } from "@/lib/utils";
import { BlockIcon, PlusIcon, SpinnerIcon } from "@/components/Icons";

export function UsersManager({
  contacts,
  adminId,
}: {
  contacts: Contact[];
  adminId: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const result = await createUserForContact(username, displayName, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(
      `اتعمل حساب لـ ${displayName} ✅ — ابعتله اسم المستخدم وكلمة السر`,
    );
    setUsername("");
    setDisplayName("");
    setPassword("");
    router.refresh();
  };

  const handleToggleBlock = async (contact: Contact) => {
    setPendingId(contact.id);
    const result = await toggleBlockContact(contact.id, !contact.is_blocked);
    setPendingId(null);
    if (!result.ok) setError(result.error);
    else router.refresh();
  };

  /** كلمة سر عشوائية قوية بدل ما المستخدم يفكّر في واحدة */
  const generatePassword = () => {
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
    const values = crypto.getRandomValues(new Uint32Array(14));
    setPassword(Array.from(values, (value) => alphabet[value % alphabet.length]).join(""));
  };

  const others = contacts.filter((contact) => contact.id !== adminId);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ---------------- فورم الإنشاء ---------------- */}
      <section className="h-fit rounded-2xl border border-wa-border bg-wa-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <PlusIcon width={18} height={18} /> حساب جديد
        </h2>

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label htmlFor="displayName" className="mb-1 block text-sm text-wa-secondary">
              الاسم المعروض
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="أحمد"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-3 py-2 outline-none focus:border-wa-primary"
            />
          </div>

          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-wa-secondary">
              اسم المستخدم (إنجليزي)
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ahmed"
              dir="ltr"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-3 py-2 text-start outline-none focus:border-wa-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-wa-secondary">
              كلمة السر (8 حروف على الأقل)
            </label>
            <div className="flex gap-2">
              <input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-wa-border bg-wa-input px-3 py-2 text-start outline-none focus:border-wa-primary"
              />
              <button
                type="button"
                onClick={generatePassword}
                className="shrink-0 rounded-lg bg-wa-hover px-3 text-sm transition hover:bg-wa-active"
              >
                ولّد
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-wa-danger">{error}</p>}
          {success && <p className="text-sm text-wa-primary">{success}</p>}

          <button
            type="submit"
            disabled={busy || !username || !displayName || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-wa-primary py-2.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy && <SpinnerIcon width={16} height={16} />}
            انشئ الحساب
          </button>
        </form>

        <p className="mt-3 text-xs text-wa-secondary">
          بيتعمل حساب + محادثة جاهزة بينك وبينه على طول.
        </p>
      </section>

      {/* ---------------- قايمة المستخدمين ---------------- */}
      <section className="rounded-2xl border border-wa-border bg-wa-panel">
        <h2 className="border-b border-wa-border px-5 py-3 font-semibold">
          كل المستخدمين ({others.length})
        </h2>

        {others.length === 0 ? (
          <p className="p-6 text-center text-sm text-wa-secondary">
            مفيش مستخدمين لسه — ابدأ بإنشاء أول حساب
          </p>
        ) : (
          <ul className="divide-y divide-wa-border">
            {others.map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar
                  name={contact.display_name}
                  id={contact.id}
                  url={contact.avatar_url}
                  size={40}
                />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {contact.display_name}
                    {contact.is_blocked && (
                      <span className="rounded-full bg-wa-danger/15 px-2 py-0.5 text-[11px] text-wa-danger">
                        موقوف
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-wa-secondary">
                    {formatLastSeen(contact.last_seen)}
                    {contact.status_text ? ` · ${contact.status_text}` : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleBlock(contact)}
                  disabled={pendingId === contact.id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                    contact.is_blocked
                      ? "bg-wa-primary/15 text-wa-primary hover:bg-wa-primary/25"
                      : "bg-wa-danger/10 text-wa-danger hover:bg-wa-danger/20"
                  }`}
                >
                  {pendingId === contact.id ? (
                    <SpinnerIcon width={14} height={14} />
                  ) : (
                    <BlockIcon width={14} height={14} />
                  )}
                  {contact.is_blocked ? "فك الإيقاف" : "أوقف الإرسال"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
