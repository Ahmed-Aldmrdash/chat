"use client";

import { useEffect, useState } from "react";
import { getLinkPreview } from "@/actions/tools";
import type { LinkPreview } from "@/lib/types";

/** كاش في الذاكرة عشان منجيبش نفس اللينك مليون مرة */
const cache = new Map<string, LinkPreview | null>();

export function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreview | null>(() => cache.get(url) ?? null);
  const [loaded, setLoaded] = useState(() => cache.has(url));

  useEffect(() => {
    // القيمة اتقريت من الكاش وقت التهيئة، فمفيش حاجة تتعمل تاني
    if (cache.has(url)) return;

    let cancelled = false;
    (async () => {
      const result = await getLinkPreview(url);
      const value = result.ok ? result.data : null;
      cache.set(url, value);
      if (cancelled) return;
      setPreview(value);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!loaded || !preview || (!preview.title && !preview.description)) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 block overflow-hidden rounded-lg bg-black/5 transition hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      {preview.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          className="h-32 w-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="p-2">
        {preview.siteName && (
          <p className="text-[11px] uppercase opacity-60">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="line-clamp-2 text-sm font-medium">{preview.title}</p>
        )}
        {preview.description && (
          <p className="line-clamp-2 text-xs opacity-70">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
