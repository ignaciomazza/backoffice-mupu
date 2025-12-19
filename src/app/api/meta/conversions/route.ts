// src/app/api/meta/conversions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildCapiPayload, sendCapiEvent } from "@/lib/meta/capi";

export const runtime = "nodejs";

const userSchema = z
  .object({
    email: z.string(),
    phone: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    city: z.string(),
    country: z.string(),
  })
  .partial();

const requestSchema = z.object({
  eventName: z.enum(["ViewContent", "Contact", "CompleteRegistration"]),
  eventId: z.string().min(1),
  eventSourceUrl: z.string().min(1),
  customData: z.record(z.unknown()).optional(),
  user: userSchema.optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
});

function getClientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  const enabled = process.env.META_ENABLE_TRACKING !== "false";
  if (!enabled) {
    return NextResponse.json({ status: "disabled" });
  }

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    return NextResponse.json(
      { status: "error", message: "Meta CAPI not configured" },
      { status: 500 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid request",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(request);
  const clientUserAgent = request.headers.get("user-agent") ?? undefined;

  const payload = buildCapiPayload({
    ...parsed.data,
    clientIp,
    clientUserAgent,
  });

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const metaResponse = await sendCapiEvent({
      pixelId,
      accessToken,
      payload,
    });

    if (!metaResponse.ok) {
      return NextResponse.json(
        {
          status: "error",
          message: "Meta CAPI error",
          meta: metaResponse.body,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ status: "ok", meta: metaResponse.body });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Meta CAPI request failed" },
      { status: 502 },
    );
  }
}
