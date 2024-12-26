// drc/pages/api/operators/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      await prisma.operator.delete({
        where: { id_operator: Number(id) },
      });
      res.status(200).json({ message: "Operator successfully deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete operator" });
    }
  } else if (req.method === "PUT") {
    const {
      name,
      email,
      phone,
      website,
      address,
      postal_code,
      city,
      state,
      country,
      vat_status,
      legal_name,
      tax_id,
    } = req.body;

    try {
      const updatedOperator = await prisma.operator.update({
        where: { id_operator: Number(id) },
        data: {
          name,
          email,
          phone,
          website,
          address,
          postal_code,
          city,
          state,
          country,
          vat_status,
          legal_name,
          tax_id,
        },
      });
      res.status(200).json(updatedOperator);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update operator" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
