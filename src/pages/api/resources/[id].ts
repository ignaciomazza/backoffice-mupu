// src/pages/api/resources/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { resolveAuth } from "@/lib/auth";

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
  const decoded =
    Number.isFinite(idNum) && idNum > 0 ? null : decodePublicId(idResource);
  if (decoded && decoded.t !== "resource") {
    return res.status(400).json({ error: "ID de recurso inválido." });
  }
  if (!decoded && (Number.isNaN(idNum) || idNum <= 0)) {
    return res.status(400).json({ error: "ID de recurso inválido." });
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (decoded && decoded.a !== auth.id_agency) {
    return res.status(404).json({ error: "Recurso no encontrado." });
  }

  try {
    if (req.method === "GET") {
      // Obtener un recurso
      const resource = await prisma.resources.findFirst({
        where: decoded
          ? { id_agency: auth.id_agency, agency_resource_id: decoded.i }
          : { id_resource: idNum, id_agency: auth.id_agency },
      });
      if (!resource) {
        return res.status(404).json({ error: "Recurso no encontrado." });
      }
      const public_id = encodePublicId({
        t: "resource",
        a: resource.id_agency,
        i: resource.agency_resource_id,
      });
      return res.status(200).json({ ...resource, public_id });
    }

    if (req.method === "PUT") {
      // Actualizar título y/o descripción
      const { title, description } = req.body;
      if (!title?.trim()) {
        return res.status(400).json({ error: "El título es obligatorio." });
      }

      const existing = await prisma.resources.findFirst({
        where: decoded
          ? { id_agency: auth.id_agency, agency_resource_id: decoded.i }
          : { id_resource: idNum, id_agency: auth.id_agency },
        select: { id_resource: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Recurso no encontrado." });
      }
      const updated = await prisma.resources.update({
        where: { id_resource: existing.id_resource },
        data: {
          title,
          description: description?.trim() || null,
        },
      });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      // Eliminar recurso
      const existing = await prisma.resources.findFirst({
        where: decoded
          ? { id_agency: auth.id_agency, agency_resource_id: decoded.i }
          : { id_resource: idNum, id_agency: auth.id_agency },
        select: { id_resource: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Recurso no encontrado." });
      }
      await prisma.resources.delete({
        where: { id_resource: existing.id_resource },
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
