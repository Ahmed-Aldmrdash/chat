import { getCurrentUser } from "@/lib/supabase-server";
import { loadConversationSummaries } from "@/lib/queries";
import { AdminShell } from "../AdminShell";
import { MonitorView } from "./MonitorView";

export const dynamic = "force-dynamic";
export const metadata = { title: "المتابعة — لوحة التحكم" };

export default async function AdminMonitorPage() {
  const user = await getCurrentUser();

  // محادثات الناس مع بعض — الأدمن بيشوفها بحكم الـ RLS بس مش طرف فيها
  const conversations = await loadConversationSummaries(user?.id ?? "", {
    types: ["contact_contact"],
  });

  return (
    <AdminShell
      title="متابعة المحادثات"
      description="محادثات الناس مع بعض — عرض فقط من غير تدخّل"
    >
      <MonitorView myId={user?.id ?? ""} conversations={conversations} />
    </AdminShell>
  );
}
