// src/middleware/auth.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, JWTPayload } from "jose";

// Define la clave secreta
const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

// Define el tipo personalizado de carga útil del token
interface MyJWTPayload extends JWTPayload {
  userId: number;
}

// Verificar el token JWT y devolver un MyJWTPayload
async function verifyToken(token: string): Promise<MyJWTPayload> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
  return payload as MyJWTPayload; // Forzamos el tipo a MyJWTPayload
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const payload = await verifyToken(token);
    const headers = new Headers(req.headers);
    
    // Aseguramos que userId esté disponible y sea un número
    if (typeof payload.userId === "number") {
      headers.set("x-user-id", payload.userId.toString());
    } else {
      throw new Error("userId no válido en el token");
    }

    return NextResponse.next({
      request: {
        headers,
      },
    });
  } catch (error) {
    console.error("Error en el middleware de autenticación:", error);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/api/user/profile", "/api/protected/*"], // Añadir todas las rutas protegidas necesarias
};
