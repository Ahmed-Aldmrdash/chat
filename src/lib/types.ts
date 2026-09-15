export type ConversationType = "admin_contact" | "contact_contact";
export type ContentType = "text" | "image" | "voice";

export interface Contact {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
  is_blocked: boolean;
  is_favorite: boolean;
  created_at: string;
  last_seen: string;
}

export interface Conversation {
  id: string;
  conversation_type: ConversationType;
  is_pinned: boolean;
  is_muted: boolean;
  disappearing_duration_hours: number | null;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  content_type: ContentType;
  media_path: string | null;
  reply_to_id: string | null;
  is_forwarded: boolean;
  is_broadcast: boolean;
  is_read: boolean;
  is_deleted: boolean;
  edited_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag: string;
  color: string;
}

export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  send_at: string;
  sent: boolean;
  created_at: string;
}

/** محادثة جاهزة للعرض في القايمة الجانبية */
export interface ConversationSummary {
  conversation: Conversation;
  /** الطرف/الأطراف التانية في المحادثة (من غير المستخدم الحالي) */
  others: Contact[];
  lastMessage: Message | null;
  unreadCount: number;
  tags: ContactTag[];
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };
