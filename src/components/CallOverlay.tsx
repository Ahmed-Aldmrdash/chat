"use client";

import { useEffect, useRef } from "react";
import type { CallStatus } from "@/hooks/useWebRTCCall";
import { Avatar } from "./Avatar";
import {
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "./Icons";

interface CallOverlayProps {
  status: CallStatus;
  isVideo: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerName: string;
  peerId: string;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
  onAccept: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "",
  calling: "بيرن...",
  ringing: "مكالمة واردة",
  connecting: "بيتوصّل...",
  connected: "المكالمة شغالة",
  ended: "المكالمة خلصت",
};

export function CallOverlay({
  status,
  isVideo,
  localStream,
  remoteStream,
  peerName,
  peerId,
  muted,
  cameraOff,
  error,
  onAccept,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (status === "idle") return null;

  const showVideo = isVideo && status === "connected";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b141a] text-white">
      {/* الفيديو البعيد */}
      {showVideo ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <span className="wa-pulse-ring absolute inset-0 rounded-full bg-wa-primary" />
            <Avatar name={peerName || "مكالمة"} id={peerId} size={110} />
          </div>
        </div>
      )}

      {/* الصوت البعيد لما تكون مكالمة صوتية */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* الفيديو المحلي */}
      {isVideo && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute end-4 top-20 h-40 w-28 rounded-xl border-2 border-white/20 object-cover shadow-lg sm:h-48 sm:w-36"
        />
      )}

      {/* بيانات المكالمة */}
      <div className="relative z-10 pt-10 text-center">
        <h2 className="text-2xl font-semibold">{peerName || "مكالمة"}</h2>
        <p className="mt-1 text-sm text-white/70">{error ?? STATUS_LABEL[status]}</p>
      </div>

      {/* الأزرار */}
      <div className="relative z-10 mt-auto flex items-center justify-center gap-5 pb-14">
        {status === "ringing" ? (
          <>
            <button
              type="button"
              onClick={onEnd}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
              aria-label="رفض"
            >
              <PhoneOffIcon width={26} height={26} />
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-wa-primary transition hover:brightness-110"
              aria-label="رد"
            >
              <PhoneIcon width={26} height={26} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                muted ? "bg-white text-[#0b141a]" : "bg-white/15 hover:bg-white/25"
              }`}
              aria-label={muted ? "شغّل المايك" : "اقفل المايك"}
            >
              {muted ? <MicOffIcon width={22} height={22} /> : <MicIcon width={22} height={22} />}
            </button>

            {isVideo && (
              <button
                type="button"
                onClick={onToggleCamera}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                  cameraOff ? "bg-white text-[#0b141a]" : "bg-white/15 hover:bg-white/25"
                }`}
                aria-label={cameraOff ? "شغّل الكاميرا" : "اقفل الكاميرا"}
              >
                {cameraOff ? (
                  <VideoOffIcon width={22} height={22} />
                ) : (
                  <VideoIcon width={22} height={22} />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onEnd}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
              aria-label="إنهاء"
            >
              <PhoneOffIcon width={26} height={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
