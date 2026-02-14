-- Align Travel Group unique index names with Prisma-generated convention.
ALTER INDEX IF EXISTS "agency_travel_group_id_unique"
  RENAME TO "TravelGroup_id_agency_agency_travel_group_id_key";

ALTER INDEX IF EXISTS "agency_travel_group_departure_id_unique"
  RENAME TO "TravelGroupDeparture_id_agency_agency_travel_group_departur_key";

ALTER INDEX IF EXISTS "agency_travel_group_inventory_id_unique"
  RENAME TO "TravelGroupInventory_id_agency_agency_travel_group_inventor_key";

ALTER INDEX IF EXISTS "agency_travel_group_passenger_id_unique"
  RENAME TO "TravelGroupPassenger_id_agency_agency_travel_group_passenge_key";

ALTER INDEX IF EXISTS "agency_travel_group_payment_template_id_unique"
  RENAME TO "TravelGroupPaymentTemplate_id_agency_agency_travel_group_pa_key";
