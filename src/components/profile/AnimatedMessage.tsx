// src/components/profile/AnimatedMessage.tsx
"use client";

import { useState, useEffect, useCallback } from "react";

type AnimatedMessageProps = {
  text: string;
  speed?: number; 
  variance?: number;
  startDelay?: number; 
  holdTime?: number; 
  className?: string;
  onComplete?: () => void;
};

export default function AnimatedMessage({
  text,
  speed = 85,
  variance = 0.3, 
  startDelay = 300,
  holdTime = 400,
  className = "text-xl font-light",
  onComplete,
}: AnimatedMessageProps) {
  const [phase, setPhase] = useState<
    "start-delay" | "typing" | "hold" | "deleting" | "done"
  >("start-delay");
  const [idx, setIdx] = useState(0);

  const randomDelay = useCallback(() => {
    const delta = speed * variance;
    return speed - delta + Math.random() * delta * 2;
  }, [speed, variance]);

  useEffect(() => {
    if (phase !== "start-delay") return;
    const t = setTimeout(() => setPhase("typing"), startDelay);
    return () => clearTimeout(t);
  }, [phase, startDelay]);

  useEffect(() => {
    if (phase !== "typing") return;
    if (idx < text.length) {
      const t = setTimeout(() => setIdx((i) => i + 1), randomDelay());
      return () => clearTimeout(t);
    }
    setPhase("hold");
  }, [phase, idx, text.length, randomDelay]);

  useEffect(() => {
    if (phase !== "hold") return;
    const t = setTimeout(() => setPhase("deleting"), holdTime);
    return () => clearTimeout(t);
  }, [phase, holdTime]);

  useEffect(() => {
    if (phase !== "deleting") return;
    if (idx > 0) {
      const t = setTimeout(() => setIdx((i) => i - 1), randomDelay());
      return () => clearTimeout(t);
    }
    setPhase("done");
  }, [phase, idx, randomDelay]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => onComplete?.(), 1000);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  return (
    <span className={className}>
      {text.slice(0, idx)}
      {(phase === "typing" || phase === "deleting") && (
        <span className="cursor">|</span>
      )}
      <style jsx>{`
        .cursor {
          display: inline-block;
          margin-left: 2px;
          animation: blink 1s steps(2, start) infinite;
        }
        @keyframes blink {
          to {
            visibility: hidden;
          }
        }
      `}</style>
    </span>
  );
}
