"use server";

import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ActionResult } from "@/lib/types";

const BUCKET = "chat-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // ساعة

/**
 * كل واحد بيرفع في فولدر باسم الـ id بتاعه (ده اللي سياسة الـ Storage بتسمح بيه).
 * بنرجّع المسار للمتصفح عشان يرفع عليه مباشرة من غير ما الملف يعدّي على السيرفر.
 */
export async function buildUploadPath(
  extension: string,
): Promise<ActionResult<{ path: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const name = `${crypto.randomUUID()}${safeExtension ? `.${safeExtension}` : ""}`;
  return { ok: true, data: { path: `${user.id}/${name}` } };
}

/**
 * Signed URL للميديا بتاعة رسالة.
 *
 * ليه بنعمل كده على السيرفر؟ سياسة الـ Storage بتسمح لكل واحد يقرا فولدره بس،
 * فالطرف التاني مش هيقدر يفتح الصورة مباشرة. فبنتأكد الأول إنه فعلًا يقدر
 * يشوف الرسالة (عبر الـ RLS بـ client بتاعه)، وبعدين نولّد الـ Signed URL
 * بالـ service_role.
 */
export async function getMediaSignedUrl(
  messageId: string,
): Promise<ActionResult<{ url: string; expiresIn: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "لازم تسجّل دخول الأول" };

  const supabase = await getSupabaseServer();
  const { data: message, error } = await supabase
    .from("messages")
    .select("id, media_path, is_deleted")
    .eq("id", messageId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!message) return { ok: false, error: "الرسالة مش موجودة" };
  if (message.is_deleted) return { ok: false, error: "الرسالة اتمسحت" };
  if (!message.media_path) return { ok: false, error: "مفيش ملف في الرسالة دي" };

  const { data: signed, error: signError } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(message.media_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    return { ok: false, error: signError?.message ?? "مش قادر يجيب الملف" };
  }

  return { ok: true, data: { url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS } };
}
