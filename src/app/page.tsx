import { redirect } from "next/navigation";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * الصفحة الرئيسية بتوجّه كل واحد لمكانه.
 * بنحافظ على ?c=<conversation-id> عشان الضغط على الإشعار يفتح المحادثة الصح.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { c } = await searchParams;
  const base = (await isCurrentUserAdmin()) ? "/admin" : "/chat";
  redirect(c ? `${base}?c=${encodeURIComponent(c)}` : base);
}
