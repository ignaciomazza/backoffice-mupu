// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

interface MyJWTPayload extends JWTPayload {
  userId: number;
  role: string;
}

async function verifyToken(token: string): Promise<MyJWTPayload> {
  console.log("[Middleware] Verifying token:", token);
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    console.log("[Middleware] Token payload:", payload);
    return payload as MyJWTPayload;
  } catch (error) {
    console.error("[Middleware] Error during token verification:", error);
    throw error;
  }
}

export async function middleware(req: NextRequest) {
  console.log("[Middleware] Inicio para:", req.nextUrl.pathname);

  if (
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/_next") ||
    req.nextUrl.pathname === "/favicon.ico"
  ) {
    console.log("[Middleware] Ruta ignorada:", req.nextUrl.pathname);
    return NextResponse.next();
  }

  const tokenCookie = req.cookies.get("token");
  if (!tokenCookie) {
    console.log("[Middleware] No hay token en cookies");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = tokenCookie.value;
  console.log("[Middleware] Token encontrado en cookie:", token);

  try {
    const payload = await verifyToken(token);
    const userId = payload.userId;
    const userRole = payload.role?.toLowerCase();
    console.log("[Middleware] userId:", userId, "| role:", userRole);
    if (!userRole) {
      console.log("[Middleware] Rol no encontrado en token");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const pathname = req.nextUrl.pathname;
    console.log("[Middleware] Request path:", pathname);

    let allowedRoles: string[] = [];
    if (/^\/(teams|agency)(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador", "gerente"];
    } else if (/^\/operators(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador", "administrativo"];
    } else if (/^\/users(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador"];
    }
    console.log("[Middleware] Allowed roles for this route:", allowedRoles);

    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      console.log(
        `[Middleware] Rol "${userRole}" NO permitido para la ruta "${pathname}". Redirigiendo a /login`,
      );
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const modifiedHeaders = new Headers(req.headers);
    modifiedHeaders.set("x-user-id", userId.toString());
    console.log("[Middleware] Acceso permitido. Continuando con request.");
    return NextResponse.next({ request: { headers: modifiedHeaders } });
  } catch (error) {
    console.error("[Middleware] Error en autenticación:", error);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!login|_next|favicon.ico).*)"],
};
