# تطبيق شات شخصي (Personal Chat App)

تطبيق ويب شبيه بواتساب — **من غير تسجيل عام**. صاحب التطبيق (الأدمن) هو اللي بينشئ
حساب لكل شخص عايز يتواصل معاه. كل شخص بيدخل بحسابه ويشوف شاته الخاص بيه بس، وبشكل
افتراضي بيتكلم مع الأدمن لوحده — إلا لو الأدمن سمح لشخصين يتكلموا مع بعض.

---

## التقنيات

| الجزء | التقنية |
|---|---|
| الإطار | Next.js 16 (App Router) + TypeScript |
| التصميم | Tailwind CSS 4 + CSS Variables |
| قاعدة البيانات / المصادقة / الريل تايم / التخزين | Supabase |
| الإشعارات | Web Push API + `web-push` |
| المكالمات | WebRTC (P2P) + Supabase Realtime كـ Signaling |
| النشر | Vercel (فيه Cron Jobs جاهزة) |

---

## التشغيل السريع

```bash
git clone -b claude/personal-chat-app-mx2ubw https://github.com/Ahmed-Aldmrdash/chat.git
cd chat
npm install
```

بعد كده محتاج مشروع على Supabase (مجاني):

**1) اعمل المشروع** — من [supabase.com](https://supabase.com) → New project.
اختار Region قريب منك، وخزّن الـ Database Password عندك.

**2) ظبّط الإعدادات:**

```bash
npm run setup
```

هيسألك على ٣ حاجات من **Supabase → Project Settings → API** (الـ Project URL،
والـ anon key، والـ service_role key) وعلى إيميل الأدمن. وهو اللي هيتكفّل بالباقي:
بيولّد مفاتيح الإشعارات والـ CRON_SECRET، بيكتب `.env.local`، وبيجهّز ملف
`supabase/schema.ready.sql` وفيه إيميلك متحطوط في مكانه.

**3) اعمل الجداول** — افتح `supabase/schema.ready.sql`، انسخه كله، والزقه في
**Supabase → SQL Editor → New query** واضغط Run. المفروض يقول Success.

**4) اعمل حساب الأدمن** — من **Authentication → Users → Add user → Create new user**:
الإيميل اللي كتبته في الخطوة 2، وكلمة سر قوية، و**فعّل Auto Confirm User**.

**5) شغّل:**

```bash
npm run dev
```

افتح <http://localhost:3000> وسجّل دخول بإيميل الأدمن.

> **مش عايز السكريبت؟** انسخ `.env.example` لـ `.env.local` واملاه بإيدك،
> وولّد مفاتيح الإشعارات بـ `npm run generate-vapid`، وغيّر
> `your-admin-email@example.com` جوه دالة `is_admin()` في `supabase/schema.sql`
> قبل ما تشغّله.

---

## أول استخدام

1. ادخل على **`/admin/users`** واعمل حساب لأول شخص (اسم معروض + username + كلمة سر).
2. هيتعمل معاه محادثة جاهزة على طول، هتلاقيها في `/admin`.
3. ابعتله الـ username وكلمة السر — هو بيدخل من `/login` ويلاقي شاته في `/chat`.
4. من **`/admin/settings`** فعّل المصادقة الثنائية (2FA) لحسابك.

---

## الصفحات

| المسار | الوصف | الوصول |
|---|---|---|
| `/login` | تسجيل دخول بـ username + password | عام |
| `/admin` | قايمة كل المحادثات + نافذة الشات | الأدمن |
| `/admin/users` | إنشاء الحسابات وإيقافها | الأدمن |
| `/admin/permissions` | السماح لشخصين يتكلموا مع بعض | الأدمن |
| `/admin/monitor` | متابعة محادثات الناس مع بعض (عرض فقط) | الأدمن |
| `/admin/broadcast` | رسالة جماعية | الأدمن |
| `/admin/analytics` | إحصائيات النشاط | الأدمن |
| `/admin/settings` | 2FA + الإشعارات + الحالة | الأدمن |
| `/chat` | محادثات الشخص العادي | أي مستخدم |

**الدخول:** الأدمن بيدخل بإيميله الحقيقي، وأي شخص تاني بيدخل بالـ username بتاعه
(اللي بيتحوّل داخليًا لإيميل وهمي `username@internal.yourapp.com`).

---

## النشر على Vercel

1. ارفع المشروع على GitHub واربطه بـ Vercel.
2. حط نفس متغيرات البيئة في **Project Settings → Environment Variables**.
3. الـ Cron Jobs متظبطة في `vercel.json` وبتشتغل لوحدها:
   - `/api/cron/send-scheduled` — كل دقيقة، بيبعت الرسايل المجدولة.
   - `/api/cron/delete-expired` — كل 5 دقايق، بيمسح الرسايل اللي وقتها خلص.

> Vercel بيبعت هيدر `Authorization: Bearer $CRON_SECRET` تلقائيًا للمسارات دي،
> والكود بيرفض أي طلب من غيره.

لو مش على Vercel تقدر تنادي المسارين من أي cron خارجي:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/send-scheduled
```

---

## هيكل المشروع

```
src/
├── actions/          # Server Actions (كل المنطق الحساس هنا)
│   ├── auth.ts       # دخول + rate limiting + 2FA
│   ├── admin.ts      # إنشاء حسابات، حظر، أذونات، broadcast، إحصائيات
│   ├── messages.ts   # إرسال/تعديل/حذف/تحويل/جدولة/بحث/تصدير
│   ├── media.ts      # مسارات الرفع + Signed URLs
│   ├── tools.ts      # الترجمة + معاينة الروابط
│   ├── push.ts       # اشتراكات الإشعارات
│   └── profile.ts    # آخر ظهور + الحالة النصية
├── app/
│   ├── admin/        # صفحات لوحة التحكم
│   ├── api/cron/     # مهام مجدولة
│   ├── chat/         # شاشة المستخدم العادي
│   └── login/
├── components/       # ChatDashboard / ChatWindow / MessageBubble / CallOverlay ...
├── hooks/            # presence, push, typing, WebRTC, recorder, theme, realtime
├── lib/              # Supabase clients, queries, types, utils, push
└── proxy.ts          # تجديد الجلسة + حماية المسارات
supabase/schema.sql   # قاعدة البيانات كاملة
```

---

## ملاحظات أمان مهمة

- **`SUPABASE_SERVICE_ROLE_KEY` سيرفر فقط.** الملف `lib/supabase-admin.ts` عامل
  `import "server-only"`، يعني لو حد حاول يستدعيه من كود بيشتغل في المتصفح الـ build
  هيفشل من نفسه.
- **الـ RLS هي خط الدفاع الأساسي.** كل الاستعلامات اللي بتمثّل المستخدم بتمشي
  بمفتاحه هو مش بالـ service_role، فالداتابيز نفسها هي اللي بتقرر هو يشوف إيه.
- **حماية من التخمين:** 5 محاولات دخول فاشلة كل 15 دقيقة لكل اسم مستخدم.
- **صلاحية الأدمن بتتأكد مرتين:** في `proxy.ts` وكمان جوه كل Server Action حساس
  (مقارنة `user.email` بـ `ADMIN_EMAIL`).
- **الميديا مقفولة:** الـ bucket مش public، وكل واحد بيرفع في فولدر باسم الـ id بتاعه.
  الطرف التاني بيشوف الصورة/الصوت عبر **Signed URL بيتولّد على السيرفر** بعد التأكد
  إنه فعلًا طرف في المحادثة.

### فروق مقصودة عن الـ SQL الأصلي في المواصفات

- سياسات الـ RLS بتستخدم دوال `security definer`
  (`is_conversation_participant` / `my_conversation_ids` / `shares_conversation_with`)
  بدل ما السياسة تقرا من نفس الجدول — كده بنتفادى **infinite recursion** في
  `conversation_participants`.
- علامات القراءة بتتعمل عبر RPC اسمها `mark_conversation_read()` بدل ما نفتح صلاحية
  `UPDATE` على الرسايل للمستقبِل (اللي كان هيخليه يقدر يعدّل محتوى رسايل غيره).
- زوّدنا `can_send_in_conversation()` في سياسة الإدخال: محادثات `contact_contact`
  مقفولة على مستوى الداتابيز لحد ما الأدمن يدي إذن، ولو سحب الإذن الاتنين بيفضلوا
  شايفين التاريخ بس مش قادرين يبعتوا.
- `update_last_message_at` بقت `security definer` عشان المستخدم العادي (اللي معندوش
  `UPDATE` على `conversations`) يقدر يبعت رسالة من غير ما الـ trigger يفشل.
- `set_message_expiry` trigger بتحسب `expires_at` تلقائيًا من إعداد المحادثة، فأي
  طريق إرسال (عادي / broadcast / مجدول) بيحترم الاختفاء التلقائي.

---

## ملاحظات تشغيلية

- **إشعارات الآيفون:** Safari مش بيسمح بالـ Web Push إلا لو المستخدم ضاف الموقع
  للشاشة الرئيسية كـ PWA. التطبيق فيه `manifest.json` وأيقونات جاهزة لكده.
- **المكالمات والـ TURN:** الـ STUN المجاني بيكفي أغلب الشبكات. لو في شبكات معقّدة
  المكالمة مابتتوصلش، حط بيانات TURN server (Twilio / Metered.ca) في
  `NEXT_PUBLIC_TURN_URL` و`NEXT_PUBLIC_TURN_USERNAME` و`NEXT_PUBLIC_TURN_CREDENTIAL`.
- **الأيقونات:** تقدر تعيد توليدها بـ `npm run generate-icons`.

---

## أوامر مفيدة

```bash
npm run setup           # إعداد .env.local والمفاتيح
npm run dev             # تشغيل محلي
npm run build           # بناء للإنتاج
npm run start           # تشغيل البناء
npm run lint            # فحص الكود
npm run typecheck       # فحص الأنواع
npm run generate-vapid  # توليد مفاتيح الإشعارات
npm run generate-icons  # توليد أيقونات الـ PWA
```
