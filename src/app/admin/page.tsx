import { redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer, isCurrentUserAdmin } from "@/lib/supabase-server";
import { loadConversationSummaries } from "@/lib/queries";
import { ensureAdminContact } from "@/actions/admin";
import { ChatDashboard } from "@/components/ChatDashboard";
import { ADMIN_NAV } from "./nav";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "لوحة التحكم — الشات" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin())) redirect("/chat");

  // الأدمن لازم يكون له صف في contacts عشان يشارك في المحادثات زي أي حد
  await ensureAdminContact();

  const supabase = await getSupabaseServer();
  const { data: me } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const contact = me as Contact | null;

  // /admin بيعرض محادثات الأدمن مع الناس بس — محادثات contact_contact ليها
  // شاشة المتابعة في /admin/monitor
  const conversations = await loadConversationSummaries(user.id, {
    types: ["admin_contact"],
  });

  return (
    <ChatDashboard
      myId={user.id}
      myName={contact?.display_name ?? "أنا"}
      myAvatar={contact?.avatar_url}
      myStatus={contact?.status_text}
      initialConversations={conversations}
      isAdmin
      types={["admin_contact"]}
      navLinks={ADMIN_NAV}
      emptyHint="ابدأ بإنشاء حساب لأول شخص من صفحة المستخدمين"
    />
  );
}
