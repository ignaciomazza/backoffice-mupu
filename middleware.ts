// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET as string;

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

function getToken(req: NextRequest): string | null {
  // 1) Cookie
  const cookieToken = req.cookies.get("token")?.value ?? null;
  if (cookieToken) return cookieToken;

  // 2) Authorization: Bearer
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  return null;
}

export async function middleware(req: NextRequest) {
  if (!JWT_SECRET) {
    // Evitá validar con un secreto incorrecto; si falta, tratamos todo como no autenticado.
    // (No redirigimos acá para no entrar en loops; las APIs devolverán 401).
  }

  const { pathname } = req.nextUrl;

  // Rutas públicas
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/auth/session")
  ) {
    return NextResponse.next();
  }

  const token = getToken(req);
  if (!token) {
    // Para páginas: redirigí
    if (!pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Para APIs: devolvé 401 JSON
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload?.role) {
    if (!pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = normalizeRole(payload.role);
  const userId = Number(payload.userId ?? payload.id_user ?? 0) || 0;

  // Guardas por página (opcional; mantené las tuyas)
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

  // Propagá info útil
  const headers = new Headers(req.headers);
  headers.set("x-user-id", String(userId));
  headers.set("x-user-role", role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // no interceptes assets estáticos ni imágenes
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
