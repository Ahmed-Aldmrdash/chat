"use server";

import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/types";

/** الحالة النصية اللي بتظهر تحت الاسم */
export async function updateStatusText(statusText: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const text = statusText.trim().slice(0, 120);
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("contacts")
    .update({ status_text: text || "متاح" })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
