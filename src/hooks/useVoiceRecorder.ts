"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RecordingResult {
  blob: Blob;
  durationSeconds: number;
  extension: string;
}

/** بيختار أحسن صيغة صوت يدعمها المتصفح */
function pickMimeType(): { mimeType: string; extension: string } {
  const candidates: { mimeType: string; extension: string }[] = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];

  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(candidate.mimeType)
    ) {
      return candidate;
    }
  }
  return { mimeType: "", extension: "webm" };
}

/** تسجيل الرسايل الصوتية عبر MediaRecorder API */
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extensionRef = useRef("webm");

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("المتصفح ده مش بيدعم التسجيل الصوتي");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mimeType, extension } = pickMimeType();
      extensionRef.current = extension;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(250);
      recorderRef.current = recorder;
      streamRef.current = stream;

      setSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return true;
    } catch {
      setError("مش قادر يوصل للمايك — اسمح بالصلاحية وجرّب تاني");
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      return Promise.resolve(null);
    }

    const duration = seconds;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        cleanup();
        resolve(
          blob.size > 0
            ? { blob, durationSeconds: duration, extension: extensionRef.current }
            : null,
        );
      };
      recorder.stop();
    });
  }, [cleanup, seconds]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    cleanup();
    setSeconds(0);
  }, [cleanup]);

  return { isRecording, seconds, error, start, stop, cancel };
}
