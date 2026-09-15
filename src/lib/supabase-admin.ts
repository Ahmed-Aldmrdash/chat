import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServiceRoleEnv } from "./env";

/**
 * ⚠️ Supabase client بصلاحيات service_role — بيتخطّى كل الـ RLS.
 * ممنوع منعًا باتًا استخدامه في أي كود بيشتغل في المتصفح.
 * الـ "server-only" فوق بتخلّي الـ build يفشل لو حد عمله import من client component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = requireServiceRoleEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
