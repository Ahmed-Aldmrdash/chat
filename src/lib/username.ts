/**
 * مفيش تسجيل عام في التطبيق ده: الأدمن هو اللي بينشئ الحسابات.
 * Supabase Auth بيشتغل بالإيميل، فبنحوّل كل username لإيميل داخلي وهمي.
 * المستخدم النهائي بيشوف حقل Username بس ومش بيعرف حاجة عن الإيميل ده.
 */

export const INTERNAL_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN || "internal.yourapp.com";

/** الحروف المسموح بيها في الـ username */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(username));
}

/** يحوّل username لإيميل داخلي وهمي: ahmed → ahmed@internal.yourapp.com */
export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** العكس: يرجّع الـ username من الإيميل الداخلي (لو مش إيميل داخلي بيرجّع null) */
export function emailToUsername(email: string): string | null {
  const suffix = `@${INTERNAL_EMAIL_DOMAIN}`;
  if (!email.toLowerCase().endsWith(suffix)) return null;
  return email.toLowerCase().slice(0, -suffix.length);
}
