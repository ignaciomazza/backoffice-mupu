// drc/pages/api/operators/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const operators = await prisma.operator.findMany();
      res.status(200).json(operators);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operators" });
    }
  } else if (req.method === "POST") {
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
      const newOperator = await prisma.operator.create({
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
      res.status(201).json(newOperator);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create operator" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
