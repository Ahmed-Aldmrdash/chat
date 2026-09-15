import { getCurrentUser } from "@/lib/supabase-server";
import { loadAllContacts } from "@/lib/queries";
import { AdminShell } from "../AdminShell";
import { BroadcastForm } from "./BroadcastForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "رسالة جماعية — لوحة التحكم" };

export default async function AdminBroadcastPage() {
  const user = await getCurrentUser();
  const contacts = await loadAllContacts();

  return (
    <AdminShell
      title="رسالة جماعية"
      description="ابعت نفس الرسالة لأكتر من شخص مرة واحدة — كل واحد هيستقبلها في شاته الخاص"
    >
      <BroadcastForm contacts={contacts.filter((c) => c.id !== user?.id)} />
    </AdminShell>
  );
}
