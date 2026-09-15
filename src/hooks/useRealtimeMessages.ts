"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Message } from "@/lib/types";

interface Handlers {
  onInsert?: (message: Message) => void;
  onUpdate?: (message: Message) => void;
  onReactionChange?: () => void;
}

/**
 * وصول فوري للرسايل الجديدة/المعدّلة في محادثة واحدة عبر Postgres Changes.
 * (لازم يكون الـ Realtime مفعّل على جدول messages — موجود في schema.sql)
 */
export function useRealtimeMessages(conversationId: string | null, handlers: Handlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!conversationId) return;

    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => handlersRef.current.onInsert?.(payload.new as Message),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => handlersRef.current.onUpdate?.(payload.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => handlersRef.current.onReactionChange?.(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);
}

/** بيراقب أي رسالة جديدة في أي محادثة عشان نحدّث القايمة الجانبية */
export function useRealtimeConversationList(onChange: () => void) {
  const callbackRef = useRef(onChange);

  useEffect(() => {
    callbackRef.current = onChange;
  });

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("conversation-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => callbackRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => callbackRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
