"use client";

import { useEffect } from "react";
import { touchPresence } from "@/actions/profile";

const INTERVAL_MS = 30_000;

/**
 * بيحدّث last_seen بتاع المستخدم كل 30 ثانية طول ما التاب مفتوح،
 * وبيوقف لما التاب يبقى في الخلفية عشان مايستهلكش من غير لزوم.
 */
export function usePresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const ping = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      void touchPresence();
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
