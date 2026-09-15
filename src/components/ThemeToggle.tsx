"use client";

import { useTheme } from "@/hooks/useTheme";
import { MoonIcon, SunIcon } from "./Icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
      aria-label="تبديل الثيم"
      className={`rounded-full p-2 text-wa-secondary transition hover:bg-wa-hover hover:text-wa-text ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
