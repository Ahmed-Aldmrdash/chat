"use server";

import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/types";

export interface SerializedSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** تسجيل اشتراك الجهاز الحالي في إشعارات الـ Push */
export async function savePushSubscription(
  subscription: SerializedSubscription,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, error: "بيانات الاشتراك ناقصة" };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
