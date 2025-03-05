// src/pages/api/user/profile.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const userId = decoded.userId;

    const userProfile = await prisma.user.findUnique({
      where: { id_user: userId },
      include: {
        bookings: { include: { services: true } },
        sales_teams: {
          include: {
            sales_team: {
              include: { user_teams: { include: { user: true } } },
            },
          },
        },
      },
    });

    if (!userProfile) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    let salesData;
    if (userProfile.role === "vendedor") {
      salesData = userProfile.bookings.map((booking) => ({
        id_booking: booking.id_booking,
        details: booking.details,
        totalServices: booking.services.length,
        totalSales: booking.services.reduce(
          (sum, service) => sum + service.sale_price,
          0
        ),
      }));
    } else if (userProfile.role === "lider") {
      const teamMemberIds = userProfile.sales_teams.flatMap((ut) =>
        ut.sales_team.user_teams.map((ut) => ut.user.id_user)
      );

      const teamSales = await prisma.booking.findMany({
        where: { id_user: { in: teamMemberIds } },
        include: { services: true, user: true },
      });

      salesData = teamSales.map((booking) => ({
        id_booking: booking.id_booking,
        details: booking.details,
        totalServices: booking.services.length,
        totalSales: booking.services.reduce(
          (sum, service) => sum + service.sale_price,
          0
        ),
        seller: `${booking.user.first_name} ${booking.user.last_name}`,
      }));
    }

    res.status(200).json({
      id_user: userId,
      name: `${userProfile.first_name} ${userProfile.last_name}`,
      email: userProfile.email,
      position: userProfile.position,
      role: userProfile.role,
      salesData,
    });
  } catch (error: any) {
    // Solo se loguea si NO es un error de token expirado
    if (error.name !== "TokenExpiredError") {
      console.error("Error al verificar token:", error);
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "El token ha expirado" });
    }
    return res.status(401).json({ error: "Token inválido" });
  }
}
