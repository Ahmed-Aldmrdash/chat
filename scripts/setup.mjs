/**
 * إعداد المشروع في خطوة واحدة.
 * التشغيل: npm run setup
 *
 * بيسأل على بيانات Supabase، بيولّد مفاتيح الإشعارات والـ CRON_SECRET،
 * بيكتب .env.local، وبيجهّز نسخة من الـ SQL فيها إيميلك جاهزة للّزق.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env.local");
const SCHEMA_PATH = join(ROOT, "supabase", "schema.sql");
const READY_PATH = join(ROOT, "supabase", "schema.ready.sql");
const PLACEHOLDER = "your-admin-email@example.com";

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });

// بنقرا سطر سطر بنفسنا عشان السكريبت يشتغل سواء المستخدم بيكتب
// أو البيانات جاية من ملف/pipe
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { validate, hint } = {}) {
  for (;;) {
    stdout.write(`${question}\n${c.dim("› ")}`);
    const { value, done } = await lines.next();
    if (done) {
      console.log(c.red("\nالإدخال خلص من غير إجابة."));
      process.exit(1);
    }
    const answer = String(value).trim();
    if (!validate || validate(answer)) return answer;
    console.log(c.red(`  ✗ ${hint}\n`));
  }
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** نفس صيغة المفاتيح اللي مكتبة web-push بتستخدمها: زوج ECDSA على منحنى P-256 */
async function generateVapid() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: base64url(new Uint8Array(raw)), privateKey: jwk.d };
}

/**
 * بنتأكد إن الـ URL والمفتاح شغالين — الفحص ده إرشادي بس ومبيوقفش الإعداد.
 *
 * ملاحظة مهمة: المفاتيح الجديدة (sb_publishable_…) مش JWT، فبنبعتها في هيدر
 * apikey بس. لو بعتناها كـ Authorization: Bearer الـ PostgREST بيحاول يفكّها
 * كـ JWT وبيرد 401 حتى لو المفتاح سليم.
 */
async function checkSupabase(url, anonKey) {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok || response.status === 404) return "ok";

    if (response.status === 401 || response.status === 403) {
      const body = await response.text().catch(() => "");
      // بنعتبره غلط بس لو السيرفر قال كده بالنص
      if (/invalid\s*api\s*key|no\s*api\s*key/i.test(body)) return "bad-key";
    }
    return "unknown";
  } catch {
    return "offline";
  }
}

console.log(`\n${c.bold("إعداد الشات الشخصي")}\n${c.dim("─".repeat(40))}\n`);

if (existsSync(ENV_PATH)) {
  const answer = await ask(
    `${c.yellow("!")} فيه ملف .env.local موجود بالفعل. تحب تستبدله؟ ${c.dim("(y/n)")}`,
    { validate: (v) => /^[yn]$/i.test(v), hint: "اكتب y أو n" },
  );
  if (answer.toLowerCase() === "n") {
    console.log("\nتمام، مغيّرناش حاجة.\n");
    rl.close();
    process.exit(0);
  }
}

console.log(c.dim("هاتهم من: Supabase Dashboard → Project Settings → API\n"));

const supabaseUrl = (await ask(
  `${c.bold("1/4")} Project URL`,
  {
    validate: (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v),
    hint: "المفروض يكون شكله كده: https://xxxxxxxx.supabase.co",
  },
)).replace(/\/+$/, "");

const anonKey = await ask(`${c.bold("2/4")} anon / public key`, {
  validate: (v) => v.length > 20,
  hint: "المفتاح قصير أوي — انسخه كامل",
});

const serviceKey = await ask(
  `${c.bold("3/4")} service_role key ${c.dim("(السري — مش بيروح للمتصفح أبدًا)")}`,
  { validate: (v) => v.length > 20, hint: "المفتاح قصير أوي — انسخه كامل" },
);

const adminEmail = (await ask(
  `${c.bold("4/4")} إيميل الأدمن ${c.dim("(اللي هتدخل بيه إنت)")}`,
  { validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), hint: "اكتب إيميل صحيح" },
)).toLowerCase();

console.log(`\n${c.dim("بيولّد المفاتيح...")}`);
const vapid = await generateVapid();
const cronSecret = base64url(crypto.getRandomValues(new Uint8Array(24)));

writeFileSync(ENV_PATH, [
  "# اتولّد بـ npm run setup",
  `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  `ADMIN_EMAIL=${adminEmail}`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  `VAPID_SUBJECT=mailto:${adminEmail}`,
  `CRON_SECRET=${cronSecret}`,
  "",
].join("\n"));
console.log(c.green("✓") + " اتكتب .env.local");

const schema = readFileSync(SCHEMA_PATH, "utf8");
if (!schema.includes(PLACEHOLDER)) {
  console.log(c.yellow("!") + " مفيش placeholder في schema.sql — تأكد بنفسك من دالة is_admin()");
} else {
  writeFileSync(READY_PATH, schema.split(PLACEHOLDER).join(adminEmail));
  console.log(c.green("✓") + " اتجهّز supabase/schema.ready.sql وفيه إيميلك");
}

process.stdout.write(c.dim("بيتأكد من بيانات Supabase... "));
const check = await checkSupabase(supabaseUrl, anonKey);
console.log({
  ok: c.green("تمام ✓"),
  "bad-key": c.red("المفتاح مرفوض ✗"),
  offline: c.yellow("مش قادر أتحقق (مفيش نت؟)"),
  unknown: c.yellow("مش قادر أتأكد — كمّل عادي"),
}[check]);

if (check === "bad-key") {
  console.log(c.yellow(
    "\nالسيرفر قال إن المفتاح مش صح. الملفات اتكتبت برضه، فلو متأكد منه كمّل،\n" +
    "ولو الاتصال فشل بعدين شغّل npm run setup تاني بمفتاح جديد.",
  ));
}

console.log(`
${c.dim("─".repeat(40))}
${c.bold("الخطوات اللي فاضلة:")}

  ${c.bold("1.")} افتح ${c.bold("supabase/schema.ready.sql")}، انسخه كله،
     والزقه في Supabase → SQL Editor → New query → Run

  ${c.bold("2.")} اعمل حساب الأدمن:
     Supabase → Authentication → Users → Add user → Create new user
     الإيميل: ${c.bold(adminEmail)}
     ${c.yellow("مهم:")} فعّل ${c.bold("Auto Confirm User")}

  ${c.bold("3.")} ${c.bold("npm run dev")} وافتح http://localhost:3000
`);

rl.close();
