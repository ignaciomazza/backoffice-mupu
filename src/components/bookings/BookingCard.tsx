// src/components/bookings/BookingCard.tsx
"use client";
import React from "react";
import { motion } from "framer-motion";
import { Booking } from "@/types";
import Link from "next/link";
import {
  ACTION_BUTTON,
  DANGER_BUTTON,
  ICON_BUTTON,
  getStatusChipClasses,
} from "./palette";

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
  const canManage =
    booking.status === "Abierta" ||
    role === "administrativo" ||
    role === "desarrollador" ||
    role === "gerente";

  const statusLabel = (value?: string) => {
    if (!value) return "—";
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const Field = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <p className="text-sm text-sky-950 dark:text-white">
      <span className="font-semibold text-sky-900/80 dark:text-sky-100/80">
        {label}
      </span>
      <span className="ml-2 font-medium">{value || "—"}</span>
    </p>
  );

  const statusChip = (label: string, value: string) => (
    <span key={label} className={getStatusChipClasses(value)}>
      {label}: {value}
    </span>
  );

  const badge = (() => {
    const base =
      "rounded-full p-2 shadow-md shadow-sky-900/20 dark:shadow-sky-950/40";
    if (booking.status === "Bloqueada") {
      return {
        cls: `${base} bg-amber-100/30 dark:bg-amber-500/15 text-amber-600 shadow-sm shadow-amber-900/20 dark:text-amber-200`,
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.7}
            stroke="currentColor"
            className="size-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        ),
      };
    }
    if (booking.status === "Cancelada") {
      return {
        cls: `${base} bg-rose-100/30 dark:bg-rose-500/15 text-rose-600 shadow-sm shadow-rose-900/20 dark:text-rose-200`,
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.7}
            stroke="currentColor"
            className="size-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        ),
      };
    }
    return {
      cls: `${base} bg-emerald-100/30 dark:bg-emerald-500/15 text-emerald-600 shadow-sm shadow-emerald-900/20 dark:text-emerald-200`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.7}
          stroke="currentColor"
          className="size-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      ),
    };
  })();

  const passengers = booking.clients || [];
  const departure = formatDate(booking.departure_date);
  const returnDate = formatDate(booking.return_date);
  const creationDate = formatDate(booking.creation_date);
  const paxCount = Math.max(1, booking.pax_count);
  const bookingNumber = booking.agency_booking_id ?? booking.id_booking;
  const toggleExpanded = () =>
    setExpandedBookingId((prevId) =>
      prevId === booking.id_booking ? null : booking.id_booking,
    );
  const actionBtn = `${ACTION_BUTTON} px-4 py-2 text-sm font-semibold`;
  const toggleBtn = `${ICON_BUTTON} p-2`;
  return (
    <motion.div
      layout
      layoutId={`booking-${booking.id_booking}`}
      className="h-fit space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/85 dark:text-sky-100/85">
            Reserva N°{bookingNumber}
          </p>
          <p className="mt-1 text-lg font-semibold text-sky-950 dark:text-white">
            {booking.details.toUpperCase() || "Sin detalle"}
          </p>
        </div>
        <div className={badge.cls}>{badge.icon}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusChip("Cliente", statusLabel(booking.clientStatus))}
        {statusChip("Operador", statusLabel(booking.operatorStatus))}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Field
          label="Vendedor"
          value={`${booking.user.first_name} ${booking.user.last_name}`}
        />
        <Field
          label="Titular"
          value={`${booking.titular.first_name} ${booking.titular.last_name}`}
        />
      </div>

      {isExpanded && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-sky-950/5 dark:border-white/10 dark:bg-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-sky-900/70 dark:text-sky-100/70">
              Duración del viaje
            </p>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <span>{departure}</span>
              <span className="text-[11px] font-bold tracking-[0.4em] text-sky-900/50 dark:text-sky-100/60">
                →
              </span>
              <span>{returnDate}</span>
            </div>
            <div className="flex w-full justify-end">
              <p className="mt-1 text-xs text-sky-900/70 dark:text-sky-100/70">
                Creada {creationDate}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-sky-900/85 dark:text-sky-100/85">
              {`Pasajeros (${paxCount} PAX)`}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sky-950 dark:text-white">
              <li>
                {booking.titular.first_name} {booking.titular.last_name}
              </li>
              {passengers.map((client) => (
                <li key={client.id_client}>
                  {client.first_name} {client.last_name}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Field
              label="Facturación"
              value={booking.invoice_type || "Sin datos"}
            />
            <Field
              label="Observación factura"
              value={booking.invoice_observation || "Sin observaciones"}
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-sky-900/85 dark:text-sky-100/85">
              Observaciones de administración
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-sky-950 dark:text-white">
              {booking.observation || "Sin observaciones"}
            </p>
          </div>

          <Link
            href={`/bookings/services/${booking.public_id ?? booking.id_booking}`}
            className={`${ACTION_BUTTON} mt-6 flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-semibold`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.4}
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
              />
            </svg>
            Ver reserva completa
          </Link>
        </div>
      )}

      <div>
        {isExpanded ? (
          <div className="flex w-full justify-between">
            <button onClick={toggleExpanded} className={`mt-4 ${toggleBtn}`}>
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
              {canManage && (
                <button
                  className={actionBtn}
                  onClick={() => startEditingBooking(booking)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </button>
              )}
              {canManage && (
                <button
                  className={`${DANGER_BUTTON} px-4 py-2 text-sm font-semibold`}
                  onClick={() => deleteBooking(booking.id_booking)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-5"
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
            <button onClick={toggleExpanded} className={`mt-4 ${toggleBtn}`}>
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
            <p className="text-sm font-medium text-sky-950/80 dark:text-sky-100/80">
              {formatDate(booking.creation_date)}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
