// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

type MyJWTPayload = JWTPayload & {
  userId?: number;
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
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

function getToken(req: NextRequest): string | null {
  // 1) Cookie
  const cookieToken = req.cookies.get("token")?.value ?? null;
  if (cookieToken) return cookieToken;

  // 2) Authorization: Bearer
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  return null;
}

const PUBLIC_PATHS = [
  "/login",
  "/favicon.ico",
  "/api/login",
  "/api/auth/session",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permitir assets y _next por config.matcher; acá chequeamos rutas públicas
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // Permitir preflights de CORS si llegan a APIs
  if (req.method === "OPTIONS") {
    return NextResponse.next();
  }

  const token = getToken(req);
  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyToken(token);
  if (!payload?.role) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = normalizeRole(payload.role);
  const userId = Number(payload.userId ?? payload.id_user ?? 0) || 0;

  // Guards de páginas (opcional; ajustá a tu gusto)
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

  // Inyectar headers útiles a la request que sigue (páginas y APIs)
  const forwarded = new Headers(req.headers);
  forwarded.set("x-user-id", String(userId));
  forwarded.set("x-user-role", role);

  return NextResponse.next({ request: { headers: forwarded } });
}

// No interceptar archivos estáticos ni imágenes
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
