// src/components/bookings/BookingList.tsx
"use client";
import React from "react";
import Link from "next/link";
import BookingCard from "./BookingCard";
import { Booking } from "@/types";

export type BookingViewMode = "grid" | "list";

interface BookingListProps {
  bookings: Booking[];
  expandedBookingId: number | null;
  setExpandedBookingId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingBooking: (booking: Booking) => void;
  deleteBooking: (id: number) => void;
  role?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  viewMode?: BookingViewMode;
}

export default function BookingList({
  bookings,
  expandedBookingId,
  setExpandedBookingId,
  startEditingBooking,
  deleteBooking,
  role,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  viewMode = "grid",
}: BookingListProps) {
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { timeZone: "UTC" });
  };

  const content =
    viewMode === "list" ? (
      <div className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <BookingListRow
            key={`row-${booking.id_booking}`}
            booking={booking}
            expandedBookingId={expandedBookingId}
            setExpandedBookingId={setExpandedBookingId}
            formatDate={formatDate}
            startEditingBooking={startEditingBooking}
            deleteBooking={deleteBooking}
            role={role}
          />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id_booking}
            booking={booking}
            expandedBookingId={expandedBookingId}
            setExpandedBookingId={setExpandedBookingId}
            formatDate={formatDate}
            startEditingBooking={startEditingBooking}
            deleteBooking={deleteBooking}
            role={role}
          />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {content}

      {hasMore && onLoadMore && (
        <div className="flex w-full justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {loadingMore ? "Cargando..." : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}

type BookingRowProps = {
  booking: Booking;
  expandedBookingId: number | null;
  setExpandedBookingId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (date: string | undefined) => string;
  startEditingBooking: (booking: Booking) => void;
  deleteBooking: (id: number) => void;
  role?: string;
};

function BookingListRow({
  booking,
  expandedBookingId,
  setExpandedBookingId,
  formatDate,
  startEditingBooking,
  deleteBooking,
  role,
}: BookingRowProps) {
  const isExpanded = expandedBookingId === booking.id_booking;
  const toggleRow = () =>
    setExpandedBookingId((prevId) =>
      prevId === booking.id_booking ? null : booking.id_booking,
    );
  const canManage =
    booking.status === "Abierta" ||
    role === "administrativo" ||
    role === "desarrollador" ||
    role === "gerente";

  const handleEdit = () => {
    startEditingBooking(booking);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatStatus = (value?: string) => {
    if (!value) return "—";
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const getChipColors = (value?: string) => {
    const key = (value || "").toLowerCase();
    if (key === "pendiente")
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100";
    if (key === "pago")
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100";
    if (key === "facturado")
      return "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100";
    if (key === "bloqueada")
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100";
    if (key === "cancelada")
      return "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100";
    if (key === "abierta")
      return "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100";
    return "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white";
  };

  const statusChip = (label: string, value: string) => (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm shadow-sky-900/10 ${getChipColors(value)}`}
    >
      {label}: {value}
    </span>
  );

  const InfoBlock = ({
    label,
    value,
  }: {
    label: string;
    value: string;
  }) => (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
        {label}
      </p>
      <p className="text-sm font-medium text-emerald-950 dark:text-emerald-50">
        {value || "—"}
      </p>
    </div>
  );

  const passengers = booking.clients || [];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:bg-white/5 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            #{booking.id_booking}
          </span>
          <p className="text-base font-semibold text-sky-950 dark:text-white">
            {booking.details || "Sin detalle"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusChip("Cliente", formatStatus(booking.clientStatus))}
          {statusChip("Operador", formatStatus(booking.operatorStatus))}
          <button
            onClick={toggleRow}
            className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
            aria-label={isExpanded ? "Ocultar detalles" : "Mostrar detalles"}
          >
            {isExpanded ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <InfoBlock
          label="Titular"
          value={`${booking.titular.first_name} ${booking.titular.last_name}`}
        />
        <InfoBlock
          label="Vendedor"
          value={`${booking.user.first_name} ${booking.user.last_name}`}
        />
        <InfoBlock label="Salida" value={formatDate(booking.departure_date)} />
        <InfoBlock label="Regreso" value={formatDate(booking.return_date)} />
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm dark:border-white/10">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <InfoBlock
              label="Creación"
              value={formatDate(booking.creation_date)}
            />
            <InfoBlock
              label="Pasajeros"
              value={String(Math.max(1, booking.pax_count))}
            />
            <InfoBlock label="Estado" value={booking.status || "—"} />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
              Facturación
            </p>
            <p className="text-sm text-sky-950 dark:text-white">
              {booking.invoice_type || "Sin datos"} •{" "}
              {booking.invoice_observation || "Sin observaciones"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
              Observaciones
            </p>
            <p className="text-sm text-sky-950 dark:text-white">
              {booking.observation || "Sin observaciones"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
              Pasajeros
            </p>
            <ul className="ml-4 list-disc text-sm text-sky-950 dark:text-white">
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

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/bookings/services/${booking.id_booking}`}
              className="flex gap-1 rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
            >
              Reserva
            </Link>
            {canManage && (
              <button
                className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                onClick={handleEdit}
              >
                Editar
              </button>
            )}
            {canManage && (
              <button
                className="rounded-full bg-red-600 px-4 py-2 text-red-100 shadow-sm shadow-red-950/30 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                onClick={() => deleteBooking(booking.id_booking)}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
