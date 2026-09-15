"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePublicSupabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/**
 * Supabase client بتاع المتصفح (anon key).
 * بنعمله مرة واحدة بس (singleton) عشان الـ Realtime channels متتكررش.
 * الإنشاء lazy عشان الـ build ميحاولش يقراه من غير متغيرات بيئة.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (client) return client;
  const { supabaseUrl, supabaseAnonKey } = requirePublicSupabaseEnv();
  client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
