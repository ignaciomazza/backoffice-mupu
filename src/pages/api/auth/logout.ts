// src/pages/api/auth/logout.ts
import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const isProd = process.env.NODE_ENV === "production";
  const domain = process.env.AUTH_COOKIE_DOMAIN || ".ofistur.com";

  const parts = [
    "token=",
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0", // elimina inmediatamente
  ];
  if (isProd) {
    parts.push("Secure");
    if (domain) parts.push(`Domain=${domain}`);
  }

  res.setHeader("Set-Cookie", parts.join("; "));
  return res.status(200).json({ message: "Logout successful" });
}
