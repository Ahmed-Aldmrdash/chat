"use client";

import { useEffect, useState } from "react";

/**
 * وقت متجدّد للاستخدام في الرندر (زي حساب "متصل دلوقتي").
 * قراءة Date.now() مباشرة جوه الرندر بتعتبر غير نقية وبتخلي الواجهة
 * متحدّثش لوحدها، فبنخليها state بيتحدّث على فترات.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    // أول قراءة بعد أول رسم، وبعدين كل فترة
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, intervalMs);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
