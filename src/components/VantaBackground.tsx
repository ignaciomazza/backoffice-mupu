// src/components/VantaBackground.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import initVantaFog, { VantaOptions } from "vanta/dist/vanta.fog.min";

// Tipado manual del efecto Vanta
type VantaEffect = { destroy: () => void };

export default function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<VantaEffect | null>(null);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  const getOptions = (theme: "light" | "dark"): VantaOptions => ({
    el: vantaRef.current!,
    THREE,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    blurFactor: 0.9,
    speed: 0.5,
    zoom: 0.3,
    ...(theme === "light"
      ? {
          baseColor: 0xffffff,
          highlightColor: 0xdff0ff,
          midtoneColor: 0xffffff,
          lowlightColor: 0xffffff,
        }
      : {
          baseColor: 0x070721,
          highlightColor: 0x2d41,
          midtoneColor: 0x62059,
          lowlightColor: 0x4042a,
        }),
  });

  const initEffect = useCallback((theme: "light" | "dark") => {
    if (vantaEffect.current) vantaEffect.current.destroy();
    if (vantaRef.current) {
      vantaEffect.current = initVantaFog(getOptions(theme));
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const isDark = document.documentElement.classList.contains("dark");
      const theme = isDark ? "dark" : "light";
      setCurrentTheme(theme);
      initEffect(theme);
    }

    const observer = new MutationObserver(() => {
      if (typeof document !== "undefined") {
        const isDarkNow = document.documentElement.classList.contains("dark");
        const newTheme: "light" | "dark" = isDarkNow ? "dark" : "light";
        if (newTheme !== currentTheme) {
          setCurrentTheme(newTheme);
          initEffect(newTheme);
        }
      }
    });

    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      observer.disconnect();
      vantaEffect.current?.destroy();
    };
  }, [currentTheme, initEffect]);

  return (
    <div
      ref={vantaRef}
      className={`fixed left-0 top-0 -z-10 min-h-screen w-full transition-colors duration-500 ${
        currentTheme === "dark" ? "bg-sky-950" : "bg-white"
      }`}
    />
  );
}
