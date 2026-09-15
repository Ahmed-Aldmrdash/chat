"use client";

import { useEffect, useState } from "react";
import { getCachedMediaUrl } from "@/lib/media-cache";
import { SpinnerIcon } from "./Icons";

/**
 * صور الشات مخزّنة في bucket مقفول، فبنجيب Signed URL من السيرفر
 * (بعد ما يتأكد إن المستخدم فعلًا طرف في المحادثة).
 */
export function ChatImage({ messageId, alt }: { messageId: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // الـ messageId ثابت مدى عمر الـ component (الفقاعة متعمولها key بالـ id)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getCachedMediaUrl(messageId);
      if (cancelled) return;
      if (result.ok) setUrl(result.url);
      else setError(result.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (error) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-black/10 text-xs text-wa-secondary">
        {error}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-black/10">
        <SpinnerIcon className="text-wa-secondary" />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt || "صورة"}
          className="max-h-80 w-full max-w-xs rounded-lg object-cover"
          loading="lazy"
        />
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-label="عرض الصورة"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt || "صورة"} className="max-h-full max-w-full rounded" />
        </div>
      )}
    </>
  );
}
