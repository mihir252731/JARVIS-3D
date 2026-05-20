"use client";

import { useEffect, useRef, useState } from "react";
import {
  GestureRecognizer,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

type GestureValue = string | {
  type: "move";
  x: number;
  y: number;
  z: number;
};

type GestureProps = {
  onGesture?: (gesture: GestureValue) => void;
};

type PatchedConsoleWindow = Window &
  typeof globalThis & {
    _patchedConsole?: boolean;
  };

export default function Gesture({ onGesture }: GestureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onGestureRef = useRef(onGesture);
  const [gestureName, setGestureName] = useState("No gesture");
  const lastGestureRef = useRef("None");
  const frameCountRef = useRef(0);

  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  useEffect(() => {
    // ✅ SAFE: runs only in browser
    const patchedWindow = window as PatchedConsoleWindow;
    const videoElement = videoRef.current;

    if (!patchedWindow._patchedConsole) {
      const originalError = console.error;

      console.error = (...args) => {
        if (
          typeof args[0] === "string" &&
          (args[0].includes("TensorFlow") ||
            args[0].includes("inference_feedback") ||
            args[0].includes("landmark_projection"))
        ) {
          return;
        }

        originalError.apply(console, args);
      };

      patchedWindow._patchedConsole = true;
    }

    let recognizer: GestureRecognizer | null = null;
    let animationFrameId: number;
    let stream: MediaStream | null = null;
    let isMounted = true;

    const init = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );

      if (!isMounted) {
        return;
      }

      recognizer = await GestureRecognizer.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          },
          runningMode: "VIDEO",
        }
      );

      if (!isMounted) {
        recognizer.close();
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      const video = videoElement;

      if (video && isMounted) {
        video.srcObject = stream;
        await video.play().catch((err: unknown) => {
          console.warn("Gesture video play interrupted:", err);
        });
      }

      detect();
    };

    const detect = () => {
      if (!videoElement || !recognizer) return;

      const now = performance.now();
      if (
        videoElement &&
        videoElement.videoWidth > 0 &&
        videoElement.videoHeight > 0
      ) {
        try {
          const result = recognizer.recognizeForVideo(
            videoElement,
            now
          );

          const gesture =
            result.gestures.length > 0
              ? result.gestures[0][0].categoryName
              : "None";
          const changed = lastGestureRef.current !== gesture;
          const shouldHeartbeat = frameCountRef.current % 30 === 0;

          if (changed) {
            lastGestureRef.current = gesture;
            setGestureName(gesture === "None" ? "No gesture" : gesture);
          }

          if (changed || shouldHeartbeat) {
            onGestureRef.current?.(gesture);
          }

          frameCountRef.current += 1;
        } catch (err) {
          console.warn("Gesture safe error:", err);
        }
      }

      animationFrameId = requestAnimationFrame(detect);
    };

    init();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      recognizer?.close();
      stream?.getTracks().forEach((track) => track.stop());

      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="gesture-widget">
      <video ref={videoRef} />
      <div>Gesture: {gestureName}</div>
    </div>
  );
}
