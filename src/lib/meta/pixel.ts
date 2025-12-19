// src/lib/meta/pixel.ts
"use client";

export type MetaEventName = "ViewContent" | "Contact" | "CompleteRegistration";

export type MetaCustomData = Record<
  string,
  string | number | boolean | null | undefined
>;

export type MetaUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  country?: string;
};

export type MetaTrackOptions = {
  eventId?: string;
  eventSourceUrl?: string;
  customData?: MetaCustomData;
  user?: MetaUserData;
  fbp?: string;
  fbc?: string;
};

type MetaCapiPayload = {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl: string;
  customData?: MetaCustomData;
  user?: MetaUserData;
  fbp?: string;
  fbc?: string;
};

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

type PendingPixelEvent = {
  eventName: MetaEventName;
  params?: MetaCustomData;
  eventId: string;
};

const pixelQueue: PendingPixelEvent[] = [];
let pixelQueueTimer: number | null = null;
let pixelQueueTimeout: number | null = null;

function isTrackingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.__META_TRACKING_ENABLED === "boolean") {
    return window.__META_TRACKING_ENABLED;
  }
  return PIXEL_ID.length > 0;
}

export function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return undefined;
  const value = match.split("=").slice(1).join("=");
  return decodeURIComponent(value);
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${maxAgeSeconds}`,
    "samesite=lax",
    secure ? "secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function getFbp(): string | undefined {
  return readCookie("_fbp");
}

export function getFbc(): string | undefined {
  const existing = readCookie("_fbc");
  if (existing) return existing;

  if (typeof window === "undefined") return undefined;
  const fbclid = new URL(window.location.href).searchParams.get("fbclid");
  if (!fbclid) return undefined;

  // Timestamp in seconds to match Meta's typical _fbc format.
  const timestamp = Math.floor(Date.now() / 1000);
  const fbc = `fb.1.${timestamp}.${fbclid}`;
  setCookie("_fbc", fbc, 60 * 60 * 24 * 90);
  return fbc;
}

function flushPixelQueue() {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;

  while (pixelQueue.length > 0) {
    const item = pixelQueue.shift();
    if (!item) break;
    window.fbq("track", item.eventName, item.params ?? {}, {
      eventID: item.eventId,
    });
  }

  if (pixelQueueTimer !== null) {
    window.clearInterval(pixelQueueTimer);
    pixelQueueTimer = null;
  }
  if (pixelQueueTimeout !== null) {
    window.clearTimeout(pixelQueueTimeout);
    pixelQueueTimeout = null;
  }
}

function enqueuePixelEvent(item: PendingPixelEvent) {
  pixelQueue.push(item);
  if (pixelQueueTimer !== null) return;

  pixelQueueTimer = window.setInterval(() => {
    if (typeof window.fbq === "function") {
      flushPixelQueue();
    }
  }, 200);

  if (pixelQueueTimeout !== null) {
    window.clearTimeout(pixelQueueTimeout);
  }

  pixelQueueTimeout = window.setTimeout(() => {
    if (pixelQueueTimer !== null && typeof window.fbq !== "function") {
      window.clearInterval(pixelQueueTimer);
      pixelQueueTimer = null;
      pixelQueue.length = 0;
    }
    pixelQueueTimeout = null;
  }, 4000);
}

async function postCapiEvent(payload: MetaCapiPayload) {
  try {
    const response = await fetch("/api/meta/conversions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok && process.env.NODE_ENV !== "production") {
      const text = await response.text();
      console.warn("Meta CAPI error", text);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Meta CAPI request failed", error);
    }
  }
}

function trackEvent(
  eventName: MetaEventName,
  params?: MetaCustomData,
  options?: MetaTrackOptions,
): string | null {
  if (!isTrackingEnabled() || typeof window === "undefined") return null;

  const eventId = options?.eventId ?? generateEventId();
  const eventSourceUrl = options?.eventSourceUrl ?? window.location.href;
  const customData = options?.customData ?? params;

  const fbp = options?.fbp ?? getFbp();
  const fbc = options?.fbc ?? getFbc();

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params ?? {}, { eventID: eventId });
  } else {
    enqueuePixelEvent({ eventName, params, eventId });
  }

  void postCapiEvent({
    eventName,
    eventId,
    eventSourceUrl,
    customData,
    user: options?.user,
    fbp,
    fbc,
  });

  return eventId;
}

export function trackViewContent(
  params?: MetaCustomData,
  options?: MetaTrackOptions,
): string | null {
  return trackEvent("ViewContent", params, options);
}

export function trackContact(
  params?: MetaCustomData,
  options?: MetaTrackOptions,
): string | null {
  return trackEvent("Contact", params, options);
}

export function trackCompleteRegistration(
  params?: MetaCustomData,
  options?: MetaTrackOptions,
): string | null {
  return trackEvent("CompleteRegistration", params, options);
}
