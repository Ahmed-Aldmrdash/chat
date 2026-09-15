import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { listMfaFactors } from "@/actions/auth";
import { AdminShell } from "../AdminShell";
import { SecuritySettings } from "./SecuritySettings";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات — لوحة التحكم" };

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const [factorsResult, { data: me }] = await Promise.all([
    listMfaFactors(),
    supabase.from("contacts").select("*").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const contact = me as Contact | null;

  return (
    <AdminShell title="الإعدادات" description="أمان الحساب والإشعارات">
      <SecuritySettings
        myId={user?.id ?? ""}
        email={user?.email ?? ""}
        statusText={contact?.status_text ?? "متاح"}
        factors={factorsResult.ok ? factorsResult.data : []}
      />
    </AdminShell>
  );
}
