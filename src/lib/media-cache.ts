"use client";

import { getMediaSignedUrl } from "@/actions/media";

/**
 * كاش للروابط المؤقتة بتاعة الصور والصوت.
 *
 * الرابط صالح ساعة، لكن الـ component بيتعمله mount أكتر من مرة (سكرول،
 * إعادة رسم، الوضع الصارم في التطوير) وكل مرة كان بيطلب رابط جديد من
 * السيرفر — وده كان بياخد 220-285ms في كل مرة على نفس الصورة.
 */
const TTL_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<{ ok: true; url: string } | { ok: false; error: string }>>();

export async function getCachedMediaUrl(
  messageId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const cached = cache.get(messageId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, url: cached.url };
  }

  // لو فيه طلب لنفس الملف شغال دلوقتي، نستنى عليه بدل ما نبعت واحد تاني
  const running = inFlight.get(messageId);
  if (running) return running;

  const request = getMediaSignedUrl(messageId)
    .then((result) => {
      if (result.ok) {
        cache.set(messageId, { url: result.data.url, expiresAt: Date.now() + TTL_MS });
        return { ok: true as const, url: result.data.url };
      }
      return { ok: false as const, error: result.error };
    })
    .finally(() => inFlight.delete(messageId));

  inFlight.set(messageId, request);
  return request;
}
