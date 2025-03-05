// src/pages/api/clients/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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

      // Verificar duplicados excluyendo el cliente que se está actualizando
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
          .json({ error: "Esa informacion ya pertenece a un cliente." });
      }

      const updatedClient = await prisma.client.update({
        where: { id_client: Number(id) },
        data: {
          first_name: client.first_name,
          last_name: client.last_name,
          phone: client.phone,
          address: client.address,
          postal_code: client.postal_code,
          locality: client.locality,
          company_name: client.company_name,
          tax_id: client.tax_id,
          commercial_address: client.commercial_address,
          dni_number: client.dni_number,
          passport_number: client.passport_number,
          dni_issue_date: client.dni_issue_date
            ? new Date(client.dni_issue_date)
            : null,
          dni_expiry_date: client.dni_expiry_date
            ? new Date(client.dni_expiry_date)
            : null,
          birth_date: client.birth_date ? new Date(client.birth_date) : null,
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
