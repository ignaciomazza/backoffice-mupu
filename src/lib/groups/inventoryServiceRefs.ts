import { normalizeCurrencyCode, toAmountNumber } from "@/lib/groups/financeShared";

export const GROUP_CONTEXT_BOOKING_BASE = 700_000_000;
export const GROUP_INVENTORY_SERVICE_BASE = 900_000_000;

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function buildSyntheticContextBookingId(args: {
  groupId: number;
  departureId?: number | null;
  passengerId?: number | null;
}): number {
  const groupPart =
    Number.isFinite(args.groupId) && args.groupId > 0 ? Math.trunc(args.groupId) : 0;
  const departurePart =
    typeof args.departureId === "number" && Number.isFinite(args.departureId) && args.departureId > 0
      ? Math.trunc(args.departureId)
      : 0;
  const passengerPart =
    typeof args.passengerId === "number" && Number.isFinite(args.passengerId) && args.passengerId > 0
      ? 1
      : 0;
  return GROUP_CONTEXT_BOOKING_BASE + groupPart * 100_000 + departurePart * 10 + passengerPart;
}

export function isSyntheticContextBookingId(value: number): boolean {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized >= GROUP_CONTEXT_BOOKING_BASE;
}

export function encodeInventoryServiceId(inventoryId: number): number {
  const normalized = Math.trunc(Number(inventoryId));
  if (!Number.isFinite(normalized) || normalized <= 0) return GROUP_INVENTORY_SERVICE_BASE;
  return GROUP_INVENTORY_SERVICE_BASE + normalized;
}

export function decodeInventoryServiceId(serviceId: number): number | null {
  const normalized = Math.trunc(Number(serviceId));
  if (!Number.isFinite(normalized) || normalized <= GROUP_INVENTORY_SERVICE_BASE) {
    return null;
  }
  const inventoryId = normalized - GROUP_INVENTORY_SERVICE_BASE;
  return inventoryId > 0 ? inventoryId : null;
}

export type InventoryContextServiceRow = {
  id_travel_group_inventory: number;
  agency_travel_group_inventory_id: number | null;
  travel_group_departure_id: number | null;
  inventory_type: string;
  service_type: string | null;
  label: string;
  provider: string | null;
  locator: string | null;
  currency: string | null;
  unit_cost: unknown;
  note: string | null;
  travelGroupDeparture?: {
    name: string | null;
    departure_date: Date | string | null;
    return_date: Date | string | null;
  } | null;
};

export function mapInventoryToServiceLike(
  row: InventoryContextServiceRow,
  args: {
    bookingId: number;
    fallbackCurrency?: string | null;
    fallbackDestination?: string | null;
  },
): Record<string, unknown> {
  const id = encodeInventoryServiceId(row.id_travel_group_inventory);
  const currency = normalizeCurrencyCode(row.currency || args.fallbackCurrency || "ARS");
  const salePrice = toAmountNumber(row.unit_cost);
  const type = String(row.service_type || row.inventory_type || "GRUPAL").trim() || "GRUPAL";
  const description = String(row.label || "").trim() || `Servicio grupal ${id}`;
  const departureDateIso = toIso(row.travelGroupDeparture?.departure_date);
  const returnDateIso = toIso(row.travelGroupDeparture?.return_date ?? row.travelGroupDeparture?.departure_date);
  const destination =
    String(row.travelGroupDeparture?.name || args.fallbackDestination || "").trim() ||
    "Salida grupal";
  const reference =
    String(row.locator || row.provider || `GRP-INV-${row.id_travel_group_inventory}`).trim();

  return {
    id_service: id,
    agency_service_id: row.agency_travel_group_inventory_id,
    type,
    description,
    note: row.note,
    sale_price: salePrice,
    cost_price: salePrice,
    destination,
    reference,
    tax_21: 0,
    tax_105: 0,
    exempt: 0,
    other_taxes: 0,
    card_interest: 0,
    taxableCardInterest: 0,
    vatOnCardInterest: 0,
    currency,
    departure_date: departureDateIso,
    return_date: returnDateIso,
    booking_id: args.bookingId,
    id_operator: 0,
    created_at: new Date().toISOString(),
  };
}

