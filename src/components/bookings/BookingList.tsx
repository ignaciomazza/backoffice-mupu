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
}

export default function BookingList({
  bookings,
  expandedBookingId,
  setExpandedBookingId,
  startEditingBooking,
  deleteBooking,
}: BookingListProps) {
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", {
      timeZone: "UTC",
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id_booking}
          booking={booking}
          expandedBookingId={expandedBookingId}
          setExpandedBookingId={setExpandedBookingId}
          formatDate={formatDate}
          startEditingBooking={startEditingBooking}
          deleteBooking={deleteBooking}
        />
      ))}
    </div>
  );
}
