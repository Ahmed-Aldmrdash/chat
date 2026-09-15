"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, verifyMfaCode } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SpinnerIcon } from "@/components/Icons";

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState("/chat");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn(identifier, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setRedirectTo(result.data.redirectTo);

    // الأدمن مفعّل عنده 2FA → خطوة تانية
    if (result.data.mfaRequired && result.data.factorId) {
      setFactorId(result.data.factorId);
      return;
    }

    router.replace(result.data.redirectTo);
    router.refresh();
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId) return;

    setBusy(true);
    setError(null);

    const result = await verifyMfaCode(factorId, code);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-wa-border bg-wa-panel p-6 shadow-sm">
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
      </div>

      {factorId ? (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm text-wa-secondary">
              كود التحقق (من تطبيق المصادقة)
            </label>
            <input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-wa-primary"
            />
          </div>

          {error && <p className="text-sm text-wa-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-wa-primary py-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy && <SpinnerIcon width={18} height={18} />}
            تأكيد
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1 block text-sm text-wa-secondary">
              اسم المستخدم
            </label>
            <input
              id="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              autoFocus
              dir="ltr"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-4 py-3 text-start outline-none focus:border-wa-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-wa-secondary">
              كلمة السر
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              dir="ltr"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-4 py-3 text-start outline-none focus:border-wa-primary"
            />
          </div>

          {error && <p className="text-sm text-wa-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || !identifier || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-wa-primary py-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy && <SpinnerIcon width={18} height={18} />}
            دخول
          </button>
        </form>
      )}
    </div>
  );
}
