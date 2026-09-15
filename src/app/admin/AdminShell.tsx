import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackIcon } from "@/components/Icons";
import { ADMIN_NAV } from "./nav";

/** الإطار المشترك لكل صفحات لوحة التحكم الفرعية */
export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-wa-bg">
      <header className="sticky top-0 z-20 border-b border-wa-border/70 bg-wa-panel-header/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-1 pt-3">
          <Link
            href="/admin"
            className="rounded-full p-2 text-wa-secondary transition hover:bg-wa-hover hover:text-wa-text"
            aria-label="رجوع للمحادثات"
          >
            <BackIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-semibold leading-tight">{title}</h1>
            {description && (
              <p className="truncate text-[12.5px] text-wa-secondary">{description}</p>
            )}
          </div>
          <ThemeToggle />
        </div>

        <nav className="wa-scroll mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 pb-2.5 pt-1">
          {ADMIN_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-wa-secondary transition hover:bg-wa-hover hover:text-wa-text"
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
