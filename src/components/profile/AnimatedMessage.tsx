// src/components/profile/AnimatedMessage.tsx
"use client";
import { useState, useEffect } from "react";

type AnimatedMessageProps = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
  onComplete?: () => void;
};

export default function AnimatedMessage({
  text,
  speed = 50,
  startDelay = 0,
  className = "text-xl font-light",
  onComplete,
}: AnimatedMessageProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let index = 0;
    let typingTimer: NodeJS.Timeout;
    const startTimer = setTimeout(() => {
      const type = () => {
        if (index <= text.length) {
          setDisplayed(text.slice(0, index));
          index++;
          typingTimer = setTimeout(type, speed);
        } else {
          setDone(true);
          onComplete?.();
        }
      };
      type();
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(typingTimer);
    };
  }, [text, speed, startDelay, onComplete]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="cursor">|</span>}
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
