import "server-only";

import webpush from "web-push";
import { getSupabaseAdmin } from "./supabase-admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  conversationId?: string;
  tag?: string;
}

let configured = false;

function configureWebPush(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:example@example.com";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * بيبعت إشعار Push لكل أجهزة المستخدمين دول.
 * بيستخدم service_role عشان يقرا اشتراكات ناس تانية (الـ RLS بتمنع ده عمدًا).
 * الاشتراكات اللي بقت باظت (410/404) بتتمسح تلقائيًا.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (userIds.length === 0) return { sent: 0, removed: 0 };
  if (!configureWebPush()) return { sent: 0, removed: 0 };

  const admin = getSupabaseAdmin();
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);

  if (!subscriptions?.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  const staleEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (staleEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return { sent, removed: staleEndpoints.length };
}

/**
 * بيبعت إشعار لباقي أطراف المحادثة — بيحترم إعداد الكتم (Mute)
 * وبيتجاهل الراسل نفسه.
 */
export async function notifyConversation(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  preview: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, is_muted")
    .eq("id", params.conversationId)
    .single();

  // المحادثة مكتومة → مفيش إشعارات خالص
  if (!conversation || conversation.is_muted) return;

  const { data: participants } = await admin
    .from("conversation_participants")
    .select("contact_id")
    .eq("conversation_id", params.conversationId);

  const recipients = (participants ?? [])
    .map((p) => p.contact_id as string)
    .filter((id) => id !== params.senderId);

  if (!recipients.length) return;

  await sendPushToUsers(recipients, {
    title: params.senderName,
    body: params.preview,
    url: `/?c=${params.conversationId}`,
    conversationId: params.conversationId,
    tag: `conversation-${params.conversationId}`,
  });
}
