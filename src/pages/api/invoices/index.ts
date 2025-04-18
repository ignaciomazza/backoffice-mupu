// src/pages/api/invoices/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { createVoucherService } from "@/services/afip/createVoucherService";

// Interfaz para el body de la solicitud de creación de factura.
interface InvoiceRequestBody {
  bookingId: number | string;
  services: number[];
  clientIds: (number | string)[];
  tipoFactura: number;
  exchangeRate?: number; // Cotización manual (opcional)
}

// Interfaz para los detalles del voucher que devuelve AFIP.
interface VoucherDetails {
  CbteDesde: number;
  // Puedes extender con otros campos según lo requieras.
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Soporte para GET: obtener facturas por bookingId.
  if (req.method === "GET") {
    const { bookingId } = req.query;
    if (!bookingId) {
      return res
        .status(400)
        .json({ success: false, message: "Falta bookingId en la consulta." });
    }
    const invoices = await prisma.invoice.findMany({
      where: { bookingId_booking: Number(bookingId) },
    });
    return res.status(200).json({ success: true, invoices });
  }

  // Soporte para POST: crear facturas.
  if (req.method === "POST") {
    console.info("[Invoices API] Iniciando proceso de facturación...");

    const { bookingId, services, clientIds, tipoFactura, exchangeRate } =
      req.body as InvoiceRequestBody;

    if (!bookingId || !services || !clientIds || clientIds.length === 0) {
      console.error("[Invoices API] Faltan datos requeridos:", req.body);
      return res
        .status(400)
        .json({ success: false, message: "Faltan datos requeridos." });
    }

    // 1. Obtener detalles de los servicios asociados
    const serviceDetails = await prisma.service.findMany({
      where: { id_service: { in: services } },
    });
    console.info(
      "[Invoices API] Detalles de servicios obtenidos:",
      serviceDetails,
    );

    // 2. Agrupar servicios por moneda y sumar sus importes y la propiedad impIVA
    type GroupInfo = {
      services: typeof serviceDetails;
      totalSale: number;
      totalImpIVA: number;
    };

    const groupedServices = serviceDetails.reduce(
      (acc, service) => {
        // Se usa el campo currency en mayúsculas.
        const moneda = service.currency.toUpperCase();
        if (!acc[moneda]) {
          acc[moneda] = {
            services: [],
            totalSale: 0,
            totalImpIVA: 0,
          };
        }
        acc[moneda].services.push(service);
        acc[moneda].totalSale += service.sale_price;
        // Se suma el valor de impIVA. Si no está definido, se asume 0.
        acc[moneda].totalImpIVA += service.impIVA ? service.impIVA : 0;
        return acc;
      },
      {} as Record<string, GroupInfo>,
    );

    console.info(
      "[Invoices API] Servicios agrupados por moneda:",
      groupedServices,
    );

    const invoicesResult: unknown[] = [];

    // Función de mapeo de moneda para AFIP
    const mapCurrency = (moneda: string) => {
      if (moneda === "ARS") return "PES";
      if (moneda === "USD") return "DOL";
      return moneda;
    };

    // 3. Procesar cada grupo de servicios por moneda
    for (const moneda in groupedServices) {
      const { totalSale, totalImpIVA } = groupedServices[moneda];
    
      // Calcular el importe y el impIVA por cliente en función de la cantidad de clientes.
      const perClientAmount = parseFloat(
        (totalSale / clientIds.length).toFixed(2),
      );
      const perClientImpIVA = parseFloat(
        (totalImpIVA / clientIds.length).toFixed(2),
      );

      const afipCurrency = mapCurrency(moneda);
      console.info(
        `[Invoices API] Procesando facturas para moneda ${moneda}. Importe total: ${totalSale}, ImpIVA total: ${totalImpIVA}, Importe por cliente: ${perClientAmount}, ImpIVA por cliente: ${perClientImpIVA}`,
      );

      // 4. Procesar factura para cada cliente del grupo
      for (const clientId of clientIds) {
        console.info(
          `[Invoices API] Procesando factura para cliente ${clientId} en ${moneda}...`,
        );

        // Obtener datos del cliente.
        const client = await prisma.client.findUnique({
          where: { id_client: Number(clientId) },
        });
        if (!client) {
          console.warn(
            `[Invoices API] Cliente ${clientId} no encontrado. Se omitirá la factura para este cliente.`,
          );
          continue;
        }
        const taxId = client.tax_id ? client.tax_id.toString() : "";
        if (!taxId) {
          console.warn(
            `[Invoices API] Cliente ${clientId} no tiene un CUIT válido.`,
          );
          continue;
        }

        console.info(
          `[Invoices API] Llamando a createVoucherService para cliente ${clientId}...`,
        );
        // 5. Llamada al servicio AFIP pasándole perClientImpIVA en lugar de recalcular el IVA.
        const voucherResponse = await createVoucherService(
          tipoFactura,
          taxId,
          perClientAmount,
          afipCurrency,
          perClientImpIVA, // Se pasa el valor calculado externamente
          exchangeRate,
        );
        if (!voucherResponse.success) {
          console.warn(
            `[Invoices API] AFIP rechazó la factura para cliente ${clientId} en ${moneda}.`,
          );
          continue;
        }
        console.info(
          `[Invoices API] Voucher generado para cliente ${clientId}:`,
          voucherResponse.details,
        );

        // Se extraen los detalles del voucher (por ejemplo, CbteDesde)
        const voucherDetails = voucherResponse.details as
          | VoucherDetails
          | undefined;

        // 6. Insertar la factura en la base de datos.
        const newInvoice = await prisma.invoice.create({
          data: {
            invoice_number: voucherDetails
              ? voucherDetails.CbteDesde.toString()
              : "N/A",
            issue_date: new Date(),
            total_amount: perClientAmount,
            currency: afipCurrency,
            status: "Autorizada",
            type: tipoFactura === 1 ? "Factura A" : "Factura B",
            recipient:
              client.company_name || `${client.first_name} ${client.last_name}`,
            details: null,
            facturaHtml: voucherResponse.facturaHtml,
            bookingId_booking: Number(bookingId),
            client_id: Number(clientId),
          },
        });
        console.info(
          `[Invoices API] Factura guardada en BD para cliente ${clientId}:`,
          newInvoice,
        );
        invoicesResult.push(newInvoice);
      }
    }

    if (invoicesResult.length === 0) {
      console.error("[Invoices API] No se pudo generar ninguna factura.");
      return res.status(400).json({
        success: false,
        message: "No se pudo generar ninguna factura.",
      });
    }

    console.info("[Invoices API] Facturación completada. Facturas creadas:");
    return res.status(201).json({ success: true, invoices: invoicesResult });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
