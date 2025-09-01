// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

type MyJWTPayload = JWTPayload & {
  userId?: number;
  id_user?: number;
  role?: string;
};

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^leader$/, "lider");
}

async function verifyToken(token: string): Promise<MyJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    return payload as MyJWTPayload;
  } catch {
    return null;
  }
}

// ✅ PRIORIDAD: Authorization primero, cookie después
function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get("token")?.value ?? null;
}

const PUBLIC_PATHS = new Set([
  "/login",
  "/favicon.ico",
  "/api/login",
  "/api/auth/session",
  "/api/auth/logout", // para poder salir aunque el token esté roto
  "/api/user/role", // opcional, si preferís que sea pública para el bootstrap de UI
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // _next y assets quedan fuera por config.matcher; acá solo chequeamos públicas
  for (const p of PUBLIC_PATHS) {
    if (pathname === p || pathname.startsWith(p + "/")) {
      return NextResponse.next();
    }
  }

  const token = getToken(req);
  if (!token) {
    return pathname.startsWith("/api")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyToken(token);
  if (!payload?.role) {
    return pathname.startsWith("/api")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
  }

  const role = normalizeRole(payload.role);
  const userId = Number(payload.userId ?? payload.id_user ?? 0) || 0;

  // Guards opcionales por ruta
  if (!pathname.startsWith("/api")) {
    let allowed: string[] = [];
    if (/^\/(teams|agency)(\/|$)/.test(pathname)) {
      allowed = ["desarrollador", "gerente"];
    } else if (/^\/operators(\/|$)/.test(pathname)) {
      allowed = ["desarrollador", "administrativo", "gerente"];
    } else if (/^\/users(\/|$)/.test(pathname)) {
      allowed = ["desarrollador", "gerente"];
    }
    if (allowed.length && !allowed.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  const headers = new Headers(req.headers);
  headers.set("x-user-id", String(userId));
  headers.set("x-user-role", role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
