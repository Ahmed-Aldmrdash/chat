"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/types";
import { allowContactsToChat, revokeContactsChat } from "@/actions/admin";
import { Avatar } from "@/components/Avatar";
import { ShieldIcon, SpinnerIcon } from "@/components/Icons";
import type { PermissionRow } from "./page";

export function PermissionsManager({
  contacts,
  permissions,
}: {
  contacts: Contact[];
  permissions: PermissionRow[];
}) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );

  const handleAllow = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const result = await allowContactsToChat(first, second);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess("تمام — دلوقتي يقدروا يتكلموا مع بعض ✅");
    setFirst("");
    setSecond("");
    router.refresh();
  };

  const handleToggle = async (row: PermissionRow) => {
    setPendingId(row.id);
    const result = row.allowed_by_admin
      ? await revokeContactsChat(row.contact_a_id, row.contact_b_id)
      : await allowContactsToChat(row.contact_a_id, row.contact_b_id);
    setPendingId(null);

    if (!result.ok) setError(result.error);
    else router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="h-fit rounded-xl border border-wa-border bg-wa-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <ShieldIcon width={18} height={18} /> إذن محادثة جديد
        </h2>

        <form onSubmit={handleAllow} className="space-y-3">
          <div>
            <label htmlFor="first" className="mb-1 block text-sm text-wa-secondary">
              الشخص الأول
            </label>
            <select
              id="first"
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              className="w-full rounded-lg border border-wa-border bg-wa-input px-3 py-2 outline-none focus:border-wa-primary"
            >
              <option value="">اختار...</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="second" className="mb-1 block text-sm text-wa-secondary">
              الشخص التاني
            </label>
            <select
              id="second"
              value={second}
              onChange={(event) => setSecond(event.target.value)}
              className="w-full rounded-lg border border-wa-border bg-wa-input px-3 py-2 outline-none focus:border-wa-primary"
            >
              <option value="">اختار...</option>
              {contacts
                .filter((contact) => contact.id !== first)
                .map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.display_name}
                  </option>
                ))}
            </select>
          </div>

          {error && <p className="text-sm text-wa-danger">{error}</p>}
          {success && <p className="text-sm text-wa-primary">{success}</p>}

          <button
            type="submit"
            disabled={busy || !first || !second || first === second}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-wa-primary py-2.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy && <SpinnerIcon width={16} height={16} />}
            اسمحلهم يتكلموا
          </button>
        </form>

        <p className="mt-3 text-xs text-wa-secondary">
          بيتعمل شات جديد بينهم على طول، وتقدر تتابعه من صفحة المتابعة.
        </p>
      </section>

      <section className="rounded-xl border border-wa-border bg-wa-panel">
        <h2 className="border-b border-wa-border px-5 py-3 font-semibold">
          الأذونات ({permissions.length})
        </h2>

        {permissions.length === 0 ? (
          <p className="p-6 text-center text-sm text-wa-secondary">
            مفيش أذونات لسه — كل واحد بيكلمك إنت بس
          </p>
        ) : (
          <ul className="divide-y divide-wa-border">
            {permissions.map((row) => {
              const a = byId.get(row.contact_a_id);
              const b = byId.get(row.contact_b_id);

              return (
                <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex items-center -space-x-2 rtl:space-x-reverse">
                    <Avatar
                      name={a?.display_name ?? "؟"}
                      id={row.contact_a_id}
                      url={a?.avatar_url}
                      size={34}
                    />
                    <Avatar
                      name={b?.display_name ?? "؟"}
                      id={row.contact_b_id}
                      url={b?.avatar_url}
                      size={34}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a?.display_name ?? "محذوف"} ↔ {b?.display_name ?? "محذوف"}
                    </p>
                    <p className="text-xs text-wa-secondary">
                      {row.allowed_by_admin ? "مسموح" : "متوقف — بيشوفوا التاريخ بس"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggle(row)}
                    disabled={pendingId === row.id}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                      row.allowed_by_admin
                        ? "bg-wa-danger/10 text-wa-danger hover:bg-wa-danger/20"
                        : "bg-wa-primary/15 text-wa-primary hover:bg-wa-primary/25"
                    }`}
                  >
                    {pendingId === row.id && <SpinnerIcon width={14} height={14} />}
                    {row.allowed_by_admin ? "اسحب الإذن" : "رجّع الإذن"}
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
