// src/pages/api/agency/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    try {
      const agency = await prisma.agency.findFirst(); // Obtener la primera agencia
      res.status(200).json(agency);
    } catch (error) {
      console.error("Error al obtener la agencia:", error);
      res.status(500).json({ error: "Error al obtener la agencia" });
    }
  } else if (req.method === "POST") {
    const {
      name,
      address,
      phone,
      email,
      tax_id,
      website,
      foundation_date,
      logo_url,
    } = req.body;

    try {
      const newAgency = await prisma.agency.create({
        data: {
          name,
          address,
          phone,
          email,
          tax_id,
          website,
          foundation_date: foundation_date
            ? new Date(foundation_date)
            : undefined,
          logo_url,
        },
      });
      res.status(201).json(newAgency);
    } catch (error) {
      console.error("Error al crear la agencia:", error);
      res.status(500).json({ error: "Error al crear la agencia" });
    }
  } else if (req.method === "PUT") {
    const {
      name,
      address,
      phone,
      email,
      tax_id,
      website,
      foundation_date,
      logo_url,
    } = req.body;

    try {
      const existingAgency = await prisma.agency.findFirst();
      if (!existingAgency) {
        return res
          .status(404)
          .json({ error: "No se encontró ninguna agencia para actualizar" });
      }

      const updatedAgency = await prisma.agency.update({
        where: { id_agency: existingAgency.id_agency },
        data: {
          name,
          address,
          phone,
          email,
          tax_id,
          website,
          foundation_date: foundation_date
            ? new Date(foundation_date)
            : undefined,
          logo_url,
        },
      });
      res.status(200).json(updatedAgency);
    } catch (error) {
      console.error("Error al actualizar la agencia:", error);
      res.status(500).json({ error: "Error al actualizar la agencia" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}
