import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      await prisma.booking.delete({ where: { id_booking: Number(id) } });
      res.status(200).json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Error deleting booking" });
    }
  } else if (req.method === "PUT") {
    const { status, details, titular_id, id_user, id_agency, id_operator } = req.body;
    try {
      const booking = await prisma.booking.update({
        where: { id_booking: Number(id) },
        data: { status, details, titular_id, id_user, id_agency, id_operator },
      });
      res.status(200).json(booking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Error updating booking" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
