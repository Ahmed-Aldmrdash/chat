import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCron } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * بيمسح الرسايل اللي عدّى وقت اختفاءها (Disappearing Messages)
 * وبيمسح كمان أي ميديا مربوطة بيها من الـ Storage عشان مايفضلش ملفات يتيمة.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: expired, error } = await admin
    .from("messages")
    .select("id, media_path")
    .lt("expires_at", now)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expired?.length) {
    return NextResponse.json({ deleted: 0 });
  }

  const mediaPaths = expired
    .map((message) => message.media_path as string | null)
    .filter((path): path is string => !!path);

  if (mediaPaths.length) {
    await admin.storage.from("chat-media").remove(mediaPaths);
  }

  const { error: deleteError } = await admin
    .from("messages")
    .delete()
    .in(
      "id",
      expired.map((message) => message.id),
    );

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: expired.length, mediaRemoved: mediaPaths.length });
}
