import { getAnalytics } from "@/actions/admin";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإحصائيات — لوحة التحكم" };

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => hour);

export default async function AdminAnalyticsPage() {
  const result = await getAnalytics();

  if (!result.ok) {
    return (
      <AdminShell title="الإحصائيات">
        <div className="mx-auto max-w-md rounded-2xl border border-wa-border bg-wa-panel p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-wa-danger/10 text-2xl">
            ⚠️
          </div>
          <h2 className="mb-1.5 text-base font-semibold">مش قادر يجيب الإحصائيات</h2>
          <p className="text-sm text-wa-secondary">{result.error}</p>
        </div>
      </AdminShell>
    );
  }

  const { byContact, byHour, totals } = result.data;

  const topContacts = byContact.slice(0, 12);
  const maxContactCount = Math.max(1, ...topContacts.map((row) => Number(row.message_count)));

  const hourCounts = HOUR_LABELS.map(
    (hour) => Number(byHour.find((row) => row.hour === hour)?.message_count ?? 0),
  );
  const maxHourCount = Math.max(1, ...hourCounts);
  const peakHour = hourCounts.indexOf(maxHourCount);
  const hasHourData = hourCounts.some((count) => count > 0);

  return (
    <AdminShell
      title="الإحصائيات"
      description="نظرة سريعة على نشاط التطبيق"
    >
      {/* ---------- الأرقام الأساسية ---------- */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="إجمالي الرسايل" value={totals.messages} />
        <StatTile label="عدد الأشخاص" value={totals.contacts} />
        <StatTile label="عدد المحادثات" value={totals.conversations} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- أكتر الأشخاص تفاعلًا ---------- */}
        <section className="rounded-2xl border border-wa-border bg-wa-panel p-5">
          <h2 className="font-semibold">أكتر الأشخاص تفاعلًا</h2>
          <p className="mb-4 text-xs text-wa-secondary">عدد الرسايل المرسلة لكل شخص</p>

          {topContacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-wa-secondary">مفيش رسايل لسه</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topContacts.map((row) => {
                const count = Number(row.message_count);
                const percent = (count / maxContactCount) * 100;

                return (
                  <li key={row.display_name} className="group">
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-wa-text">{row.display_name}</span>
                      <span className="shrink-0 tabular-nums text-wa-secondary">{count}</span>
                    </div>
                    {/* شريط رفيع بأطراف دايرية على خط أساس واضح */}
                    <div className="h-2 w-full rounded-full bg-wa-hover">
                      <div
                        className="h-2 rounded-full bg-wa-primary transition-[width] duration-500"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                        role="img"
                        aria-label={`${row.display_name}: ${count} رسالة`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------- النشاط بالساعة ---------- */}
        <section className="rounded-2xl border border-wa-border bg-wa-panel p-5">
          <h2 className="font-semibold">النشاط على مدار اليوم</h2>
          <p className="mb-4 text-xs text-wa-secondary">
            {hasHourData
              ? `أكتر ساعة نشاط: ${peakHour}:00 بـ ${maxHourCount} رسالة`
              : "عدد الرسايل في كل ساعة"}
          </p>

          {!hasHourData ? (
            <p className="py-8 text-center text-sm text-wa-secondary">مفيش رسايل لسه</p>
          ) : (
            <>
              <div className="flex h-44 items-end gap-[2px]" dir="ltr">
                {hourCounts.map((count, hour) => {
                  const height = (count / maxHourCount) * 100;
                  return (
                    <div
                      key={hour}
                      className="group relative flex h-full flex-1 items-end"
                      title={`${hour}:00 — ${count} رسالة`}
                    >
                      <div
                        className="w-full rounded-t bg-wa-primary transition-all duration-500 group-hover:brightness-110"
                        style={{ height: `${Math.max(height, count > 0 ? 3 : 1)}%` }}
                        role="img"
                        aria-label={`الساعة ${hour}: ${count} رسالة`}
                      />
                      {/* التلميح عند المرور */}
                      <span className="pointer-events-none absolute -top-7 start-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-wa-text px-2 py-1 text-[11px] text-wa-panel opacity-0 transition group-hover:opacity-100">
                        {hour}:00 · {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* محور الساعات — كل 3 ساعات عشان مايزدحمش */}
              <div className="mt-2 flex gap-[2px] text-[10px] text-wa-secondary" dir="ltr">
                {HOUR_LABELS.map((hour) => (
                  <span key={hour} className="flex-1 text-center tabular-nums">
                    {hour % 3 === 0 ? hour : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-wa-border bg-wa-panel p-4">
      <p className="text-3xl font-semibold tabular-nums text-wa-primary">
        {value.toLocaleString("ar-EG")}
      </p>
      <p className="mt-1 text-xs text-wa-secondary">{label}</p>
    </div>
  );
}
