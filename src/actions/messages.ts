"use server";

import { after } from "next/server";

import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { loadConversationSummaries } from "@/lib/queries";
import { notifyConversation } from "@/lib/push";
import type {
  ActionResult,
  ContentType,
  ConversationSummary,
  ConversationType,
  Message,
} from "@/lib/types";

/** نص مختصر للإشعار وللقايمة الجانبية */
function previewOf(content: string, contentType: ContentType): string {
  if (contentType === "image") return "📷 صورة";
  if (contentType === "voice") return "🎤 رسالة صوتية";
  return content.slice(0, 120);
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  contentType?: ContentType;
  mediaPath?: string | null;
  replyToId?: string | null;
  isForwarded?: boolean;
}

/**
 * إرسال رسالة.
 * بنستخدم client المستخدم نفسه (مش service_role) عشان الـ RLS هي اللي تتحقق من:
 * هو مشارك في المحادثة؟ محظور؟ الأدمن سامح بالمحادثة دي أصلًا؟
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<ActionResult<Message>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const contentType = input.contentType ?? "text";
  const content = input.content.trim();

  if (contentType === "text" && !content) {
    return { ok: false, error: "الرسالة فاضية" };
  }
  if (contentType !== "text" && !input.mediaPath) {
    return { ok: false, error: "الملف مترفعش" };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      content: contentType === "text" ? content : content || previewOf("", contentType),
      content_type: contentType,
      media_path: input.mediaPath ?? null,
      reply_to_id: input.replyToId ?? null,
      is_forwarded: input.isForwarded ?? false,
    })
    .select()
    .single();

  if (error) {
    // الـ RLS بترجّع خطأ عام، فبنترجمه لرسالة مفهومة
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return { ok: false, error: "مش مسموح لك تبعت في المحادثة دي" };
    }
    return { ok: false, error: error.message };
  }

  // الإشعارات بتتبعت بعد ما الرد يوصل للمستخدم — مش قبله
  after(() =>
    notifyConversation({
      conversationId: input.conversationId,
      senderId: user.id,
      preview: previewOf(content, contentType),
    }),
  );

  return { ok: true, data: data as Message };
}

/** تعليم كل رسايل المحادثة كمقروءة (عبر RPC عشان المستقبِل مش مالك الرسايل) */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionResult<{ updated: number }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { updated: (data as number) ?? 0 } };
}

export async function editMessage(
  messageId: string,
  content: string,
): Promise<ActionResult<Message>> {
  const text = content.trim();
  if (!text) return { ok: false, error: "الرسالة فاضية" };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("messages")
    .update({ content: text, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("content_type", "text")
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Message };
}

/** حذف "ناعم": بنسيب الصف بس نعلّمه محذوف عشان الطرف التاني يشوف "اتمسحت" */
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("messages")
    .update({ is_deleted: true })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** إضافة/تغيير/شيل تفاعل — كل مستخدم له تفاعل واحد بس على الرسالة */
export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult<{ removed: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const supabase = await getSupabaseServer();
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id, emoji")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.emoji === emoji) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { removed: true } };
    }

    const { error } = await supabase
      .from("message_reactions")
      .update({ emoji })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { removed: false } };
  }

  const { error } = await supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: user.id, emoji });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { removed: false } };
}

/** تحويل رسالة لمحادثة أو أكتر */
export async function forwardMessage(
  messageId: string,
  conversationIds: string[],
): Promise<ActionResult<{ delivered: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };
  if (!conversationIds.length) return { ok: false, error: "اختار محادثة الأول" };

  const supabase = await getSupabaseServer();
  const { data: original, error: readError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();

  if (readError || !original) return { ok: false, error: "الرسالة مش موجودة" };

  const rows = conversationIds.map((conversationId) => ({
    conversation_id: conversationId,
    sender_id: user.id,
    content: original.content,
    content_type: original.content_type,
    media_path: original.media_path,
    is_forwarded: true,
  }));

  const { error } = await supabase.from("messages").insert(rows);
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return { ok: false, error: "مش مسموح لك تبعت في واحدة من المحادثات دي" };
    }
    return { ok: false, error: error.message };
  }

  after(() =>
    Promise.all(
      conversationIds.map((conversationId) =>
        notifyConversation({
          conversationId,
          senderId: user.id,
          preview: previewOf(original.content, original.content_type),
        }),
      ),
    ),
  );

  return { ok: true, data: { delivered: conversationIds.length } };
}

/* ==========================================================================
   الرسايل المجدولة
   ========================================================================== */

export async function scheduleMessage(
  conversationId: string,
  content: string,
  sendAtIso: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const text = content.trim();
  if (!text) return { ok: false, error: "اكتب الرسالة الأول" };

  const sendAt = new Date(sendAtIso);
  if (Number.isNaN(sendAt.getTime())) return { ok: false, error: "الوقت غلط" };
  if (sendAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "اختار وقت في المستقبل" };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("scheduled_messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: text,
    send_at: sendAt.toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listScheduledMessages(
  conversationId: string,
): Promise<ActionResult<{ id: string; content: string; send_at: string }[]>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("id, content, send_at")
    .eq("conversation_id", conversationId)
    .eq("sent", false)
    .order("send_at", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

export async function cancelScheduledMessage(id: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("scheduled_messages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ==========================================================================
   تحميل/تحديث البيانات من الـ client
   ========================================================================== */

export async function refreshConversations(
  types?: ConversationType[],
): Promise<ActionResult<ConversationSummary[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };
  const summaries = await loadConversationSummaries(user.id, { types });
  return { ok: true, data: summaries };
}

export async function fetchMessages(
  conversationId: string,
  limit = 300,
): Promise<ActionResult<Message[]>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as Message[]).reverse() };
}

/** بحث عام في كل المحادثات اللي المستخدم يقدر يشوفها (الأدمن = الكل) */
export async function searchMessages(
  query: string,
  limit = 60,
): Promise<
  ActionResult<{ message: Message; conversationLabel: string }[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const term = query.trim();
  if (term.length < 2) return { ok: true, data: [] };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .ilike("content", `%${term}%`)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  const messages = (data ?? []) as Message[];
  if (!messages.length) return { ok: true, data: [] };

  const conversationIds = Array.from(new Set(messages.map((m) => m.conversation_id)));
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, contact_id, contacts(display_name)")
    .in("conversation_id", conversationIds);

  const labels = new Map<string, string[]>();
  for (const row of participants ?? []) {
    if (row.contact_id === user.id) continue;
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const name = (contact as { display_name?: string } | null)?.display_name;
    if (!name) continue;
    const list = labels.get(row.conversation_id as string) ?? [];
    list.push(name);
    labels.set(row.conversation_id as string, list);
  }

  return {
    ok: true,
    data: messages.map((message) => ({
      message,
      conversationLabel: (labels.get(message.conversation_id) ?? []).join("، ") || "محادثة",
    })),
  };
}

/** تصدير المحادثة كنص عادي جاهز للتحميل كملف .txt */
export async function exportConversation(
  conversationId: string,
): Promise<ActionResult<{ filename: string; content: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const supabase = await getSupabaseServer();
  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("contact_id, contacts(display_name)")
    .eq("conversation_id", conversationId);

  const names = new Map<string, string>();
  for (const row of participants ?? []) {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const name = (contact as { display_name?: string } | null)?.display_name;
    if (name) names.set(row.contact_id as string, name);
  }

  const title = Array.from(names.entries())
    .filter(([id]) => id !== user.id)
    .map(([, name]) => name)
    .join("، ");

  const lines = ((messages ?? []) as Message[]).map((message) => {
    const stamp = new Date(message.created_at).toLocaleString("ar-EG");
    const author = names.get(message.sender_id) ?? "مستخدم";
    const body = message.is_deleted
      ? "(رسالة اتمسحت)"
      : message.content_type === "image"
        ? "(صورة)"
        : message.content_type === "voice"
          ? "(رسالة صوتية)"
          : message.content;
    return `[${stamp}] ${author}: ${body}`;
  });

  const header = [
    `محادثة: ${title || "بدون عنوان"}`,
    `تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}`,
    `عدد الرسايل: ${lines.length}`,
    "─".repeat(40),
    "",
  ];

  return {
    ok: true,
    data: {
      filename: `chat-${(title || "conversation").replace(/[^\p{L}\p{N}]+/gu, "-")}.txt`,
      content: [...header, ...lines].join("\n"),
    },
  };
}

/**
 * أطراف محادثة معيّنة.
 * بنستخدم client المستخدم عشان الـ RLS تمنعه يبص على محادثات مش بتاعته
 * (الأدمن بس هو اللي بيشوف الكل).
 */
export async function fetchConversationParticipants(
  conversationId: string,
): Promise<ActionResult<{ id: string; display_name: string }[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("contact_id, contacts(id, display_name)")
    .eq("conversation_id", conversationId);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? [])
      .map((row) => {
        const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
        return contact as { id: string; display_name: string } | null;
      })
      .filter((c): c is { id: string; display_name: string } => !!c),
  };
}
