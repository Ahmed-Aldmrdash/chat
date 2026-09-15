/**
 * قراءة متغيرات البيئة بشكل آمن.
 * بنقرا القيم وقت الاستخدام مش وقت الـ build، عشان الـ build ميفشلش
 * لو المتغيرات لسه مش متظبطة.
 */

export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  };
}

export function requirePublicSupabaseEnv() {
  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "ناقص NEXT_PUBLIC_SUPABASE_URL أو NEXT_PUBLIC_SUPABASE_ANON_KEY في .env.local",
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}

export function requireServiceRoleEnv() {
  const { supabaseUrl } = publicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "ناقص NEXT_PUBLIC_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY في .env.local",
    );
  }
  return { supabaseUrl, serviceRoleKey };
}

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
}
