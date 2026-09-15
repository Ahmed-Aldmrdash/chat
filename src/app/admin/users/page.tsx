import { loadAllContacts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/supabase-server";
import { AdminShell } from "../AdminShell";
import { UsersManager } from "./UsersManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "المستخدمين — لوحة التحكم" };

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  const contacts = await loadAllContacts();

  return (
    <AdminShell
      title="المستخدمين"
      description="انشئ حسابات جديدة أو أوقف حساب عن الإرسال"
    >
      <UsersManager contacts={contacts} adminId={user?.id ?? ""} />
    </AdminShell>
  );
}
