// src/components/bookings/BookingList.tsx
"use client";
import React from "react";
import BookingCard from "./BookingCard";
import { Booking } from "@/types";

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
}: BookingListProps) {
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { timeZone: "UTC" });
  };

  return (
    <div className="flex flex-col gap-6">
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
