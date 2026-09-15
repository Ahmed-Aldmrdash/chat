"use client";

import { useCallback, useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/actions/push";

type PushState = "unsupported" | "default" | "granted" | "denied" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * بيسجّل الـ Service Worker وبيشترك في إشعارات الـ Push.
 *
 * ملاحظة للآيفون: الإشعارات مش هتشتغل غير لو المستخدم ضاف الموقع
 * للشاشة الرئيسية كـ PWA (قيد من آبل على Safari).
 */
export function usePushNotifications(userId: string | null) {
  const [permission, setPermission] = useState<PushState>("loading");
  const [serviceWorkerFailed, setServiceWorkerFailed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  // بنشتق الحالة في الرندر بدل ما نعملها setState جوه الـ effect
  const state: PushState = !supported || serviceWorkerFailed ? "unsupported" : permission;

  useEffect(() => {
    if (!userId || !supported) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(!!existing);
        setPermission(Notification.permission as PushState);

        // الاشتراك موجود بالفعل → نتأكد إنه متسجّل على السيرفر
        if (existing && Notification.permission === "granted") {
          const json = existing.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            await savePushSubscription({
              endpoint: json.endpoint,
              keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            });
          }
        }
      } catch {
        if (!cancelled) setServiceWorkerFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, supported]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported) return { ok: false, error: "المتصفح ده مش بيدعم الإشعارات" };

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return { ok: false, error: "مفتاح VAPID مش متظبط على السيرفر" };

    const result = await Notification.requestPermission();
    setPermission(result as PushState);
    if (result !== "granted") {
      return { ok: false, error: "لازم تسمح بالإشعارات من إعدادات المتصفح" };
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, error: "بيانات الاشتراك ناقصة" };
      }

      const result = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });

      if (!result.ok) return { ok: false, error: result.error };
      setSubscribed(true);
      return { ok: true };
    } catch {
      return { ok: false, error: "مش قادر يفعّل الإشعارات" };
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await deletePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
    setSubscribed(false);
  }, [supported]);

  return { state, supported, subscribed, subscribe, unsubscribe };
}
