/** دمج كلاسات Tailwind بشكل مشروط */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** وقت الرسالة: 14:32 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** تاريخ فاصل بين مجموعات الرسايل: النهارده / امبارح / 12 مارس 2025 */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "النهارده";
  if (sameDay(date, yesterday)) return "امبارح";

  return date.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** آخر ظهور: متصل دلوقتي / آخر ظهور 14:32 */
export function formatLastSeen(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  // بنحدّث الـ last_seen كل 30 ثانية، فأي حاجة أقل من دقيقة = متصل
  if (diffMs < 60_000) return "متصل دلوقتي";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `آخر ظهور من ${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `آخر ظهور من ${hours} ساعة`;

  return `آخر ظهور ${new Date(iso).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
  })}`;
}

/** وقت مختصر لقايمة المحادثات */
export function formatConversationTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return formatTime(iso);
  }
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
}

/** مدة الرسالة الصوتية: 1:05 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

/** أول لينك جوه نص الرسالة (لو موجود) */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match?.[0] ?? null;
}

/** تقسيم النص لأجزاء نص/لينك عشان نعرضهم كـ anchors */
export function splitByUrls(text: string): { type: "text" | "url"; value: string }[] {
  const parts: { type: "text" | "url"; value: string }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    parts.push({ type: "url", value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

/** أول حرفين من الاسم عشان الأفاتار الافتراضي */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "؟";
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] ?? "") + (words[1][0] ?? "");
}

/** لون ثابت للأفاتار حسب الـ id */
const AVATAR_COLORS = [
  "#00a884", "#53bdeb", "#ff8a65", "#a78bfa",
  "#f472b6", "#fbbf24", "#34d399", "#60a5fa",
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
