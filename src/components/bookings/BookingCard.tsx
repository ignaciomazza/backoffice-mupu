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
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white h-fit"
    >
      <p className="text-xl font-light text-end">{booking.id_booking}</p>
      <p className="font-semibold dark:font-medium">
        Detalle
        <span className="font-light ml-2">{booking.details || "N/A"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Estado
        <span className="font-light ml-2">{booking.status || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Vendedor
        <span className="font-light ml-2">
          {booking.user.first_name} {booking.user.last_name}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Titular
        <span className="font-light ml-2">
          {booking.titular.first_name} {booking.titular.last_name}
        </span>
      </p>
      {isExpanded && (
        <div>
          <p className="font-semibold dark:font-medium">
            Agencia
            <span className="font-light ml-2">
              {booking.agency.name || "N/A"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Salida
            <span className="font-light ml-2">
              {formatDate(booking.departure_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Regreso
            <span className="font-light ml-2">
              {formatDate(booking.return_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Pasajeros
            <span className="font-light ml-2">{booking.pax_count}</span>
          </p>

          <p className="font-semibold dark:font-medium mt-4">Pasajeros</p>
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
          <p className="font-semibold dark:font-medium mt-4">Observaciones</p>
          <p className="font-light">
            {booking.observation || "Sin observaciones"}
          </p>
          <div className="pt-6">
            <Link
              className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
              href={`/bookings/services/${booking.id_booking}`}
            >
              Servicios
            </Link>
          </div>
        </div>
      )}
      <div>
        {isExpanded ? (
          <div className="flex justify-between w-full">
            <button
              onClick={() =>
                setExpandedBookingId((prevId) =>
                  prevId === booking.id_booking ? null : booking.id_booking
                )
              }
              className="p-2 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
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
            <div className="flex gap-2 mt-4">
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
                onClick={() => handleEdit(booking)}
              >
                Editar
              </button>
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-red-600 text-white dark:bg-red-800"
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
                prevId === booking.id_booking ? null : booking.id_booking
              )
            }
            className="p-2 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
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
