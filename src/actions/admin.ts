"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, getSupabaseServer, isCurrentUserAdmin } from "@/lib/supabase-server";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/username";
import { notifyConversation } from "@/lib/push";
import type { ActionResult, Contact } from "@/lib/types";

const MIN_PASSWORD_LENGTH = 8;

/**
 * أي Server Action حساس لازم يعدّي من هنا الأول.
 * بنتأكد إن المستخدم الحالي فعلًا هو الأدمن (بمقارنة إيميله بـ ADMIN_EMAIL)
 * قبل ما نلمس أي حاجة بصلاحيات الـ service_role.
 */
async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: "الصلاحية دي للأدمن بس" };
  }
  return { ok: true, adminId: user.id };
}

/**
 * الأدمن لازم يكون ليه صف في جدول contacts زيه زي أي حد،
 * عشان يقدر يشارك في نظام conversation_participants الموحّد.
 */
export async function ensureAdminContact(): Promise<ActionResult<Contact>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("contacts")
    .select("*")
    .eq("id", guard.adminId)
    .maybeSingle();

  if (existing) return { ok: true, data: existing as Contact };

  const { data, error } = await admin
    .from("contacts")
    .insert({ id: guard.adminId, display_name: "أنا", status_text: "متاح" })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Contact };
}

/**
 * إنشاء حساب جديد لشخص + صف contact + محادثة admin_contact جاهزة.
 * لو أي خطوة فشلت بنرجّع كل حاجة زي ما كانت (بنمسح اليوزر اللي اتعمل).
 */
export async function createUserForContact(
  username: string,
  displayName: string,
  password: string,
): Promise<ActionResult<{ contactId: string; conversationId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const cleanUsername = normalizeUsername(username);
  const cleanName = displayName.trim();

  if (!isValidUsername(cleanUsername)) {
    return {
      ok: false,
      error: "اسم المستخدم لازم يكون من 3 لـ 32 حرف إنجليزي/رقم (أو . _ -)",
    };
  }
  if (!cleanName) return { ok: false, error: "الاسم المعروض مطلوب" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `كلمة السر لازم تكون ${MIN_PASSWORD_LENGTH} حروف على الأقل` };
  }

  // نتأكد إن الأدمن نفسه له صف contact قبل ما نعمل المحادثة
  const adminContact = await ensureAdminContact();
  if (!adminContact.ok) return { ok: false, error: adminContact.error };

  const admin = getSupabaseAdmin();
  const email = usernameToEmail(cleanUsername);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: cleanUsername, display_name: cleanName },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? "مش قادر ينشئ الحساب";
    return {
      ok: false,
      error: /already|exists|registered/i.test(message)
        ? "اسم المستخدم ده مستخدم قبل كده"
        : message,
    };
  }

  const newUserId = created.user.id;

  const rollback = async (error: string): Promise<ActionResult<never>> => {
    await admin.auth.admin.deleteUser(newUserId);
    return { ok: false, error };
  };

  const { error: contactError } = await admin
    .from("contacts")
    .insert({ id: newUserId, display_name: cleanName, status_text: "متاح" });

  if (contactError) return rollback(contactError.message);

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({ conversation_type: "admin_contact" })
    .select()
    .single();

  if (conversationError || !conversation) {
    return rollback(conversationError?.message ?? "مش قادر ينشئ المحادثة");
  }

  const { error: participantsError } = await admin
    .from("conversation_participants")
    .insert([
      { conversation_id: conversation.id, contact_id: guard.adminId },
      { conversation_id: conversation.id, contact_id: newUserId },
    ]);

  if (participantsError) {
    await admin.from("conversations").delete().eq("id", conversation.id);
    return rollback(participantsError.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: true, data: { contactId: newUserId, conversationId: conversation.id } };
}

/** حظر/فك حظر: بيمنعه من الإرسال بس بيسيبه يشوف التاريخ */
export async function toggleBlockContact(
  contactId: string,
  block: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (contactId === guard.adminId) {
    return { ok: false, error: "مينفعش تحظر نفسك" };
  }

  const { error } = await getSupabaseAdmin()
    .from("contacts")
    .update({ is_blocked: block })
    .eq("id", contactId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleFavoriteContact(
  contactId: string,
  favorite: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await getSupabaseAdmin()
    .from("contacts")
    .update({ is_favorite: favorite })
    .eq("id", contactId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   التاجات
   ========================================================================== */

export async function addContactTag(
  contactId: string,
  tag: string,
  color: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const cleanTag = tag.trim();
  if (!cleanTag) return { ok: false, error: "اكتب اسم التاج" };

  const { error } = await getSupabaseAdmin()
    .from("contact_tags")
    .upsert(
      { contact_id: contactId, tag: cleanTag, color },
      { onConflict: "contact_id,tag" },
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeContactTag(tagId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await getSupabaseAdmin().from("contact_tags").delete().eq("id", tagId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   إعدادات المحادثة (تثبيت / كتم / اختفاء تلقائي)
   ========================================================================== */

export async function setConversationFlags(
  conversationId: string,
  flags: { is_pinned?: boolean; is_muted?: boolean; disappearing_duration_hours?: number | null },
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await getSupabaseAdmin()
    .from("conversations")
    .update(flags)
    .eq("id", conversationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   السماح لشخصين يتكلموا مع بعض
   ========================================================================== */

/** بنرتّب الـ ids عشان (أ،ب) و (ب،أ) يبقوا نفس الصف في contact_permissions */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function allowContactsToChat(
  contactAId: string,
  contactBId: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (contactAId === contactBId) {
    return { ok: false, error: "اختار شخصين مختلفين" };
  }

  const admin = getSupabaseAdmin();
  const [first, second] = orderPair(contactAId, contactBId);

  const { error: permissionError } = await admin.from("contact_permissions").upsert(
    { contact_a_id: first, contact_b_id: second, allowed_by_admin: true },
    { onConflict: "contact_a_id,contact_b_id" },
  );

  if (permissionError) return { ok: false, error: permissionError.message };

  // فيه محادثة contact_contact بينهم بالفعل؟
  const { data: existing } = await admin
    .from("conversation_participants")
    .select("conversation_id, conversations!inner(conversation_type)")
    .eq("contact_id", first);

  const candidateIds = (existing ?? [])
    .filter((row) => {
      const conversation = Array.isArray(row.conversations)
        ? row.conversations[0]
        : row.conversations;
      return (conversation as { conversation_type?: string } | null)?.conversation_type ===
        "contact_contact";
    })
    .map((row) => row.conversation_id as string);

  if (candidateIds.length) {
    const { data: shared } = await admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("contact_id", second)
      .in("conversation_id", candidateIds)
      .limit(1);

    if (shared?.length) {
      revalidatePath("/admin/permissions");
      return { ok: true, data: { conversationId: shared[0].conversation_id as string } };
    }
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({ conversation_type: "contact_contact" })
    .select()
    .single();

  if (conversationError || !conversation) {
    return { ok: false, error: conversationError?.message ?? "مش قادر ينشئ المحادثة" };
  }

  const { error: participantsError } = await admin
    .from("conversation_participants")
    .insert([
      { conversation_id: conversation.id, contact_id: first },
      { conversation_id: conversation.id, contact_id: second },
    ]);

  if (participantsError) {
    await admin.from("conversations").delete().eq("id", conversation.id);
    return { ok: false, error: participantsError.message };
  }

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/monitor");
  return { ok: true, data: { conversationId: conversation.id } };
}

/**
 * سحب الإذن: الاتنين هيفضلوا شايفين التاريخ بس مش هيقدروا يبعتوا تاني.
 * (المنع نفسه متطبّق على مستوى قاعدة البيانات في can_send_in_conversation)
 */
export async function revokeContactsChat(
  contactAId: string,
  contactBId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const [first, second] = orderPair(contactAId, contactBId);
  const { error } = await getSupabaseAdmin()
    .from("contact_permissions")
    .update({ allowed_by_admin: false })
    .eq("contact_a_id", first)
    .eq("contact_b_id", second);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/permissions");
  return { ok: true };
}

/* ==========================================================================
   رسالة جماعية
   ========================================================================== */

export async function broadcastMessage(
  content: string,
  contactIds: string[],
): Promise<ActionResult<{ delivered: number }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const text = content.trim();
  if (!text) return { ok: false, error: "اكتب الرسالة الأول" };
  if (!contactIds.length) return { ok: false, error: "اختار شخص واحد على الأقل" };

  const admin = getSupabaseAdmin();

  // محادثات admin_contact اللي الأدمن طرف فيها
  const { data: adminRows } = await admin
    .from("conversation_participants")
    .select("conversation_id, conversations!inner(conversation_type)")
    .eq("contact_id", guard.adminId);

  const adminConversationIds = (adminRows ?? [])
    .filter((row) => {
      const conversation = Array.isArray(row.conversations)
        ? row.conversations[0]
        : row.conversations;
      return (conversation as { conversation_type?: string } | null)?.conversation_type ===
        "admin_contact";
    })
    .map((row) => row.conversation_id as string);

  if (!adminConversationIds.length) return { ok: false, error: "مفيش محادثات" };

  const { data: targets } = await admin
    .from("conversation_participants")
    .select("conversation_id, contact_id")
    .in("conversation_id", adminConversationIds)
    .in("contact_id", contactIds);

  const conversationIds = Array.from(
    new Set((targets ?? []).map((row) => row.conversation_id as string)),
  );

  if (!conversationIds.length) {
    return { ok: false, error: "مفيش محادثات مع الأشخاص دول" };
  }

  const { error } = await admin.from("messages").insert(
    conversationIds.map((conversationId) => ({
      conversation_id: conversationId,
      sender_id: guard.adminId,
      content: text,
      content_type: "text" as const,
      is_broadcast: true,
    })),
  );

  if (error) return { ok: false, error: error.message };

  after(() =>
    Promise.all(
      conversationIds.map((conversationId) =>
        notifyConversation({
          conversationId,
          senderId: guard.adminId,
          preview: text.slice(0, 120),
        }),
      ),
    ),
  );

  revalidatePath("/admin");
  return { ok: true, data: { delivered: conversationIds.length } };
}

/* ==========================================================================
   الإحصائيات
   ========================================================================== */

export async function getAnalytics(): Promise<
  ActionResult<{
    byContact: { display_name: string; message_count: number }[];
    byHour: { hour: number; message_count: number }[];
    totals: { messages: number; contacts: number; conversations: number };
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = await getSupabaseServer();
  const admin = getSupabaseAdmin();

  const [byContactRes, byHourRes, messagesCount, contactsCount, conversationsCount] =
    await Promise.all([
      supabase.rpc("get_message_counts_by_contact"),
      supabase.rpc("get_message_counts_by_hour"),
      admin.from("messages").select("id", { count: "exact", head: true }),
      admin.from("contacts").select("id", { count: "exact", head: true }),
      admin.from("conversations").select("id", { count: "exact", head: true }),
    ]);

  if (byContactRes.error) return { ok: false, error: byContactRes.error.message };
  if (byHourRes.error) return { ok: false, error: byHourRes.error.message };

  return {
    ok: true,
    data: {
      byContact: (byContactRes.data ?? []) as { display_name: string; message_count: number }[],
      byHour: (byHourRes.data ?? []) as { hour: number; message_count: number }[],
      totals: {
        messages: messagesCount.count ?? 0,
        contacts: contactsCount.count ?? 0,
        conversations: conversationsCount.count ?? 0,
      },
    },
  };
}
