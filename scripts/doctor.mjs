/**
 * فحص شامل للإعداد: بيقولك بالظبط إيه اللي ناقص وإزاي تصلّحه.
 * التشغيل: npm run doctor
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let failed = 0;
const pass = (label, extra) =>
  console.log(`${c.green("✓")} ${label}${extra ? c.dim("  " + extra) : ""}`);
const fail = (label, fix) => {
  failed += 1;
  console.log(`${c.red("✗")} ${label}`);
  if (fix) console.log(`  ${c.yellow("←")} ${fix}`);
};
const warn = (label, note) => {
  console.log(`${c.yellow("!")} ${label}`);
  if (note) console.log(`  ${c.dim(note)}`);
};

console.log(`\n${c.bold("فحص إعداد الشات")}\n${c.dim("─".repeat(44))}\n`);

/* ---------------------------------------------- 1. متغيرات البيئة */
const envPath = join(ROOT, ".env.local");
if (!existsSync(envPath)) {
  fail("ملف .env.local مش موجود", "شغّل: npm run setup");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAIL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "CRON_SECRET",
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  fail(`متغيرات ناقصة: ${missing.join("، ")}`, "شغّل: npm run setup");
  process.exit(1);
}
pass("متغيرات البيئة كاملة");

const adminEmail = env.ADMIN_EMAIL.toLowerCase();

/* ---------------------------------------------- 2. الإيميل في الـ SQL */
const readyPath = join(ROOT, "supabase", "schema.ready.sql");
if (existsSync(readyPath)) {
  const sql = readFileSync(readyPath, "utf8");
  if (sql.includes("your-admin-email@example.com")) {
    fail("schema.ready.sql لسه فيه الإيميل الافتراضي", "شغّل: npm run setup");
  } else if (sql.toLowerCase().includes(adminEmail)) {
    pass("الإيميل متحطوط في الـ SQL", adminEmail);
  } else {
    fail(
      "الإيميل اللي في الـ SQL مش نفس اللي في .env.local",
      "شغّل npm run setup تاني والزق الـ SQL من الأول",
    );
  }
} else {
  warn("مفيش schema.ready.sql", "عادي لو لزقت الـ SQL من مكان تاني");
}

/* ---------------------------------------------- 3. الاتصال والجداول */
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** بنفرّق بين "الشبكة مقفولة" و"المفتاح غلط" — الاتنين بيرجّعوا error */
function isNetworkError(message = "") {
  return /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|getaddrinfo|socket hang up|allowlist|network/i
    .test(message);
}

const TABLES = [
  "contacts", "conversations", "conversation_participants", "messages",
  "message_reactions", "contact_tags", "contact_permissions",
  "scheduled_messages", "push_subscriptions", "login_attempts",
];

let reachable = false;
try {
  const { error } = await anon.from("contacts").select("id").limit(1);

  if (error && isNetworkError(error.message)) {
    fail(
      "مش قادر يوصل لـ Supabase أصلًا",
      `اتأكد من النت ومن إن الـ URL صح في .env.local — ${error.message}`,
    );
  } else if (error && /invalid api key|no api key|jwt/i.test(error.message)) {
    fail("المفتاح العام مرفوض", "جرّب مفاتيح Legacy API keys من صفحة API Keys");
  } else if (!error) {
    reachable = true;
    pass("المفتاح العام (anon) شغال");
  } else if (/does not exist|schema cache|relation/i.test(error.message)) {
    reachable = true;
    pass("المفتاح العام (anon) شغال");
    fail("الجداول لسه متعملتش", "الزق supabase/schema.ready.sql في SQL Editor واضغط Run");
  } else {
    reachable = true;
    pass("المفتاح العام (anon) شغال");
    warn("رد غير متوقع من الجداول", error.message);
  }
} catch (error) {
  fail("مش قادر يوصل لـ Supabase", `تأكد من النت ومن الـ URL — ${error.message}`);
}

if (reachable) {
  /* ------------------------------------------- 4. المفتاح السري */
  let serviceOk = false;
  try {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error && isNetworkError(error.message)) {
      fail("مش قادر يوصل لـ Supabase", error.message);
    } else if (error) {
      fail("المفتاح السري مرفوض", "جرّب service_role من Legacy API keys");
    } else {
      serviceOk = true;
      pass("المفتاح السري (service_role) شغال");
    }
  } catch (error) {
    fail("المفتاح السري مرفوض", error.message);
  }

  /* ------------------------------------------- 5. الجداول */
  const missingTables = [];
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) missingTables.push(table);
  }
  if (missingTables.length === 0) {
    pass(`كل الجداول موجودة (${TABLES.length})`);
  } else if (missingTables.length === TABLES.length) {
    fail("مفيش أي جداول", "الزق supabase/schema.ready.sql في SQL Editor واضغط Run");
  } else {
    fail(`جداول ناقصة: ${missingTables.join("، ")}`, "الزق الـ SQL كله تاني — آمن إنه يتعاد");
  }

  /* ------------------------------------------- 6. مكان التخزين */
  if (serviceOk) {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) {
      warn("مش قادر يقرا أماكن التخزين", error.message);
    } else if (buckets?.some((bucket) => bucket.id === "chat-media")) {
      pass("مكان تخزين الصور والصوت موجود");
    } else {
      fail("bucket اسمه chat-media مش موجود", "الزق الـ SQL كله تاني");
    }
  }

  /* ------------------------------------------- 7. حساب الأدمن */
  if (serviceOk) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      warn("مش قادر يقرا المستخدمين", error.message);
    } else {
      const user = data.users.find((u) => u.email?.toLowerCase() === adminEmail);
      if (!user) {
        fail(
          `مفيش حساب بالإيميل ${adminEmail}`,
          "Authentication → Users → Add user → Create new user (وفعّل Auto Confirm User)",
        );
      } else if (!user.email_confirmed_at && !user.confirmed_at) {
        fail(
          "حساب الأدمن موجود بس الإيميل مش مؤكّد",
          "امسح اليوزر واعمله تاني مع تفعيل Auto Confirm User",
        );
      } else {
        pass("حساب الأدمن جاهز", adminEmail);
      }
      console.log(c.dim(`  عدد الحسابات كلها: ${data.users.length}`));
    }
  }
}

/* ---------------------------------------------- الخلاصة */
console.log(`\n${c.dim("─".repeat(44))}`);
if (failed === 0) {
  console.log(`${c.green(c.bold("كله تمام ✓"))}  شغّل ${c.bold("npm run dev")} وافتح http://localhost:3000\n`);
} else {
  console.log(`${c.red(c.bold(`فيه ${failed} حاجة محتاجة تتظبط`))} — اتبع الأسهم الصفرا فوق\n`);
  process.exit(1);
}
