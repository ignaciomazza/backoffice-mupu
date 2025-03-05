// src/pages/api/auth/logout.ts

import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Se elimina la cookie estableciendo un Max-Age de 0
  res.setHeader(
    "Set-Cookie",
    `token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure=${
      process.env.NODE_ENV === "production"
    }`,
  );

  return res.status(200).json({ message: "Logout successful" });
}
