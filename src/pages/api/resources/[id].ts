// src/pages/api/resources/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  const idResource = Array.isArray(id) ? id[0] : id;

  if (!idResource) {
    return res.status(400).json({ error: "ID de recurso es requerido." });
  }

  const idNum = Number(idResource);
  if (Number.isNaN(idNum)) {
    return res.status(400).json({ error: "ID de recurso inválido." });
  }

  try {
    if (req.method === "GET") {
      // Obtener un recurso
      const resource = await prisma.resources.findUnique({
        where: { id_resource: idNum },
      });
      if (!resource) {
        return res.status(404).json({ error: "Recurso no encontrado." });
      }
      return res.status(200).json(resource);
    }

    if (req.method === "PUT") {
      // Actualizar título y/o descripción
      const { title, description } = req.body;
      if (!title?.trim()) {
        return res.status(400).json({ error: "El título es obligatorio." });
      }

      const updated = await prisma.resources.update({
        where: { id_resource: idNum },
        data: {
          title,
          description: description?.trim() || null,
        },
      });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      // Eliminar recurso
      await prisma.resources.delete({
        where: { id_resource: idNum },
      });
      return res.status(200).json({ message: "Recurso eliminado con éxito." });
    }

    // Métodos no soportados
    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res
      .status(405)
      .end(`Método ${req.method} no permitido en este endpoint`);
  } catch (error) {
    console.error("Error en API /resources/[id]:", error);
    return res
      .status(500)
      .json({ error: "Error interno al procesar el recurso." });
  }
}
