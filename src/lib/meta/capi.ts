// src/lib/meta/capi.ts

import crypto from "node:crypto";

export type MetaCapiEventName = "ViewContent" | "Contact" | "CompleteRegistration";

export type MetaCapiUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  country?: string;
};

export type MetaCapiEventInput = {
  eventName: MetaCapiEventName;
  eventId: string;
  eventSourceUrl: string;
  customData?: Record<string, unknown>;
  user?: MetaCapiUserData;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  clientUserAgent?: string;
};

type MetaCapiPayload = {
  data: Array<Record<string, unknown>>;
  test_event_code?: string;
};

export function sha256Hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return normalizeString(value).replace(/\s+/g, "");
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  // Keep a leading "+" if provided; otherwise send digits only.
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function hashIfPresent(
  value: string | undefined,
  normalizer: (input: string) => string,
): string | undefined {
  if (!value) return undefined;
  const normalized = normalizer(value);
  if (!normalized) return undefined;
  return sha256Hash(normalized);
}

function compactObject<T extends Record<string, unknown>>(obj: T): T {
  const entries = Object.entries(obj).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  return Object.fromEntries(entries) as T;
}

export function buildCapiPayload(input: MetaCapiEventInput): MetaCapiPayload {
  const userData = compactObject({
    client_ip_address: input.clientIp,
    client_user_agent: input.clientUserAgent,
    fbp: input.fbp,
    fbc: input.fbc,
    em: hashIfPresent(input.user?.email, normalizeEmail),
    ph: hashIfPresent(input.user?.phone, normalizePhone),
    fn: hashIfPresent(input.user?.firstName, normalizeString),
    ln: hashIfPresent(input.user?.lastName, normalizeString),
    ct: hashIfPresent(input.user?.city, normalizeString),
    country: hashIfPresent(input.user?.country, normalizeString),
  });

  const eventData = compactObject({
    event_name: input.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    event_id: input.eventId,
    user_data: userData,
    custom_data:
      input.customData && Object.keys(input.customData).length > 0
        ? input.customData
        : undefined,
  });

  return {
    data: [eventData],
  };
}

export async function sendCapiEvent(params: {
  pixelId: string;
  accessToken: string;
  payload: MetaCapiPayload;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { pixelId, accessToken, payload } = params;
  const url = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
