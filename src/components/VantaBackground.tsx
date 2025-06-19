"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import initVantaFog, { VantaOptions } from "vanta/dist/vanta.fog.min";

// Tipado manual del efecto Vanta
interface VantaEffect {
  destroy: () => void;
}

export default function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<VantaEffect | null>(null);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">(
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

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
    initEffect(currentTheme);

    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      const newTheme: "light" | "dark" = isDark ? "dark" : "light";
      if (newTheme !== currentTheme) {
        setCurrentTheme(newTheme);
        initEffect(newTheme);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      vantaEffect.current?.destroy();
    };
  }, [currentTheme, initEffect]);

  return (
    <div
      ref={vantaRef}
      className={`fixed left-0 top-0 -z-10 min-h-screen w-full transition-colors duration-500 ${
        currentTheme === "dark" ? "bg-black" : "bg-white"
      }`}
    />
  );
}
