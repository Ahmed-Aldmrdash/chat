import "server-only";

import { getSupabaseServer } from "./supabase-server";
import type {
  Contact,
  Conversation,
  ConversationSummary,
  ConversationType,
  ContactTag,
  Message,
} from "./types";

/**
 * بيجمّع كل اللي القايمة الجانبية محتاجاه: المحادثة + الطرف التاني + آخر رسالة
 * + عدد الغير مقروء + التاجات.
 * كل الاستعلامات بتمشي بصلاحيات المستخدم الحالي، يعني الـ RLS هي اللي بتقرر
 * هو يشوف إيه: الأدمن بيشوف الكل، وأي contact بيشوف محادثاته بس.
 */
export async function loadConversationSummaries(
  userId: string,
  options: { types?: ConversationType[] } = {},
): Promise<ConversationSummary[]> {
  const supabase = await getSupabaseServer();
  const types = options.types ?? ["admin_contact", "contact_contact"];

  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .in("conversation_type", types)
    .order("is_pinned", { ascending: false })
    .order("last_message_at", { ascending: false });

  const convos = (conversations ?? []) as Conversation[];
  if (convos.length === 0) return [];

  const ids = convos.map((c) => c.id);

  const [participantsRes, messagesRes] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("conversation_id, contact_id, contacts(*)")
      .in("conversation_id", ids),
    // القايمة الجانبية محتاجة آخر رسالة وعدد الغير مقروء بس — مش الرسايل كلها.
    // كنا بنجيب 1000 صف كامل في كل تحديث، وده كان أتقل حاجة في الصفحة.
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, content_type, is_read, is_deleted, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  type ParticipantRow = {
    conversation_id: string;
    contact_id: string;
    contacts: Contact | Contact[] | null;
  };

  const participants = (participantsRes.data ?? []) as ParticipantRow[];
  // بنجيب الأعمدة اللي القايمة بتعرضها بس، فالنوع أضيق من Message الكامل
  const messages = (messagesRes.data ?? []) as unknown as Message[];

  // التاجات بتاعة كل الأطراف اللي ظهرت
  const contactIds = Array.from(new Set(participants.map((p) => p.contact_id)));
  const { data: tagRows } = await supabase
    .from("contact_tags")
    .select("*")
    .in("contact_id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);

  const tags = (tagRows ?? []) as ContactTag[];

  const othersByConversation = new Map<string, Contact[]>();
  for (const row of participants) {
    if (row.contact_id === userId) continue;
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    if (!contact) continue;
    const list = othersByConversation.get(row.conversation_id) ?? [];
    list.push(contact);
    othersByConversation.set(row.conversation_id, list);
  }

  // الرسايل جاية مرتّبة تنازليًا، فأول واحدة لكل محادثة هي الأحدث
  const lastMessages = new Map<string, Message>();
  const unread = new Map<string, number>();
  for (const message of messages) {
    if (!lastMessages.has(message.conversation_id) && !message.is_deleted) {
      lastMessages.set(message.conversation_id, message);
    }
    if (message.sender_id !== userId && !message.is_read && !message.is_deleted) {
      unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
    }
  }

  return convos.map((conversation) => {
    const others = othersByConversation.get(conversation.id) ?? [];
    const otherIds = new Set(others.map((o) => o.id));
    return {
      conversation,
      others,
      lastMessage: lastMessages.get(conversation.id) ?? null,
      unreadCount: unread.get(conversation.id) ?? 0,
      tags: tags.filter((t) => otherIds.has(t.contact_id)),
    };
  });
}

/** رسايل محادثة واحدة (الأقدم الأول) */
export async function loadMessages(
  conversationId: string,
  limit = 300,
): Promise<Message[]> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Message[]).reverse();
}

/** كل الـ contacts (الأدمن بس هو اللي بيشوفهم كلهم) */
export async function loadAllContacts(): Promise<Contact[]> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .order("display_name", { ascending: true });
  return (data ?? []) as Contact[];
}

export async function loadAllTags(): Promise<ContactTag[]> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from("contact_tags").select("*");
  return (data ?? []) as ContactTag[];
}
