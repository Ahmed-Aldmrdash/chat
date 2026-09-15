"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type CallStatus =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

type Signal =
  | { kind: "offer"; from: string; name: string; sdp: RTCSessionDescriptionInit; video: boolean }
  | { kind: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; candidate: RTCIceCandidateInit }
  | { kind: "end"; from: string }
  | { kind: "busy"; from: string };

/**
 * سيرفرات الـ ICE.
 * الـ STUN المجاني بتاع جوجل بيكفي في أغلب الشبكات، لكن لو فيه NAT معقّد
 * هتحتاج TURN server (Twilio / Metered.ca) — حطّه في متغيرات البيئة.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/**
 * مكالمات صوت/فيديو P2P بالـ WebRTC، والـ signaling بيمشي على
 * Supabase Realtime Broadcast (مفيش سيرفر وسيط للصوت/الصورة نفسها).
 */
export function useWebRTCCall(
  conversationId: string | null,
  myId: string,
  myName: string,
) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isVideo, setIsVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerName, setPeerName] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<{ sdp: RTCSessionDescriptionInit; video: boolean } | null>(
    null,
  );
  const statusRef = useRef<CallStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const send = useCallback((signal: Signal) => {
    void channelRef.current?.send({ type: "broadcast", event: "signal", payload: signal });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    pendingCandidatesRef.current = [];
    incomingOfferRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
  }, []);

  /** بيرجّع الحالة لـ idle بعد ثانيتين من انتهاء المكالمة */
  const finish = useCallback(() => {
    cleanup();
    setStatus("ended");
    setTimeout(() => {
      setStatus((current) => (current === "ended" ? "idle" : current));
    }, 2000);
  }, [cleanup]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const inbound = new MediaStream();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ kind: "ice", from: myId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => inbound.addTrack(track));
      setRemoteStream(inbound);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (["failed", "closed"].includes(pc.connectionState)) finish();
      if (pc.connectionState === "disconnected") {
        // ممكن ترجع لوحدها، فبنستنى شوية قبل ما نقفل
        setTimeout(() => {
          if (pcRef.current?.connectionState === "disconnected") finish();
        }, 5000);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [finish, myId, send]);

  const getLocalMedia = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // مرشّح ICE باظ — بنكمّل عادي
      }
    }
  }, []);

  /* ---------------- استقبال إشارات الطرف التاني ---------------- */
  useEffect(() => {
    if (!conversationId) return;

    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(`call:${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const signal = payload as Signal;
      if (!signal || signal.from === myId) return;

      switch (signal.kind) {
        case "offer": {
          // مشغول في مكالمة تانية → نرد بـ busy
          if (statusRef.current !== "idle" && statusRef.current !== "ended") {
            send({ kind: "busy", from: myId });
            return;
          }
          incomingOfferRef.current = { sdp: signal.sdp, video: signal.video };
          setPeerName(signal.name || "مكالمة واردة");
          setIsVideo(signal.video);
          setStatus("ringing");
          break;
        }

        case "answer": {
          const pc = pcRef.current;
          if (!pc || pc.signalingState === "stable") return;
          await pc.setRemoteDescription(signal.sdp);
          await flushCandidates();
          setStatus("connecting");
          break;
        }

        case "ice": {
          const pc = pcRef.current;
          if (!pc || !pc.remoteDescription) {
            pendingCandidatesRef.current.push(signal.candidate);
            return;
          }
          try {
            await pc.addIceCandidate(signal.candidate);
          } catch {
            // بنتجاهل المرشّحات الباظة
          }
          break;
        }

        case "busy": {
          setError("الطرف التاني في مكالمة تانية");
          finish();
          break;
        }

        case "end": {
          finish();
          break;
        }
      }
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
      cleanup();
      setStatus("idle");
    };
  }, [conversationId, myId, cleanup, finish, flushCandidates, send]);

  /* ---------------- بدء مكالمة ---------------- */
  const startCall = useCallback(
    async (video: boolean) => {
      if (!conversationId || statusRef.current !== "idle") return;
      setError(null);
      setIsVideo(video);
      setStatus("calling");

      try {
        const stream = await getLocalMedia(video);
        const pc = createPeerConnection();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        send({ kind: "offer", from: myId, name: myName, sdp: offer, video });
      } catch {
        setError("مش قادر يوصل للمايك/الكاميرا");
        finish();
      }
    },
    [conversationId, createPeerConnection, finish, getLocalMedia, myId, myName, send],
  );

  /* ---------------- الرد على مكالمة ---------------- */
  const acceptCall = useCallback(async () => {
    const incoming = incomingOfferRef.current;
    if (!incoming) return;
    setError(null);
    setStatus("connecting");

    try {
      const stream = await getLocalMedia(incoming.video);
      const pc = createPeerConnection();

      await pc.setRemoteDescription(incoming.sdp);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ kind: "answer", from: myId, sdp: answer });

      incomingOfferRef.current = null;
    } catch {
      setError("مش قادر يوصل للمايك/الكاميرا");
      send({ kind: "end", from: myId });
      finish();
    }
  }, [createPeerConnection, finish, flushCandidates, getLocalMedia, myId, send]);

  const endCall = useCallback(() => {
    send({ kind: "end", from: myId });
    finish();
  }, [finish, myId, send]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  return {
    status,
    isVideo,
    localStream,
    remoteStream,
    peerName,
    muted,
    cameraOff,
    error,
    startCall,
    acceptCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
