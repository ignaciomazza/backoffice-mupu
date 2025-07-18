// src/pages/api/clients/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  const clientId = Number(id);

  if (isNaN(clientId)) {
    return res.status(400).json({ error: "N° de cliente inválido" });
  }

  // GET /api/clients/:id
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

  // PUT /api/clients/:id
  if (req.method === "PUT") {
    try {
      const clientData = req.body;

      // Validar campos obligatorios
      const requiredFields = [
        "first_name",
        "last_name",
        "phone",
        "birth_date",
        "nationality",
        "gender",
      ] as const;
      for (const field of requiredFields) {
        if (!clientData[field]) {
          return res
            .status(400)
            .json({ error: `El campo ${field} es obligatorio.` });
        }
      }

      // Normalizar cadenas vacías a null
      const dni = clientData.dni_number?.trim() || null;
      const passport = clientData.passport_number?.trim() || null;
      const taxId = clientData.tax_id?.trim() || null;

      if (!dni && !passport) {
        return res.status(400).json({
          error:
            "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
        });
      }

      // Construir condiciones de duplicado tipadas
      const orConditions: Prisma.ClientWhereInput[] = [];
      if (dni) orConditions.push({ dni_number: dni });
      if (passport) orConditions.push({ passport_number: passport });
      if (taxId) orConditions.push({ tax_id: taxId });
      orConditions.push({
        first_name: clientData.first_name,
        last_name: clientData.last_name,
        birth_date: new Date(clientData.birth_date),
      });

      // Verificar duplicados excluyendo este ID
      const duplicate = await prisma.client.findFirst({
        where: {
          id_client: { not: clientId },
          OR: orConditions,
        },
      });
      if (duplicate) {
        return res
          .status(400)
          .json({ error: "Esa información ya pertenece a un cliente." });
      }

      // Actualizar
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
          tax_id: taxId,
          commercial_address: clientData.commercial_address || null,
          dni_number: dni,
          passport_number: passport,
          birth_date: new Date(clientData.birth_date),
          nationality: clientData.nationality,
          gender: clientData.gender,
          email: clientData.email?.trim() || null,
          id_user: Number(clientData.id_user),
        },
      });

      return res.status(200).json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      return res.status(500).json({ error: "Error updating client" });
    }
  }

  // DELETE /api/clients/:id
  if (req.method === "DELETE") {
    try {
      await prisma.client.delete({ where: { id_client: clientId } });
      return res.status(200).json({ message: "Cliente eliminado con éxito" });
    } catch (error) {
      console.error("Error deleting client:", error);
      return res.status(500).json({ error: "Error deleting client" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
