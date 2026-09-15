"use client";

import { useEffect, useRef, useState } from "react";
import { getMediaSignedUrl } from "@/actions/media";
import { formatDuration } from "@/lib/utils";
import { PauseIcon, PlayIcon, SpinnerIcon } from "./Icons";

/** مشغّل الرسايل الصوتية — بيجيب Signed URL أول ما المستخدم يدوس play */
export function VoicePlayer({ messageId, outgoing }: { messageId: string; outgoing: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // بنوقّف الصوت لو الـ component اتشال وهو شغال
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [url]);

  /**
   * التشغيل بيحصل هنا مش في الـ click handler، لأن عنصر الـ <audio>
   * مبيتعملش render غير بعد ما الـ Signed URL يوصل.
   */
  useEffect(() => {
    if (!wantsPlay || !url) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    audio
      .play()
      .then(() => {
        if (cancelled) return;
        setPlaying(true);
        setWantsPlay(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("مش قادر يشغّل");
        setWantsPlay(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wantsPlay, url]);

  const toggle = async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    if (!url) {
      setLoading(true);
      const result = await getMediaSignedUrl(messageId);
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.data.url);
    }

    setWantsPlay(true);
  };

  const percent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="flex min-w-[200px] items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          outgoing ? "bg-black/10 dark:bg-white/10" : "bg-wa-primary/15"
        } text-wa-primary`}
        aria-label={playing ? "إيقاف" : "تشغيل"}
      >
        {loading || wantsPlay ? (
          <SpinnerIcon width={16} height={16} />
        ) : playing ? (
          <PauseIcon width={16} height={16} />
        ) : (
          <PlayIcon width={16} height={16} />
        )}
      </button>

      <div className="flex-1">
        <div className="h-1 w-full rounded-full bg-current/20">
          <div
            className="h-1 rounded-full bg-wa-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] opacity-70">
          {error ?? formatDuration(playing || progress > 0 ? progress : duration)}
        </div>
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value)) setDuration(value);
          }}
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onPause={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
