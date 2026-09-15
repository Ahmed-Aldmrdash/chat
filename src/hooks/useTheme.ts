"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "wa-theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** الحقيقة الوحيدة للثيم = كلاس .dark على الـ <html> */
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** على السيرفر مفيش DOM، وسكربت صغير في الـ layout بيظبط الكلاس قبل أول رسم */
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * تبديل الدارك مود.
 * الثيم بيتحفظ في localStorage وبيتطبّق كـ كلاس .dark على الـ <html>.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // متصفح رافض التخزين (وضع التصفح الخفي مثلًا) — الثيم هيشتغل للجلسة دي بس
    }
    listeners.forEach((listener) => listener());
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
