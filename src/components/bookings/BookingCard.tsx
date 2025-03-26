// src/components/bookings/BookingCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Booking } from "@/types";
import Link from "next/link";

interface BookingCardProps {
  booking: Booking;
  expandedBookingId: number | null;
  setExpandedBookingId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingBooking: (booking: Booking) => void;
  deleteBooking: (id: number) => void;
}

export default function BookingCard({
  booking,
  expandedBookingId,
  setExpandedBookingId,
  formatDate,
  startEditingBooking,
  deleteBooking,
}: BookingCardProps) {
  const isExpanded = expandedBookingId === booking.id_booking;

  const handleEdit = (booking: Booking) => {
    startEditingBooking(booking);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <motion.div
      layout
      layoutId={`booking-${booking.id_booking}`}
      className="h-fit space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      <p className="text-end text-xl font-light">{booking.id_booking}</p>
      <p className="font-semibold dark:font-medium">
        Detalle
        <span className="ml-2 font-light">{booking.details || "N/A"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Estado
        <span className="ml-2 font-light">{booking.status || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Vendedor
        <span className="ml-2 font-light">
          {booking.user.first_name} {booking.user.last_name}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Titular
        <span className="ml-2 font-light">
          {booking.titular.first_name} {booking.titular.last_name}
        </span>
      </p>
      {isExpanded && (
        <div>
          <p className="font-semibold dark:font-medium">
            Agencia
            <span className="ml-2 font-light">
              {booking.agency.name || "N/A"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Salida
            <span className="ml-2 font-light">
              {formatDate(booking.departure_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Regreso
            <span className="ml-2 font-light">
              {formatDate(booking.return_date)}
            </span>
          </p>
          <p className="mt-4 font-semibold dark:font-medium">{`Pasajeros ( ${booking.pax_count} )`}</p>
          <ul className="ml-4 list-disc">
            <li>
              {booking.titular.first_name} {booking.titular.last_name}
            </li>
            {booking.clients.map((client) => (
              <li key={client.id_client}>
                {client.first_name} {client.last_name}
              </li>
            ))}
          </ul>
          <p className="mt-4 font-semibold dark:font-medium">Facturacion</p>
          <ul className="ml-4 list-disc">
            <li>
              <p className="font-light">
                {booking.invoice_type || "Sin observaciones"}
              </p>
            </li>
            <li>
              <p className="font-light">
                {`${booking.invoice_observation}` || "Sin observaciones"}
              </p>
            </li>
          </ul>
          <p className="mt-4 font-semibold dark:font-medium">
            Observaciones de administracion
          </p>
          <p className="font-light">
            {booking.observation || "Sin observaciones"}
          </p>
          <Link
            href={`/bookings/services/${booking.id_booking}`}
            className="mt-6 block w-fit rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            Servicios
          </Link>
        </div>
      )}
      <div>
        {isExpanded ? (
          <div className="flex w-full justify-between">
            <button
              onClick={() =>
                setExpandedBookingId((prevId) =>
                  prevId === booking.id_booking ? null : booking.id_booking,
                )
              }
              className="mt-4 rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
              </svg>
            </button>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
                onClick={() => handleEdit(booking)}
              >
                Editar
              </button>
              <button
                className="rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                onClick={() => deleteBooking(booking.id_booking)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              setExpandedBookingId((prevId) =>
                prevId === booking.id_booking ? null : booking.id_booking,
              )
            }
            className="mt-4 flex items-center justify-center rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
