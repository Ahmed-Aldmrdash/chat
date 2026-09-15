import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

/**
 * الخط بيتحمّل مع التطبيق نفسه (self-hosted) مش من سيرفر خارجي،
 * فمفيش طلب زيادة ولا اهتزاز في النص وهو بيتحمّل.
 */
const appFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "الشات",
  description: "تطبيق شات شخصي — بدعوة من الأدمن فقط",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "الشات",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f2f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111b21" },
  ],
};

/**
 * بنطبّق الثيم قبل أول رسم للصفحة عشان مايحصلش "ومضة" بيضا في الدارك مود.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("wa-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored || (prefersDark ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={appFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
