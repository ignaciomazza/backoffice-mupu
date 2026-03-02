import { describe, expect, it } from "vitest";
import {
  rankBookingsBySimilarity,
  type SearchableBooking,
} from "@/utils/bookingSearch";

const bookings: SearchableBooking[] = [
  {
    id_booking: 101,
    agency_booking_id: 5001,
    details: "Paquete Europa primavera",
    titular: {
      id_client: 1,
      first_name: "Juan",
      last_name: "Pérez",
      company_name: "",
    },
    clients: [{ id_client: 2, first_name: "María", last_name: "Gómez" }],
    simple_companions: [{ notes: "Acompañante con celiaquía", age: 12 }],
  },
  {
    id_booking: 102,
    agency_booking_id: 5002,
    details: "Escapada a Mendoza",
    titular: {
      id_client: 3,
      first_name: "Ana",
      last_name: "Nuñez",
      company_name: "",
    },
    clients: [{ id_client: 4, first_name: "Pedro", last_name: "López" }],
    simple_companions: [{ notes: "Silla de ruedas", age: 67 }],
  },
];

describe("bookingSearch", () => {
  it("encuentra por nombre/apellido en cualquier orden y con tildes", () => {
    const ranked = rankBookingsBySimilarity(bookings, "perez juan");
    expect(ranked[0]?.id_booking).toBe(101);

    const rankedWithTildes = rankBookingsBySimilarity(bookings, "pérez, juán");
    expect(rankedWithTildes[0]?.id_booking).toBe(101);
  });

  it("tolera typo de una letra", () => {
    const ranked = rankBookingsBySimilarity(bookings, "juqn perez");
    expect(ranked[0]?.id_booking).toBe(101);
  });

  it("encuentra por acompañantes y por detalle", () => {
    const byCompanion = rankBookingsBySimilarity(bookings, "celiaquia");
    expect(byCompanion[0]?.id_booking).toBe(101);

    const byDetail = rankBookingsBySimilarity(bookings, "mendoza");
    expect(byDetail[0]?.id_booking).toBe(102);
  });

  it("encuentra por número de reserva de agencia", () => {
    const ranked = rankBookingsBySimilarity(bookings, "5002");
    expect(ranked[0]?.id_booking).toBe(102);
  });
});
