import type { NextRequest } from "next/server";

/**
 * Vercel Cron بيبعت الهيدر ده تلقائيًا لو CRON_SECRET متظبط في متغيرات البيئة.
 * وبنقبل كمان ?secret= عشان التجربة اليدوية.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  return request.nextUrl.searchParams.get("secret") === secret;
}
