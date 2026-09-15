/**
 * بيولّد مفاتيح VAPID المطلوبة للـ Web Push.
 * التشغيل: npm run generate-vapid
 * وبعدين انسخ القيم في .env.local
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("\n🔑 حط القيم دي في .env.local:\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com\n`);
