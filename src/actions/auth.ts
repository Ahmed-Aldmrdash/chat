"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseServer } from "@/lib/supabase-server";
import { adminEmail } from "@/lib/env";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/username";
import type { ActionResult } from "@/lib/types";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export interface SignInResult {
  /** الأدمن مفعّل عنده 2FA ولازم يدخل كود TOTP */
  mfaRequired: boolean;
  factorId: string | null;
  redirectTo: string;
}

/**
 * الأدمن بيدخل بإيميله الحقيقي، وأي contact بيدخل بالـ username بتاعه
 * (اللي بيتحوّل لإيميل داخلي وهمي).
 */
function resolveEmail(identifier: string): string | null {
  const value = identifier.trim();
  if (!value) return null;
  if (value.includes("@")) return value.toLowerCase();
  if (!isValidUsername(value)) return null;
  return usernameToEmail(value);
}

/**
 * كام محاولة فاشلة اتسجّلت للـ identifier ده في آخر 15 دقيقة؟
 * بنستخدم service_role لأن جدول login_attempts مقفول بالكامل على المستخدمين.
 */
export async function checkRateLimit(
  identifier: string,
): Promise<ActionResult<{ remaining: number; blockedForMinutes: number }>> {
  const key = normalizeUsername(identifier);
  if (!key) return { ok: false, error: "اسم المستخدم مطلوب" };

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("login_attempts")
    .select("attempted_at")
    .eq("identifier", key)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const attempts = data ?? [];
  if (attempts.length < MAX_ATTEMPTS) {
    return {
      ok: true,
      data: { remaining: MAX_ATTEMPTS - attempts.length, blockedForMinutes: 0 },
    };
  }

  const oldest = new Date(attempts[0].attempted_at).getTime();
  const unblockAt = oldest + WINDOW_MINUTES * 60_000;
  const minutes = Math.max(1, Math.ceil((unblockAt - Date.now()) / 60_000));

  return { ok: true, data: { remaining: 0, blockedForMinutes: minutes } };
}

export async function recordLoginAttempt(identifier: string): Promise<void> {
  const key = normalizeUsername(identifier);
  if (!key) return;
  await getSupabaseAdmin().from("login_attempts").insert({ identifier: key });
}

export async function clearLoginAttempts(identifier: string): Promise<void> {
  const key = normalizeUsername(identifier);
  if (!key) return;
  await getSupabaseAdmin().from("login_attempts").delete().eq("identifier", key);
}

/** تسجيل الدخول بـ username (أو إيميل الأدمن) + password */
export async function signIn(
  identifier: string,
  password: string,
): Promise<ActionResult<SignInResult>> {
  const email = resolveEmail(identifier);
  if (!email || !password) {
    return { ok: false, error: "اسم المستخدم أو كلمة السر غلط" };
  }

  const limit = await checkRateLimit(identifier);
  if (!limit.ok) return { ok: false, error: limit.error };
  if (limit.data.remaining === 0) {
    return {
      ok: false,
      error: `محاولات كتير جدًا. جرّب تاني بعد ${limit.data.blockedForMinutes} دقيقة.`,
    };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordLoginAttempt(identifier);
    const left = limit.data.remaining - 1;
    return {
      ok: false,
      error:
        left > 0
          ? `اسم المستخدم أو كلمة السر غلط (فاضل ${left} محاولات)`
          : "اسم المستخدم أو كلمة السر غلط",
    };
  }

  await clearLoginAttempts(identifier);

  const isAdmin = email === adminEmail();
  const redirectTo = isAdmin ? "/admin" : "/chat";

  // لو الحساب مفعّل عليه 2FA، الـ session بتبقى aal1 ولازم نكمّل بالكود
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (verified) {
      return {
        ok: true,
        data: { mfaRequired: true, factorId: verified.id, redirectTo },
      };
    }
  }

  return { ok: true, data: { mfaRequired: false, factorId: null, redirectTo } };
}

/** إكمال تسجيل الدخول بكود الـ TOTP (الخطوة التانية للأدمن) */
export async function verifyMfaCode(
  factorId: string,
  code: string,
): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) return { ok: false, error: "الكود غلط أو انتهت صلاحيته" };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
}

/* ==========================================================================
   إعدادات الـ 2FA للأدمن (/admin/settings)
   ========================================================================== */

export async function listMfaFactors(): Promise<
  ActionResult<{ id: string; status: string; friendlyName: string | null }[]>
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data?.totp ?? []).map((f) => ({
      id: f.id,
      status: f.status,
      friendlyName: f.friendly_name ?? null,
    })),
  };
}

/** بدء تفعيل 2FA: بيرجّع QR code عشان يتقرا من Google Authenticator */
export async function enrollMfa(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `الأدمن — ${new Date().toLocaleDateString("ar-EG")}`,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "مش قادر يبدأ تفعيل الـ 2FA" };
  }
  return {
    ok: true,
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}

/** تأكيد تفعيل الـ 2FA بأول كود */
export async function confirmMfaEnrollment(
  factorId: string,
  code: string,
): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) return { ok: false, error: "الكود غلط، جرّب تاني" };
  return { ok: true };
}

export async function unenrollMfa(factorId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
