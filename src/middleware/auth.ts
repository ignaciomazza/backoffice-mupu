// src/middleware/auth.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

interface MyJWTPayload extends JWTPayload {
  userId: number;
}

async function verifyToken(token: string): Promise<MyJWTPayload> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    return payload as MyJWTPayload;
  } catch (error) {
    console.error("Middleware: Error al verificar token:", error);
    throw error;
  }
}

export async function middleware(req: NextRequest) {
  console.log("Middleware: Inicio para", req.nextUrl.pathname);
  const token = req.cookies.get("token")?.value;
  if (!token) {
    console.log("Middleware: No hay token, redirigiendo a /login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const payload = await verifyToken(token);
    const userId = payload.userId;
    console.log("Middleware: Token verificado. userId:", userId);

    // Obtenemos el role desde la cookie (este valor fue seteado desde el frontend)
    const roleFromCookie = req.cookies.get("role")?.value;
    if (!roleFromCookie) {
      console.log(
        "Middleware: No se encontró role en cookie, redirigiendo a /login",
      );
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const normalizedRole = roleFromCookie.toLowerCase();
    console.log("Middleware: Role obtenido desde cookie:", normalizedRole);

    const pathname = req.nextUrl.pathname;
    console.log(`Middleware: Path: ${pathname}`);

    // Definimos las reglas de acceso según la ruta
    let allowedRoles: string[] = [];
    if (/^\/(teams|agency)(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador", "gerente"];
    } else if (/^\/operators(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador", "administrativo"];
    } else if (/^\/users(\/|$)/.test(pathname)) {
      allowedRoles = ["desarrollador"];
    }
    console.log("Middleware: Roles permitidos para esta ruta:", allowedRoles);

    if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) {
      console.log(
        `Middleware: El rol ${normalizedRole} no está permitido para ${pathname}. Redirigiendo a /login`,
      );
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const headers = new Headers(req.headers);
    headers.set("x-user-id", userId.toString());
    console.log("Middleware: Acceso permitido, procediendo");
    return NextResponse.next({ request: { headers } });
  } catch (error) {
    console.error("Middleware: Error en autenticación:", error);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    "/teams/:path*",
    "/agency/:path*",
    "/operators/:path*",
    "/users/:path*",
  ],
};
