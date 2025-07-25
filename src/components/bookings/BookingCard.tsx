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
  role?: string;
}

export default function BookingCard({
  booking,
  expandedBookingId,
  setExpandedBookingId,
  formatDate,
  startEditingBooking,
  deleteBooking,
  role,
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
      className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div className="flex items-center justify-end gap-2">
        <p className="font-light text-gray-500 dark:text-gray-400">
          N° {booking.id_booking}
        </p>
        {booking.status === "Bloqueada" ? (
          <div className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white dark:backdrop-blur">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.7}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
        ) : booking.status === "Cancelada" ? (
          <div className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white dark:backdrop-blur">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.7}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
        ) : (
          <div className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white dark:backdrop-blur">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.7}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
        )}
      </div>
      <p className="font-semibold dark:font-medium">
        Detalle
        <span className="ml-2 font-light">{booking.details || "N/A"}</span>
      </p>

      <p className="font-semibold dark:font-medium">
        Estado Cliente
        <span className="ml-2 font-light">
          {booking.clientStatus.charAt(0).toUpperCase() +
            booking.clientStatus.slice(1).toLowerCase() || "-"}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Estado Operador
        <span className="ml-2 font-light">
          {booking.operatorStatus.charAt(0).toUpperCase() +
            booking.operatorStatus.slice(1).toLowerCase() || "-"}
        </span>
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
          {booking.titular.first_name.charAt(0).toUpperCase() +
            booking.titular.first_name.slice(1).toLowerCase()}{" "}
          {booking.titular.last_name.charAt(0).toUpperCase() +
            booking.titular.last_name.slice(1).toLowerCase()}
        </span>
      </p>
      {isExpanded && (
        <div>
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
              {booking.titular.first_name.charAt(0).toUpperCase() +
                booking.titular.first_name.slice(1).toLowerCase()}{" "}
              {booking.titular.last_name.charAt(0).toUpperCase() +
                booking.titular.last_name.slice(1).toLowerCase()}
            </li>
            {booking.clients.map((client) => (
              <li key={client.id_client}>
                {client.first_name.charAt(0).toUpperCase() +
                  client.first_name.slice(1).toLowerCase()}{" "}
                {client.last_name.charAt(0).toUpperCase() +
                  client.last_name.slice(1).toLowerCase()}
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
            Fecha de Creacion
            <span className="ml-2 font-light">
              {formatDate(booking.creation_date)}
            </span>
          </p>
          <p className="mt-4 font-semibold dark:font-medium">
            Observaciones de administracion
          </p>
          <p className="font-light">
            {booking.observation || "Sin observaciones"}
          </p>
          <Link
            href={`/bookings/services/${booking.id_booking}`}
            className="mt-6 flex w-full gap-1 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.4}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
              />
            </svg>
            Reserva
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
              className="mt-4 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
              {(booking.status === "Abierta" ||
                role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <button
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                  onClick={() => handleEdit(booking)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </button>
              )}
              {(booking.status === "Abierta" ||
                role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <button
                  className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                  onClick={() => deleteBooking(booking.id_booking)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-full items-end justify-between">
            <button
              onClick={() =>
                setExpandedBookingId((prevId) =>
                  prevId === booking.id_booking ? null : booking.id_booking,
                )
              }
              className="mt-4 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
            <p className="text-sm font-light">
              {formatDate(booking.creation_date)}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
