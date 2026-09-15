import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * بيجدّد الـ session cookies في كل request، وبيحمي الصفحات:
 *  - /admin*  → الأدمن بس
 *  - /chat    → أي مستخدم مسجّل دخول
 *  - /login   → لو مسجّل دخول بالفعل بيتحوّل لصفحته
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // من غير إعدادات Supabase مفيش حاجة نعملها — سيبه يعدّي والصفحة هتوضّح الخطأ
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // نفس فكرة getCurrentUser: تحقق محلي من التوكن بدل رحلة شبكة في كل طلب
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: string; email?: string } | undefined;
    if (!error && claims?.sub && claims.email) {
      userId = claims.sub;
      userEmail = claims.email;
    }
  } catch {
    // هنرجع للطريقة الأبطأ تحت
  }

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  }

  const user = userId ? { id: userId, email: userEmail } : null;
  const { pathname } = request.nextUrl;
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isAdmin = !!userEmail && userEmail.trim().toLowerCase() === adminEmail;

  if (!user && (pathname.startsWith("/admin") || pathname.startsWith("/chat"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/admin") && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = isAdmin ? "/admin" : "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * كل المسارات ما عدا الملفات الساكنة والـ service worker
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
