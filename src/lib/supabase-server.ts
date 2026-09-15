import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePublicSupabaseEnv } from "./env";
import { adminEmail } from "./env";

/**
 * Supabase client للسيرفر (SSR) — بيقرا ويكتب الـ session من الكوكيز،
 * وبيشتغل بصلاحيات المستخدم الحالي يعني الـ RLS بتطبّق عليه عادي.
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = requirePublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // بيحصل لما نستدعيها من Server Component — الـ middleware بيتكفّل بتجديد الـ session
        }
      },
    },
  });
}

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * المستخدم الحالي (أو null لو مش مسجّل دخول).
 *
 * getUser() بتكلّم سيرفر Supabase في كل مرة عشان تتأكد من التوكن — يعني
 * رحلة شبكة كاملة على كل server action. getClaims() بتتحقق من التوكن
 * محليًا بمفتاح عام متخزّن، فالتحقق بيبقى بدون شبكة.
 * ولو الـ claims مفيهاش إيميل بنرجع لـ getUser() عشان نفضل مظبوطين.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getSupabaseServer();

  const fromServer = async (): Promise<CurrentUser | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  };

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: string; email?: string } | undefined;

    if (error || !claims?.sub) return fromServer();
    if (!claims.email) return fromServer();

    return { id: claims.sub, email: claims.email };
  } catch {
    return fromServer();
  }
}

/** هل المستخدم الحالي هو الأدمن؟ (مقارنة بالإيميل الموجود في ADMIN_EMAIL) */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  const expected = adminEmail();
  if (!user?.email || !expected) return false;
  return user.email.trim().toLowerCase() === expected;
}
