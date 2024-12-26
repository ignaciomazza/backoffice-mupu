// src/pages/api/clients/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    try {
      const clients = await prisma.client.findMany();
      res.status(200).json(clients);
    } catch (error) {
      res.status(500).json({ error: "Error fetching clients" });
    }
  } else if (req.method === "POST") {
    try {
      const client = req.body;

      const newClient = await prisma.client.create({
        data: {
          first_name: client.first_name,
          last_name: client.last_name,
          phone: client.phone,
          address: client.address,
          postal_code: client.postal_code,
          locality: client.locality,
          iva_condition: client.iva_condition,
          billing_preference: client.billing_preference,
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

      res.status(201).json(newClient);
    } catch (error) {
      console.error("Error processing clients:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
