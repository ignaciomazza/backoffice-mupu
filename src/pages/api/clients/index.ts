// src/pages/api/clients/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      // Parse userId from query if present
      const userId = Array.isArray(req.query.userId)
        ? Number(req.query.userId[0])
        : req.query.userId
          ? Number(req.query.userId)
          : null;

      // Build filter
      const where = userId ? { id_user: userId } : {};

      // Fetch clients ordered by registration_date DESC
      const clients = await prisma.client.findMany({
        where,
        orderBy: { registration_date: "desc" },
        include: { user: true },
      });

      return res.status(200).json(clients);
    }

    if (req.method === "POST") {
      const client = req.body;
      const requiredFields = [
        "first_name",
        "last_name",
        "phone",
        "birth_date",
        "nationality",
        "gender",
      ];

      for (const field of requiredFields) {
        if (!client[field]) {
          return res
            .status(400)
            .json({ error: `El campo ${field} es obligatorio.` });
        }
      }

      if (!client.dni_number?.trim() && !client.passport_number?.trim()) {
        return res.status(400).json({
          error:
            "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
        });
      }

      // Check duplicates
      const duplicate = await prisma.client.findFirst({
        where: {
          OR: [
            { dni_number: client.dni_number },
            { passport_number: client.passport_number },
            { tax_id: client.tax_id },
            {
              first_name: client.first_name,
              last_name: client.last_name,
              birth_date: client.birth_date
                ? new Date(client.birth_date)
                : undefined,
            },
          ],
        },
      });

      if (duplicate) {
        return res
          .status(400)
          .json({ error: "Esa información ya pertenece a un cliente." });
      }

      const newClient = await prisma.client.create({
        data: {
          first_name: client.first_name,
          last_name: client.last_name,
          phone: client.phone,
          address: client.address || null,
          postal_code: client.postal_code || null,
          locality: client.locality || null,
          company_name: client.company_name || null,
          tax_id: client.tax_id || null,
          commercial_address: client.commercial_address || null,
          dni_number: client.dni_number,
          passport_number: client.passport_number || null,
          birth_date: new Date(client.birth_date),
          nationality: client.nationality,
          gender: client.gender,
          email: client.email || null,
          id_user: Number(client.id_user),
        },
      });

      return res.status(201).json(newClient);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error("Error en /api/clients:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}
