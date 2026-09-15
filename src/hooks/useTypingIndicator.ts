"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const TYPING_TTL_MS = 4000;
const THROTTLE_MS = 1500;

interface TypingPayload {
  userId: string;
  name: string;
}

/**
 * "بيكتب دلوقتي..." عبر Supabase Realtime Broadcast.
 * مش بنخزّن حاجة في الداتابيز — مجرد رسايل عابرة على قناة المحادثة.
 */
export function useTypingIndicator(
  conversationId: string | null,
  myId: string,
  myName: string,
) {
  const [typingUsers, setTypingUsers] = useState<TypingPayload[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!conversationId) return;

    const supabase = getSupabaseBrowser();
    const timers = timersRef.current;
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const data = payload as TypingPayload;
      if (!data?.userId || data.userId === myId) return;

      setTypingUsers((current) =>
        current.some((u) => u.userId === data.userId) ? current : [...current, data],
      );

      // كل إشارة كتابة بتعيش 4 ثواني بس، وبعدين بتختفي لوحدها
      const existing = timers.get(data.userId);
      if (existing) clearTimeout(existing);

      timers.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((current) => current.filter((u) => u.userId !== data.userId));
          timers.delete(data.userId);
        }, TYPING_TTL_MS),
      );
    });

    channel.on("broadcast", { event: "stop-typing" }, ({ payload }) => {
      const data = payload as TypingPayload;
      if (!data?.userId) return;
      setTypingUsers((current) => current.filter((u) => u.userId !== data.userId));
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      setTypingUsers([]);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, myId]);

  /** بنبعت إشارة كل 1.5 ثانية كحد أقصى مهما كتب بسرعة */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < THROTTLE_MS) return;
    lastSentRef.current = now;

    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: myId, name: myName },
    });
  }, [myId, myName]);

  const notifyStopTyping = useCallback(() => {
    lastSentRef.current = 0;
    void channelRef.current?.send({
      type: "broadcast",
      event: "stop-typing",
      payload: { userId: myId, name: myName },
    });
  }, [myId, myName]);

  return { typingUsers, notifyTyping, notifyStopTyping };
}
