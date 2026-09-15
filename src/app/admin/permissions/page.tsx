import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { loadAllContacts } from "@/lib/queries";
import { AdminShell } from "../AdminShell";
import { PermissionsManager } from "./PermissionsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "الصلاحيات — لوحة التحكم" };

export interface PermissionRow {
  id: string;
  contact_a_id: string;
  contact_b_id: string;
  allowed_by_admin: boolean;
  created_at: string;
}

export default async function AdminPermissionsPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const [contacts, { data: permissions }] = await Promise.all([
    loadAllContacts(),
    supabase
      .from("contact_permissions")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AdminShell
      title="الصلاحيات"
      description="اسمح لشخصين يتكلموا مع بعض مباشرة — الافتراضي إن كل واحد بيكلمك إنت بس"
    >
      <PermissionsManager
        contacts={contacts.filter((contact) => contact.id !== user?.id)}
        permissions={(permissions ?? []) as PermissionRow[]}
      />
    </AdminShell>
  );
}
