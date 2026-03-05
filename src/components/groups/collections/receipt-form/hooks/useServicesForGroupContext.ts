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

export function useServicesForGroupContext<T = ServiceLite>(args: {
  contextId: number | null;
  loadServicesForContext?: (contextId: number) => Promise<T[]>;
  enabled?: boolean;
}) {
  const { contextId, loadServicesForContext, enabled = true } = args;
  const [services, setServices] = useState<T[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const loaderRef = useRef(loadServicesForContext);

  useEffect(() => {
    loaderRef.current = loadServicesForContext;
  }, [loadServicesForContext]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!enabled || !loader) return;
    if (!contextId) {
      setServices([]);
      setLoadingServices(false);
      return;
    }

    let alive = true;
    const cached = servicesCache.get(contextId);
    if (cached && cached.expiresAt > Date.now()) {
      setServices((cached.value as T[]) || []);
      setLoadingServices(false);
      return () => {
        alive = false;
      };
    }
    if (cached && cached.expiresAt <= Date.now()) {
      servicesCache.delete(contextId);
    }

    setLoadingServices(true);
    let task = servicesInflight.get(contextId);
    if (!task) {
      task = Promise.resolve(loader(contextId))
        .then((items) => {
          const normalized = Array.isArray(items) ? items : [];
          servicesCache.set(contextId, {
            value: normalized as unknown[],
            expiresAt: Date.now() + SERVICES_CACHE_TTL_MS,
          });
          return normalized as unknown[];
        })
        .catch(() => [])
        .finally(() => {
          servicesInflight.delete(contextId);
        });
      servicesInflight.set(contextId, task);
    }

    task
      .then((items) => {
        if (!alive) return;
        setServices((items as T[]) || []);
      })
      .finally(() => {
        if (alive) setLoadingServices(false);
      });

    return () => {
      alive = false;
    };
  }, [contextId, enabled]);

  return { services, loadingServices };
}
