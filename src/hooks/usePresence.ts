"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const INTERVAL_MS = 30_000;

/**
 * بيحدّث last_seen بتاع المستخدم كل 30 ثانية طول ما التاب مفتوح،
 * وبيوقف لما التاب يبقى في الخلفية.
 *
 * التحديث بيروح للداتابيز مباشرة من المتصفح (سياسة contacts_update_own
 * بتسمح لكل واحد يعدّل صفه هو بس) — كده مش بنشغّل server action كل نص
 * دقيقة على كل تاب مفتوح.
 */
export function usePresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const ping = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      void getSupabaseBrowser()
        .from("contacts")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", userId);
    };

    ping();
    const timer = setInterval(ping, INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [userId]);
}
