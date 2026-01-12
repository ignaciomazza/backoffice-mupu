// src/utils/getCommercialInsights.ts
import type {
  CommercialInsightsResponse,
  InsightsMoneyPerCurrency,
  DestinationItem,
  ChannelItem,
  TopClientItem,
} from "@/types";

/**
 * Fila base que viene del fetch a Prisma.
 * Una fila = una reserva, con montos por moneda.
 */
export interface CommercialBaseRow {
  bookingId: number;
  sellerId: number;
  clientId: number | null;
  clientName: string | null;
  passengers: number;
  bookingDate: Date | null;
  departureDate: Date | null;
  destinationKey: string | null;
  countryCode: string | null;
  channel: string | null; // ya no lo usamos realmente
  /** Monto total de la reserva por moneda (ARS, USD, etc.) */
  amounts: InsightsMoneyPerCurrency;
  /** true si es reserva de cliente nuevo */
  isNewClient: boolean;
}

/* ==========================
 * Helpers numéricos
 * ========================== */

function addMoneyInto(
  target: InsightsMoneyPerCurrency,
  src?: InsightsMoneyPerCurrency,
) {
  if (!src) return;
  for (const [code, value] of Object.entries(src)) {
    if (!code) continue;
    const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
    target[code] = (target[code] ?? 0) + v;
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/* ==========================
 * Builder principal
 * ========================== */

export function buildCommercialInsights(
  rows: CommercialBaseRow[],
): CommercialInsightsResponse {
  // ---------- Summary global ----------
  const amountsPerCurrency: Record<string, number[]> = {};
  let totalPassengers = 0;
  let anticipationDaysSum = 0;
  let anticipationCount = 0;

  for (const row of rows) {
    totalPassengers += row.passengers || 0;

    for (const [code, amount] of Object.entries(row.amounts || {})) {
      if (!code) continue;
      const v =
        typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
      if (!amountsPerCurrency[code]) amountsPerCurrency[code] = [];
      amountsPerCurrency[code].push(v);
    }

    if (row.bookingDate && row.departureDate) {
      const diffMs = row.departureDate.getTime() - row.bookingDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (Number.isFinite(diffDays)) {
        anticipationDaysSum += diffDays;
        anticipationCount += 1;
      }
    }
  }

  const avgTicket: InsightsMoneyPerCurrency = {};
  const medianTicket: InsightsMoneyPerCurrency = {};

  for (const [code, list] of Object.entries(amountsPerCurrency)) {
    if (!list.length) continue;
    const sum = list.reduce((acc, v) => acc + v, 0);
    avgTicket[code] = sum / list.length;
    const med = median(list);
    if (med !== null) medianTicket[code] = med;
  }

  const avgAnticipationDays =
    anticipationCount > 0 ? anticipationDaysSum / anticipationCount : null;

  // ---------- Destinos ----------
  const destMap = new Map<
    string,
    DestinationItem & { totalAmount: InsightsMoneyPerCurrency }
  >();

  for (const row of rows) {
    const key = `${row.destinationKey ?? "SIN_DESTINO"}|${row.countryCode ?? ""}`;
    let agg = destMap.get(key);
    if (!agg) {
      agg = {
        destinationKey: row.destinationKey ?? "Sin destino",
        countryCode: row.countryCode ?? null,
        reservations: 0,
        passengers: 0,
        totalAmount: {},
        avgTicket: {},
      };
      destMap.set(key, agg);
    }
    agg.reservations += 1;
    agg.passengers += row.passengers || 0;
    addMoneyInto(agg.totalAmount, row.amounts);
  }

  const topDestinations: DestinationItem[] = Array.from(destMap.values())
    .map((item) => {
      const avgTicketPerCurrency: InsightsMoneyPerCurrency = {};
      for (const [code, total] of Object.entries(item.totalAmount)) {
        avgTicketPerCurrency[code] =
          item.reservations > 0 ? total / item.reservations : 0;
      }
      return {
        destinationKey: item.destinationKey,
        countryCode: item.countryCode,
        reservations: item.reservations,
        passengers: item.passengers,
        totalAmount: item.totalAmount,
        avgTicket: avgTicketPerCurrency,
      };
    })
    // orden por reservas desc
    .sort((a, b) => b.reservations - a.reservations);

  // ---------- Periodos (mes / año) ----------
  // Reutilizamos ChannelItem pero el campo `channel` va a ser "MM/AAAA"
  const periodMap = new Map<
    string,
    {
      label: string;
      sortValue: number;
      reservations: number;
      passengers: number;
      totalAmount: InsightsMoneyPerCurrency;
    }
  >();

  for (const row of rows) {
    const baseDate = row.departureDate ?? row.bookingDate;
    let key = "SIN_FECHA";
    let label = "Sin fecha";
    let sortValue = 0;

    if (baseDate) {
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth() + 1; // 1-12
      key = `${year}-${month.toString().padStart(2, "0")}`;
      label = `${month.toString().padStart(2, "0")}/${year}`;
      sortValue = year * 100 + month;
    }

    let agg = periodMap.get(key);
    if (!agg) {
      agg = {
        label,
        sortValue,
        reservations: 0,
        passengers: 0,
        totalAmount: {},
      };
      periodMap.set(key, agg);
    }

    agg.reservations += 1;
    agg.passengers += row.passengers || 0;
    addMoneyInto(agg.totalAmount, row.amounts);
  }

  const byOrigin: ChannelItem[] = Array.from(periodMap.values())
    .sort((a, b) => a.sortValue - b.sortValue)
    .map((item) => {
      const avgTicketPerCurrency: InsightsMoneyPerCurrency = {};
      for (const [code, total] of Object.entries(item.totalAmount)) {
        avgTicketPerCurrency[code] =
          item.reservations > 0 ? total / item.reservations : 0;
      }
      return {
        channel: item.label, // "MM/AAAA"
        reservations: item.reservations,
        passengers: item.passengers,
        avgTicket: avgTicketPerCurrency,
      };
    });

  // ---------- Clientes ----------
  type ClientAgg = {
    id_client: number | null;
    name: string;
    reservations: number;
    passengers: number;
    totalAmount: InsightsMoneyPerCurrency;
    lastBookingDate: Date | null;
  };

  const clientMap = new Map<string, ClientAgg>();

  // Para bloques de "nuevos vs recurrentes"
  const newClientsTotals = {
    reservations: 0,
    passengers: 0,
    totalAmount: {} as InsightsMoneyPerCurrency,
  };
  const returningClientsTotals = {
    reservations: 0,
    passengers: 0,
    totalAmount: {} as InsightsMoneyPerCurrency,
  };

  for (const row of rows) {
    const key = row.clientId != null ? String(row.clientId) : "null";
    let agg = clientMap.get(key);
    if (!agg) {
      agg = {
        id_client: row.clientId,
        name:
          row.clientName ??
          (row.clientId != null ? `Cliente N° ${row.clientId}` : "Sin cliente"),
        reservations: 0,
        passengers: 0,
        totalAmount: {},
        lastBookingDate: null,
      };
      clientMap.set(key, agg);
    }

    agg.reservations += 1;
    agg.passengers += row.passengers || 0;
    addMoneyInto(agg.totalAmount, row.amounts);

    if (row.bookingDate) {
      if (!agg.lastBookingDate || row.bookingDate > agg.lastBookingDate) {
        agg.lastBookingDate = row.bookingDate;
      }
    }

    // Nuevos vs recurrentes
    const block = row.isNewClient ? newClientsTotals : returningClientsTotals;
    block.reservations += 1;
    block.passengers += row.passengers || 0;
    addMoneyInto(block.totalAmount, row.amounts);
  }

  const topClients: TopClientItem[] = Array.from(clientMap.values())
    .map((c) => ({
      id_client: c.id_client,
      name: c.name,
      reservations: c.reservations,
      passengers: c.passengers,
      totalAmount: c.totalAmount,
      lastBookingDate: c.lastBookingDate
        ? c.lastBookingDate.toISOString()
        : null,
    }))
    // ordenamos por cantidad de reservas desc
    .sort((a, b) => b.reservations - a.reservations);

  // avgTicket para bloques de nuevos / recurrentes
  const newAvgTicket: InsightsMoneyPerCurrency = {};
  for (const [code, total] of Object.entries(newClientsTotals.totalAmount)) {
    newAvgTicket[code] =
      newClientsTotals.reservations > 0
        ? total / newClientsTotals.reservations
        : 0;
  }

  const returningAvgTicket: InsightsMoneyPerCurrency = {};
  for (const [code, total] of Object.entries(
    returningClientsTotals.totalAmount,
  )) {
    returningAvgTicket[code] =
      returningClientsTotals.reservations > 0
        ? total / returningClientsTotals.reservations
        : 0;
  }

  // ---------- Armamos respuesta final ----------
  const response: CommercialInsightsResponse = {
    summary: {
      reservations: rows.length,
      passengers: totalPassengers,
      avgTicket,
      medianTicket,
      avgAnticipationDays,
    },
    destinations: {
      topDestinations,
    },
    channels: {
      byOrigin, // ahora representa periodos (meses)
    },
    clients: {
      newVsReturning: {
        newClients: {
          reservations: newClientsTotals.reservations,
          passengers: newClientsTotals.passengers,
          totalAmount: newClientsTotals.totalAmount,
          avgTicket: newAvgTicket,
        },
        returningClients: {
          reservations: returningClientsTotals.reservations,
          passengers: returningClientsTotals.passengers,
          totalAmount: returningClientsTotals.totalAmount,
          avgTicket: returningAvgTicket,
        },
      },
      topClients,
    },
  };

  return response;
}
