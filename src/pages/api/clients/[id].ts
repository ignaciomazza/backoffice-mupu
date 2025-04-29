// src/pages/api/clients/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  const clientId = Number(id);

  if (isNaN(clientId)) {
    return res.status(400).json({ error: "ID de cliente inválido" });
  }

  // 1) GET /api/clients/:id — traer un cliente
  if (req.method === "GET") {
    try {
      const client = await prisma.client.findUnique({
        where: { id_client: clientId },
        include: { user: true },
      });
      if (!client) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }
      return res.status(200).json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      return res.status(500).json({ error: "Error fetching client" });
    }
  }

  // 2) PUT /api/clients/:id — actualizar un cliente
  if (req.method === "PUT") {
    try {
      const clientData = req.body;

      // Campos requeridos
      const requiredFields = [
        "first_name",
        "last_name",
        "phone",
        "birth_date",
        "nationality",
        "gender",
      ];
      for (const field of requiredFields) {
        if (!clientData[field]) {
          return res
            .status(400)
            .json({ error: `El campo ${field} es obligatorio.` });
        }
      }

      // Requiere DNI o Pasaporte
      if (
        !clientData.dni_number?.trim() &&
        !clientData.passport_number?.trim()
      ) {
        return res.status(400).json({
          error:
            "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
        });
      }

      // Verificar duplicados (excluyendo este ID)
      const duplicate = await prisma.client.findFirst({
        where: {
          id_client: { not: clientId },
          OR: [
            { dni_number: clientData.dni_number },
            { passport_number: clientData.passport_number },
            { tax_id: clientData.tax_id },
            {
              first_name: clientData.first_name,
              last_name: clientData.last_name,
              birth_date: clientData.birth_date
                ? new Date(clientData.birth_date)
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
        where: { id_client: clientId },
        data: {
          first_name: clientData.first_name,
          last_name: clientData.last_name,
          phone: clientData.phone,
          address: clientData.address || null,
          postal_code: clientData.postal_code || null,
          locality: clientData.locality || null,
          company_name: clientData.company_name || null,
          tax_id: clientData.tax_id || null,
          commercial_address: clientData.commercial_address || null,
          dni_number: clientData.dni_number,
          passport_number: clientData.passport_number || null,
          birth_date: new Date(clientData.birth_date),
          nationality: clientData.nationality,
          gender: clientData.gender,
          email: clientData.email || null,
          id_user: Number(clientData.id_user),
        },
      });
      return res.status(200).json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      return res.status(500).json({ error: "Error updating client" });
    }
  }

  // 3) DELETE /api/clients/:id — eliminar un cliente
  if (req.method === "DELETE") {
    try {
      await prisma.client.delete({ where: { id_client: clientId } });
      return res.status(200).json({ message: "Cliente eliminado con éxito" });
    } catch (error) {
      console.error("Error deleting client:", error);
      return res.status(500).json({ error: "Error deleting client" });
    }
  }

  // Si no es GET, PUT ni DELETE
  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
