import { redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer, isCurrentUserAdmin } from "@/lib/supabase-server";
import { loadConversationSummaries } from "@/lib/queries";
import { ChatDashboard } from "@/components/ChatDashboard";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "الشات" };

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isCurrentUserAdmin()) redirect("/admin");

  const supabase = await getSupabaseServer();
  const { data: me } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const contact = me as Contact | null;
  const conversations = await loadConversationSummaries(user.id);

  return (
    <ChatDashboard
      myId={user.id}
      myName={contact?.display_name ?? "أنا"}
      myAvatar={contact?.avatar_url}
      myStatus={contact?.status_text}
      initialConversations={conversations}
      isAdmin={false}
      amBlocked={!!contact?.is_blocked}
      emptyHint="لسه مفيش محادثات — استنى صاحب التطبيق يبعتلك"
    />
  );
}
