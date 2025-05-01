// src/services/pdf/generateReceiptPdf.ts
import fs from "fs";
import path from "path";
import type {
  Booking as PrismaBooking,
  Client as PrismaClientType,
  Agency as PrismaAgency,
  Service as PrismaService,
} from "@prisma/client";

const logoPath = path.join(process.cwd(), "public", "logo.png");
let logoBase64 = "";
if (fs.existsSync(logoPath)) {
  logoBase64 = fs.readFileSync(logoPath).toString("base64");
}

export type ReceiptBooking = Pick<
  PrismaBooking,
  "details" | "departure_date" | "return_date"
> & {
  titular: PrismaClientType;
  agency: PrismaAgency;
  services: PrismaService[];
};

export interface ReceiptHtmlData {
  receiptNumber: string;
  booking: ReceiptBooking;
  concept: string;
  amount: number;
  amountString: string;
  currency: string;
}

export default function generateReceiptHtml({
  receiptNumber,
  booking,
  concept,
  amount,
  amountString,
  currency,
}: ReceiptHtmlData): string {
  const fecha = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: sans-serif; font-size: 12px; margin: 20px; }
    .header { text-align: center; margin-bottom: 20px; }
    .section { margin-bottom: 12px; }
    .section p { margin: 2px 0; }
    .logo { margin-top: 30px; }
    .logo img { max-height: 50px; }
  </style>
</head>
<body>

  <div class="logo">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo"/>` : ""}
  </div>

  <div class="header">
    <h2>RECIBO N° ${receiptNumber}</h2>
    <p>${fecha}</p>
  </div>

  <div class="section">
    <p><strong>Recibimos el equivalente a:</strong></p>
    <p><strong>${amountString}</strong></p>
  </div>

  <div class="section">
    <p><strong>Moneda recibida:</strong></p>
    <p><strong>${currency}</strong></p>
  </div>

  <div class="section">
    <p><strong>En concepto de:</strong> ${concept}</p>
  </div>

  <hr/>

  <div class="section">
    <p><strong>Servicio:</strong> ${booking.details}</p>
    <p><strong>Salida:</strong> ${new Date(
      booking.departure_date,
    ).toLocaleDateString("es-AR")}</p>
    <p><strong>Regreso:</strong> ${new Date(
      booking.return_date,
    ).toLocaleDateString("es-AR")}</p>
  </div>

  <div class="section">
    <p><strong>Cliente:</strong> ${booking.titular.first_name} ${
      booking.titular.last_name
    } – DNI ${booking.titular.dni_number}</p>
    <p><strong>Domicilio:</strong> ${booking.titular.address}, ${
      booking.titular.locality
    }</p>
  </div>

  <div class="section">
    <p><strong>Agencia:</strong> ${booking.agency.name}</p>
    <p><strong>Razon social:</strong> ${booking.agency.legal_name}</p>
    <p><strong>Razon social:</strong> ${booking.agency.tax_id}</p>
    <p>${booking.agency.address}</p>
  </div>

  <hr/>

  <div class="section">
    <p><strong>Total:</strong>$ ${amount}</p>
  </div>

</body>
</html>
`;
}
