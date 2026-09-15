"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getCurrentUser } from "@/lib/supabase-server";
import type { ActionResult, LinkPreview } from "@/lib/types";

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;

/* ==========================================================================
   الترجمة — MyMemory API (مجانية، من غير مفتاح)
   ========================================================================== */

const ARABIC_REGEX = /[؀-ۿ]/;

function detectLanguage(text: string): "ar" | "en" {
  return ARABIC_REGEX.test(text) ? "ar" : "en";
}

export async function translateMessage(
  text: string,
  targetLang?: string,
): Promise<ActionResult<{ translated: string; from: string; to: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const source = text.trim().slice(0, 500);
  if (!source) return { ok: false, error: "مفيش نص للترجمة" };

  const from = detectLanguage(source);
  // لو مالوش لغة هدف محددة: عربي → إنجليزي، وأي حاجة تانية → عربي
  const to = (targetLang || (from === "ar" ? "en" : "ar")).toLowerCase();

  if (from === to) {
    return { ok: true, data: { translated: source, from, to } };
  }

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", source);
  url.searchParams.set("langpair", `${from}|${to}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return { ok: false, error: "خدمة الترجمة مش متاحة دلوقتي" };

    const payload = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
      responseDetails?: string;
    };

    const translated = payload.responseData?.translatedText?.trim();
    if (!translated) {
      return { ok: false, error: payload.responseDetails || "مش قادر يترجم" };
    }

    return { ok: true, data: { translated, from, to } };
  } catch {
    return { ok: false, error: "الترجمة أخدت وقت طويل، جرّب تاني" };
  } finally {
    clearTimeout(timer);
  }
}

/* ==========================================================================
   معاينة الروابط
   ========================================================================== */

/** بنمنع الطلبات اللي بتروح لشبكة داخلية (SSRF) */
function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
    if (normalized.startsWith("fe80")) return true; // link-local
    if (normalized.startsWith("::ffff:")) {
      return isPrivateAddress(normalized.slice(7));
    }
    return false;
  }

  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** بيدوّر على <meta property="og:x" content="..."> بأي ترتيب للخصائص */
function readMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`,
      "i",
    );
    const tag = html.match(pattern)?.[0];
    if (!tag) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content);
  }
  return null;
}

export async function getLinkPreview(
  rawUrl: string,
): Promise<ActionResult<LinkPreview>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "اللينك مش صحيح" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "اللينك مش مدعوم" };
  }

  // بنتأكد إن الدومين مش بيشاور على شبكة داخلية
  try {
    const resolved = await lookup(url.hostname, { all: true });
    if (!resolved.length || resolved.some((entry) => isPrivateAddress(entry.address))) {
      return { ok: false, error: "اللينك مش مدعوم" };
    }
  } catch {
    return { ok: false, error: "مش قادر يوصل للينك" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // بعض المواقع بتحجب الطلبات اللي من غير user agent
        "User-Agent": "Mozilla/5.0 (compatible; PersonalChatBot/1.0; +link-preview)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return { ok: false, error: "مش قادر يقرا اللينك" };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { ok: false, error: "اللينك ده مش صفحة ويب" };
    }

    // بنقرا أول نص فقط — الـ meta tags بتكون في الأول عادةً
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer.slice(0, MAX_HTML_BYTES));

    const title =
      readMeta(html, ["og:title", "twitter:title"]) ??
      decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ??
      null;

    const image = readMeta(html, ["og:image", "og:image:url", "twitter:image"]);

    return {
      ok: true,
      data: {
        url: response.url || url.toString(),
        title: title || null,
        description: readMeta(html, ["og:description", "twitter:description", "description"]),
        image: image ? new URL(image, response.url || url.toString()).toString() : null,
        siteName: readMeta(html, ["og:site_name"]) ?? url.hostname,
      },
    };
  } catch {
    return { ok: false, error: "مش قادر يوصل للينك" };
  } finally {
    clearTimeout(timer);
  }
}
