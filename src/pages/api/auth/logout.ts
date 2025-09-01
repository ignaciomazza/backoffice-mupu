// src/pages/api/auth/logout.ts
import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const parts = ["token=;", "HttpOnly", "Path=/", "Max-Age=0", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure"); // <-- flag, sin "=true"

  res.setHeader("Set-Cookie", parts.join("; "));
  return res.status(200).json({ message: "Logout successful" });
}
