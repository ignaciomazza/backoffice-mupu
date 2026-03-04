// src/hooks/receipts/useServicesForBooking.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { ServiceLite } from "@/types/receipts";

const SERVICES_CACHE_TTL_MS = 15_000;
const servicesCache = new Map<
  number,
  {
    value: unknown[];
    expiresAt: number;
  }
>();
const servicesInflight = new Map<number, Promise<unknown[]>>();

export function useServicesForBooking<T = ServiceLite>(args: {
  bookingId: number | null;
  loadServicesForBooking?: (bookingId: number) => Promise<T[]>;
  enabled?: boolean;
}) {
  const { bookingId, loadServicesForBooking, enabled = true } = args;
  const [services, setServices] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef(loadServicesForBooking);

  useEffect(() => {
    loaderRef.current = loadServicesForBooking;
  }, [loadServicesForBooking]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!enabled || !loader) return;
    if (!bookingId) {
      setServices([]);
      setLoading(false);
      return;
    }

    let alive = true;

    const cached = servicesCache.get(bookingId);
    if (cached && cached.expiresAt > Date.now()) {
      setServices((cached.value as T[]) || []);
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    if (cached && cached.expiresAt <= Date.now()) {
      servicesCache.delete(bookingId);
    }

    setLoading(true);
    let task = servicesInflight.get(bookingId);
    if (!task) {
      task = Promise.resolve(loader(bookingId))
        .then((res) => {
          const normalized = Array.isArray(res) ? res : [];
          servicesCache.set(bookingId, {
            value: normalized as unknown[],
            expiresAt: Date.now() + SERVICES_CACHE_TTL_MS,
          });
          return normalized as unknown[];
        })
        .catch(() => [])
        .finally(() => {
          servicesInflight.delete(bookingId);
        });
      servicesInflight.set(bookingId, task);
    }

    task
      .then((res) => {
        if (!alive) return;
        setServices((res as T[]) || []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [bookingId, enabled]);

  return { services, loadingServices: loading };
}
