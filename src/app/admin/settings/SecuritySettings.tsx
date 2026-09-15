"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMfaEnrollment,
  enrollMfa,
  unenrollMfa,
} from "@/actions/auth";
import { updateStatusText } from "@/actions/profile";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { BellIcon, ShieldIcon, SpinnerIcon } from "@/components/Icons";

interface Factor {
  id: string;
  status: string;
  friendlyName: string | null;
}

export function SecuritySettings({
  myId,
  email,
  statusText,
  factors,
}: {
  myId: string;
  email: string;
  statusText: string;
  factors: Factor[];
}) {
  const router = useRouter();
  const push = usePushNotifications(myId);

  const verified = factors.find((factor) => factor.status === "verified");

  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [status, setStatus] = useState(statusText);
  const [statusBusy, setStatusBusy] = useState(false);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await enrollMfa();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrollment(result.data);
  };

  const confirmEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);

    const result = await confirmMfaEnrollment(enrollment.factorId, code);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEnrollment(null);
    setCode("");
    setMessage("المصادقة الثنائية اتفعّلت ✅");
    router.refresh();
  };

  const disable = async () => {
    if (!verified) return;
    setBusy(true);
    setError(null);

    const result = await unenrollMfa(verified.id);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage("المصادقة الثنائية اتلغت");
    router.refresh();
  };

  const saveStatus = async () => {
    setStatusBusy(true);
    const result = await updateStatusText(status);
    setStatusBusy(false);
    setMessage(result.ok ? "الحالة اتحدّثت ✅" : null);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------- 2FA ---------------- */}
      <section className="rounded-xl border border-wa-border bg-wa-panel p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <ShieldIcon width={18} height={18} /> المصادقة الثنائية (2FA)
        </h2>
        <p className="mb-4 text-xs text-wa-secondary">
          حساب الأدمن هو أهم حساب في النظام — فعّل كود الـ TOTP من Google
          Authenticator أو أي تطبيق مصادقة.
        </p>

        <p className="mb-4 rounded-lg bg-wa-hover px-3 py-2 text-sm">
          الحساب: <span dir="ltr">{email}</span>
        </p>

        {verified ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-wa-primary/10 px-3 py-2 text-sm text-wa-primary">
              ✅ المصادقة الثنائية مفعّلة
            </p>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-wa-danger/10 px-4 py-2 text-sm text-wa-danger transition hover:bg-wa-danger/20 disabled:opacity-50"
            >
              {busy && <SpinnerIcon width={14} height={14} />}
              إلغاء التفعيل
            </button>
          </div>
        ) : enrollment ? (
          <div className="space-y-3">
            <p className="text-sm">امسح الـ QR ده بتطبيق المصادقة:</p>
            {/* الـ QR جاي من Supabase كـ SVG data URI */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt="QR code للمصادقة الثنائية"
              className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
            />
            <p className="text-center text-xs text-wa-secondary">
              أو اكتب الكود يدوي:
              <br />
              <code dir="ltr" className="select-all font-mono text-[11px]">
                {enrollment.secret}
              </code>
            </p>

            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="w-full rounded-lg border border-wa-border bg-wa-input px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-wa-primary"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmEnrollment}
                disabled={busy || code.length !== 6}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-wa-primary py-2.5 text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {busy && <SpinnerIcon width={16} height={16} />}
                أكّد
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrollment(null);
                  setCode("");
                }}
                className="rounded-lg bg-wa-hover px-4 py-2.5 text-sm transition hover:bg-wa-active"
              >
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEnrollment}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-wa-primary px-5 py-2.5 text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy && <SpinnerIcon width={16} height={16} />}
            فعّل المصادقة الثنائية
          </button>
        )}

        {error && <p className="mt-3 text-sm text-wa-danger">{error}</p>}
        {message && <p className="mt-3 text-sm text-wa-primary">{message}</p>}
      </section>

      {/* ---------------- الإشعارات + الحالة ---------------- */}
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-wa-border bg-wa-panel p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <BellIcon width={18} height={18} /> إشعارات الويب
          </h2>
          <p className="mb-4 text-xs text-wa-secondary">
            هتوصلك الرسايل حتى لو الموقع مقفول. على الآيفون لازم تضيف الموقع
            للشاشة الرئيسية الأول.
          </p>

          {push.state === "unsupported" ? (
            <p className="text-sm text-wa-secondary">المتصفح ده مش بيدعم الإشعارات</p>
          ) : push.subscribed ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-wa-primary/10 px-3 py-2 text-sm text-wa-primary">
                ✅ الإشعارات مفعّلة على الجهاز ده
              </p>
              <button
                type="button"
                onClick={() => push.unsubscribe()}
                className="rounded-lg bg-wa-hover px-4 py-2 text-sm transition hover:bg-wa-active"
              >
                إيقاف الإشعارات
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const result = await push.subscribe();
                if (!result.ok) setError(result.error ?? null);
                else setMessage("الإشعارات اتفعّلت ✅");
              }}
              className="rounded-lg bg-wa-primary px-5 py-2.5 text-white transition hover:brightness-110"
            >
              فعّل الإشعارات
            </button>
          )}
        </section>

        <section className="rounded-xl border border-wa-border bg-wa-panel p-5">
          <h2 className="mb-1 font-semibold">الحالة النصية</h2>
          <p className="mb-4 text-xs text-wa-secondary">
            بتظهر تحت اسمك عند باقي الناس
          </p>

          <div className="flex gap-2">
            <input
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              maxLength={120}
              className="flex-1 rounded-lg border border-wa-border bg-wa-input px-3 py-2 outline-none focus:border-wa-primary"
            />
            <button
              type="button"
              onClick={saveStatus}
              disabled={statusBusy}
              className="flex items-center gap-2 rounded-lg bg-wa-primary px-4 py-2 text-sm text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {statusBusy && <SpinnerIcon width={14} height={14} />}
              حفظ
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
