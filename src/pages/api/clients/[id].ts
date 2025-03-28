// src/pages/api/clients/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      await prisma.client.delete({ where: { id_client: Number(id) } });
      res.status(200).json({ message: "Cliente eliminado con éxito" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Error deleting client" });
    }
  } else if (req.method === "PUT") {
    try {
      const client = req.body;

      // Campos requeridos (excluyendo dni_number y passport_number)
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

      // Validación: se requiere que al menos uno de los dos campos tenga un valor
      if (!client.dni_number?.trim() && !client.passport_number?.trim()) {
        return res
          .status(400)
          .json({
            error:
              "El DNI y el Pasaporte son obigatorios. Debes cargar al menos uno",
          });
      }

      // Verificar duplicados
      const duplicate = await prisma.client.findFirst({
        where: {
          id_client: { not: Number(id) },
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

      const updatedClient = await prisma.client.update({
        where: { id_client: Number(id) },
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
        },
      });
      res.status(200).json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Error updating client" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
