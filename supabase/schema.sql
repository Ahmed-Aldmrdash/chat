-- ============================================================================
--  Personal Chat App — Full Database Schema
--  شغّل الملف ده كله مرة واحدة في: Supabase Dashboard → SQL Editor
--
--  ⚠️ قبل التشغيل: غيّر 'your-admin-email@example.com' في دالة public.is_admin()
--     لإيميل الأدمن الحقيقي، وخليه مطابق لقيمة ADMIN_EMAIL في .env.local
-- ============================================================================

-- ==========================================
-- EXTENSIONS
-- ==========================================
create extension if not exists "pgcrypto";

-- ==========================================
-- 1. CONTACTS
-- ==========================================
create table if not exists public.contacts (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  status_text text default 'متاح',
  is_blocked boolean default false,
  is_favorite boolean default false,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);

-- ==========================================
-- 2. CONVERSATIONS
-- ==========================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'admin_contact'
    check (conversation_type in ('admin_contact', 'contact_contact')),
  is_pinned boolean default false,
  is_muted boolean default false,
  disappearing_duration_hours integer default null, -- null = معطّل
  created_at timestamptz default now(),
  last_message_at timestamptz default now()
);

-- ==========================================
-- 3. CONVERSATION PARTICIPANTS (يدعم أي عدد أطراف/أي نوع محادثة)
-- ==========================================
create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  unique (conversation_id, contact_id)
);

create index if not exists idx_participants_contact
  on public.conversation_participants(contact_id);

-- ==========================================
-- 4. MESSAGES
-- ==========================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  content text not null,
  content_type text not null default 'text'
    check (content_type in ('text', 'image', 'voice')),
  media_path text,
  reply_to_id uuid references public.messages(id) on delete set null,
  is_forwarded boolean default false,
  is_broadcast boolean default false,
  is_read boolean default false,
  is_deleted boolean default false,
  edited_at timestamptz,
  expires_at timestamptz, -- للرسايل اللي تختفي تلقائيًا
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation
  on public.messages(conversation_id, created_at);
create index if not exists idx_messages_expires_at
  on public.messages(expires_at) where expires_at is not null;

-- ==========================================
-- 5. MESSAGE REACTIONS
-- ==========================================
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id)
);

-- ==========================================
-- 6. CONTACT TAGS
-- ==========================================
create table if not exists public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag text not null,
  color text default '#00a884',
  unique (contact_id, tag)
);

-- ==========================================
-- 7. CONTACT PERMISSIONS (مين مسموحله يكلم مين)
-- ==========================================
create table if not exists public.contact_permissions (
  id uuid primary key default gen_random_uuid(),
  contact_a_id uuid not null references public.contacts(id) on delete cascade,
  contact_b_id uuid not null references public.contacts(id) on delete cascade,
  allowed_by_admin boolean default false,
  created_at timestamptz default now(),
  unique (contact_a_id, contact_b_id)
);

-- ==========================================
-- 8. SCHEDULED MESSAGES
-- ==========================================
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  content text not null,
  send_at timestamptz not null,
  sent boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_scheduled_pending
  on public.scheduled_messages(send_at) where sent = false;

-- ==========================================
-- 9. PUSH SUBSCRIPTIONS
-- ==========================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- ==========================================
-- 10. LOGIN ATTEMPTS (Rate Limiting)
-- ==========================================
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  attempted_at timestamptz default now()
);

create index if not exists idx_login_attempts_identifier
  on public.login_attempts(identifier, attempted_at);

-- ==========================================
-- 11. STORAGE BUCKET للصور/الصوت
-- ==========================================
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

-- ==========================================
-- 12. HELPER FUNCTIONS
-- ==========================================

-- هل المستخدم الحالي هو الأدمن؟
-- ⚠️ غيّر الإيميل ده لإيميل الأدمن الحقيقي (نفس قيمة ADMIN_EMAIL)
create or replace function public.is_admin()
returns boolean as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'your-admin-email@example.com';
$$ language sql stable;

-- هل المستخدم الحالي مشارك في المحادثة دي؟
-- security definer عشان نتفادى الـ infinite recursion في سياسات الـ RLS
-- (سياسة على conversation_participants بتقرأ من conversation_participants)
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
      and contact_id = auth.uid()
  );
$$;

-- كل المحادثات اللي المستخدم الحالي طرف فيها
create or replace function public.my_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select conversation_id from public.conversation_participants
  where contact_id = auth.uid();
$$;

-- هل بينى وبين الشخص ده محادثة مشتركة؟ (عشان أقدر أشوف اسمه وصورته)
create or replace function public.shares_conversation_with(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp_me
    join public.conversation_participants cp_other
      on cp_other.conversation_id = cp_me.conversation_id
    where cp_me.contact_id = auth.uid()
      and cp_other.contact_id = p_contact_id
  );
$$;

-- هل المستخدم الحالي محظور؟
create or replace function public.is_blocked_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contacts
    where id = auth.uid() and is_blocked = true
  );
$$;

-- هل مسموح الإرسال في المحادثة دي؟
-- محادثات contact_contact مقفولة لحد ما الأدمن يدي إذن صريح في contact_permissions،
-- والإذن ده ممكن يتسحب في أي وقت (allowed_by_admin = false) فيفضلوا شايفين
-- التاريخ بس مش قادرين يبعتوا.
create or replace function public.can_send_in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (
      select conversation_type from public.conversations where id = p_conversation_id
    ) = 'contact_contact' then exists (
      select 1
      from public.contact_permissions cp
      join public.conversation_participants p1
        on p1.conversation_id = p_conversation_id and p1.contact_id = cp.contact_a_id
      join public.conversation_participants p2
        on p2.conversation_id = p_conversation_id and p2.contact_id = cp.contact_b_id
      where cp.allowed_by_admin = true
    )
    else true
  end;
$$;

-- ==========================================
-- 13. ROW LEVEL SECURITY
-- ==========================================
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.contact_tags enable row level security;
alter table public.contact_permissions enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.push_subscriptions enable row level security;
-- login_attempts: RLS متفعّل من غير أي policy → مفيش وصول غير عبر service_role
alter table public.login_attempts enable row level security;

-- ---------- Contacts ----------
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
  for select using (
    auth.uid() = id
    or public.is_admin()
    or public.shares_conversation_with(id)
  );

-- كل شخص يقدر يعدّل حالته النصية/صورته/آخر ظهور بتاعه بس
-- (والأدمن لوحده هو اللي يقدر يغيّر is_blocked / is_favorite عبر service_role)
drop policy if exists "contacts_update_own" on public.contacts;
create policy "contacts_update_own" on public.contacts
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "contacts_admin_all" on public.contacts;
create policy "contacts_admin_all" on public.contacts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Conversation Participants ----------
drop policy if exists "participants_select" on public.conversation_participants;
create policy "participants_select" on public.conversation_participants
  for select using (
    public.is_admin()
    or contact_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
  );

drop policy if exists "participants_admin_manage" on public.conversation_participants;
create policy "participants_admin_manage" on public.conversation_participants
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Conversations ----------
drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.is_admin()
    or id in (select public.my_conversation_ids())
  );

-- التثبيت/الكتم/مدة الاختفاء = الأدمن بس
drop policy if exists "conversations_admin_manage" on public.conversations;
create policy "conversations_admin_manage" on public.conversations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Messages ----------
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (
    public.is_admin()
    or public.is_conversation_participant(conversation_id)
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and not public.is_blocked_user()
    and public.can_send_in_conversation(conversation_id)
    and (
      public.is_admin()
      or public.is_conversation_participant(conversation_id)
    )
  );

-- التعديل/الحذف = صاحب الرسالة أو الأدمن.
-- علامات القراءة بتتعمل عبر RPC mark_conversation_read() مش عبر update مباشر.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update using (sender_id = auth.uid() or public.is_admin())
  with check (sender_id = auth.uid() or public.is_admin());

-- ---------- Reactions ----------
drop policy if exists "reactions_select" on public.message_reactions;
create policy "reactions_select" on public.message_reactions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_participant(m.conversation_id)
    )
  );

drop policy if exists "reactions_insert_own" on public.message_reactions;
create policy "reactions_insert_own" on public.message_reactions
  for insert with check (user_id = auth.uid());

drop policy if exists "reactions_update_own" on public.message_reactions;
create policy "reactions_update_own" on public.message_reactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reactions_delete_own" on public.message_reactions;
create policy "reactions_delete_own" on public.message_reactions
  for delete using (user_id = auth.uid());

-- ---------- Tags (Admin فقط) ----------
drop policy if exists "tags_admin_only" on public.contact_tags;
create policy "tags_admin_only" on public.contact_tags
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Permissions ----------
drop policy if exists "permissions_admin_manage" on public.contact_permissions;
create policy "permissions_admin_manage" on public.contact_permissions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "permissions_view_own" on public.contact_permissions;
create policy "permissions_view_own" on public.contact_permissions
  for select using (contact_a_id = auth.uid() or contact_b_id = auth.uid());

-- ---------- Scheduled Messages ----------
drop policy if exists "scheduled_manage_own" on public.scheduled_messages;
create policy "scheduled_manage_own" on public.scheduled_messages
  for all using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- ---------- Push Subscriptions ----------
drop policy if exists "manage_own_subscription" on public.push_subscriptions;
create policy "manage_own_subscription" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Storage: رفع في فولدر خاص بكل يوزر ----------
drop policy if exists "upload_own_folder" on storage.objects;
create policy "upload_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- القراءة المباشرة = صاحب الملف أو الأدمن.
-- الطرف التاني بيشوف الميديا عبر Signed URL بيتولّد على السيرفر بعد التأكد
-- إنه فعلًا مشارك في المحادثة (شوف actions/media.ts).
drop policy if exists "read_own_or_admin" on storage.objects;
create policy "read_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'chat-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "delete_own_media" on storage.objects;
create policy "delete_own_media" on storage.objects
  for delete using (
    bucket_id = 'chat-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ==========================================
-- 14. TRIGGERS
-- ==========================================

-- تحديث last_message_at تلقائيًا
-- security definer لأن المستخدم العادي معندوش صلاحية UPDATE على conversations
create or replace function public.update_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_update_last_message on public.messages;
create trigger trg_update_last_message
after insert on public.messages
for each row execute function public.update_last_message_at();

-- ضبط وقت اختفاء الرسالة تلقائيًا حسب إعداد المحادثة
create or replace function public.set_message_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours integer;
begin
  if new.expires_at is null then
    select disappearing_duration_hours into v_hours
    from public.conversations where id = new.conversation_id;

    if v_hours is not null and v_hours > 0 then
      new.expires_at := coalesce(new.created_at, now()) + (v_hours || ' hours')::interval;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_message_expiry on public.messages;
create trigger trg_set_message_expiry
before insert on public.messages
for each row execute function public.set_message_expiry();

-- ==========================================
-- 15. RPC FUNCTIONS مساعدة
-- ==========================================

-- عداد الرسايل الغير مقروءة (بيشتغل بصلاحيات المستخدم → الـ RLS بتطبّق)
create or replace function public.get_unread_count(p_conversation_id uuid, p_user_id uuid)
returns bigint as $$
  select count(*)
  from public.messages
  where conversation_id = p_conversation_id
    and sender_id != p_user_id
    and is_read = false
    and is_deleted = false;
$$ language sql stable;

-- تعليم رسايل محادثة كمقروءة (المستقبِل مش مالك الرسالة، فمحتاجين security definer
-- بشرط إنه يكون فعلًا مشارك في المحادثة)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not (public.is_conversation_participant(p_conversation_id) or public.is_admin()) then
    raise exception 'not a participant of this conversation';
  end if;

  update public.messages
  set is_read = true
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- إحصائيات: عدد الرسايل لكل شخص (Admin فقط)
create or replace function public.get_message_counts_by_contact()
returns table(display_name text, message_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select c.display_name, count(m.id)
    from public.messages m
    join public.contacts c on c.id = m.sender_id
    where m.is_deleted = false
    group by c.display_name
    order by count(m.id) desc;
end;
$$;

-- إحصائيات: النشاط حسب الساعة (Admin فقط)
create or replace function public.get_message_counts_by_hour()
returns table(hour int, message_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select extract(hour from m.created_at)::int as hour, count(*)
    from public.messages m
    where m.is_deleted = false
    group by 1
    order by 1;
end;
$$;

-- ==========================================
-- 16. REALTIME
-- ==========================================
-- تفعيل الـ Realtime على جدول الرسايل والتفاعلات
-- (لو ظهر خطأ "already member of publication" يبقى كله تمام)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;
