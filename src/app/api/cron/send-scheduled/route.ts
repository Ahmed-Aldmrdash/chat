import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyConversation } from "@/lib/push";
import { isAuthorizedCron } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * بيشتغل كل دقيقة: بياخد أي رسالة مجدولة وصل معادها ويبعتها فعليًا.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from("scheduled_messages")
    .select("*")
    .eq("sent", false)
    .lte("send_at", now)
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const { error: insertError } = await admin.from("messages").insert(
    due.map((item) => ({
      conversation_id: item.conversation_id,
      sender_id: item.sender_id,
      content: item.content,
      content_type: "text" as const,
    })),
  );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await admin
    .from("scheduled_messages")
    .update({ sent: true })
    .in(
      "id",
      due.map((item) => item.id),
    );

  // إشعارات للطرف التاني (بتحترم الكتم جوه notifyConversation)
  const senderIds = Array.from(new Set(due.map((item) => item.sender_id as string)));
  const { data: senders } = await admin
    .from("contacts")
    .select("id, display_name")
    .in("id", senderIds);

  const names = new Map(
    (senders ?? []).map((sender) => [sender.id as string, sender.display_name as string]),
  );

  await Promise.all(
    due.map((item) =>
      notifyConversation({
        conversationId: item.conversation_id,
        senderId: item.sender_id,
        senderName: names.get(item.sender_id) ?? "رسالة مجدولة",
        preview: String(item.content).slice(0, 120),
      }),
    ),
  );

  return NextResponse.json({ sent: due.length });
}
