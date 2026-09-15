/* eslint-disable no-restricted-globals */
/**
 * Service Worker — مسؤول عن استقبال الـ Web Push Notifications
 * وفتح المحادثة الصح لما المستخدم يدوس على الإشعار.
 */

self.addEventListener("install", (event) => {
  // نشتغل على طول من غير ما نستنى الـ tabs القديمة تتقفل
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: "رسالة جديدة", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "رسالة جديدة";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    dir: "rtl",
    lang: "ar",
    // بنستخدم tag بالـ conversation id عشان الرسايل المتتالية من نفس الشخص
    // متعملش كومة إشعارات
    tag: payload.tag || "chat-message",
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: payload.url || "/",
      conversationId: payload.conversationId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // لو التطبيق مفتوح بالفعل، نركّز عليه ونوديه للمحادثة
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      }),
  );
});
