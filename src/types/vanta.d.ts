// types/vanta.d.ts
declare module "vanta/dist/vanta.fog.min" {
  import type * as THREE from "three";

  export interface VantaOptions {
    el: HTMLElement;
    THREE: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    highlightColor?: number;
    midtoneColor?: number;
    lowlightColor?: number;
    baseColor?: number;
    blurFactor?: number;
    speed?: number;
    zoom?: number;
    [key: string]: unknown;
  }

  export default function initVantaFog(options: VantaOptions): {
    destroy(): void;
  };
}
