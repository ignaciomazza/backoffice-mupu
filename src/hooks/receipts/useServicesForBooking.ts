// src/hooks/receipts/useServicesForBooking.ts
"use client";

import { useEffect, useState } from "react";
import type { ServiceLite } from "@/types/receipts";

export function useServicesForBooking<T = ServiceLite>(args: {
  bookingId: number | null;
  loadServicesForBooking?: (bookingId: number) => Promise<T[]>;
}) {
  const { bookingId, loadServicesForBooking } = args;
  const [services, setServices] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loadServicesForBooking) return;
    if (!bookingId) {
      setServices([]);
      return;
    }

    let alive = true;
    setLoading(true);

    loadServicesForBooking(bookingId)
      .then((res) => alive && setServices(res || []))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [bookingId, loadServicesForBooking]);

  return { services, loadingServices: loading };
}
