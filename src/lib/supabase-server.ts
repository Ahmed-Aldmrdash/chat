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

/** المستخدم الحالي (أو null لو مش مسجّل دخول) */
export async function getCurrentUser() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** هل المستخدم الحالي هو الأدمن؟ (مقارنة بالإيميل الموجود في ADMIN_EMAIL) */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  const expected = adminEmail();
  if (!user?.email || !expected) return false;
  return user.email.trim().toLowerCase() === expected;
}
