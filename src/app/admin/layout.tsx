import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** حارس إضافي فوق الـ middleware — أي صفحة تحت /admin للأدمن بس */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isCurrentUserAdmin())) redirect("/login");
  return <>{children}</>;
}
