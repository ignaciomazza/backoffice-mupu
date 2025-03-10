// src/pages/api/clients/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    try {
      const clients = await prisma.client.findMany();
      res.status(200).json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Error fetching clients" });
    }
  } else if (req.method === "POST") {
    try {
      const client = req.body;

      // Validar campos obligatorios según el modelo
      const requiredFields = [
        "first_name",
        "last_name",
        "phone",
        "dni_number",
        "dni_issue_date",
        "dni_expiry_date",
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

      // Verificar duplicados (puedes ajustar la lógica según tus necesidades)
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
          dni_issue_date: new Date(client.dni_issue_date),
          dni_expiry_date: new Date(client.dni_expiry_date),
          birth_date: new Date(client.birth_date),
          nationality: client.nationality,
          gender: client.gender,
          passport_issue: client.passport_issue
            ? new Date(client.passport_issue)
            : null,
          passport_expiry: client.passport_expiry
            ? new Date(client.passport_expiry)
            : null,
        },
      });

      res.status(201).json(newClient);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Error creating client" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
