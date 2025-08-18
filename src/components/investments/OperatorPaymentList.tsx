// src/components/investments/OperatorPaymentList.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import OperatorPaymentCard, {
  InvestmentItem,
} from "@/components/investments/OperatorPaymentCard";

type Props = {
  token: string | null;
  bookingId?: number; // para listar pagos asociados a esta reserva
  operatorId?: number; // opcional: filtrar por operador si lo necesitás
  className?: string;
  reloadKey?: number; // NUEVO: forzar refetch al cambiar
};

export default function OperatorPaymentList({
  token,
  bookingId,
  operatorId,
  className,
  reloadKey,
}: Props) {
  const [items, setItems] = useState<InvestmentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // safety: abort prev request
  const listAbortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("take", "24");
    qs.set("category", "OPERADOR");
    if (operatorId) qs.set("operatorId", String(operatorId));
    // Si tu API soporta bookingId, lo usamos
    if (bookingId) qs.set("bookingId", String(bookingId));
    return qs.toString();
  }, [bookingId, operatorId]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const myId = ++reqIdRef.current;

    try {
      const res = await authFetch(
        `/api/investments?${queryString}`,
        { cache: "no-store", signal: controller.signal },
        token,
      );

      if (!res.ok) {
        // Fallback: si el backend aún no soporta bookingId
        const onlyCategory = await authFetch(
          `/api/investments?take=24&category=OPERADOR${operatorId ? `&operatorId=${operatorId}` : ""}`,
          { cache: "no-store", signal: controller.signal },
          token,
        );
        if (!onlyCategory.ok) throw new Error("No se pudo obtener la lista");
        const { items, nextCursor } = (await onlyCategory.json()) as {
          items: InvestmentItem[];
          nextCursor: number | null;
        };
        if (myId !== reqIdRef.current) return;
        const filtered = bookingId
          ? items.filter((i) => i.booking_id === bookingId)
          : items;
        setItems(filtered);
        setNextCursor(nextCursor ?? null);
        return;
      }

      const { items, nextCursor } = (await res.json()) as {
        items: InvestmentItem[];
        nextCursor: number | null;
      };
      if (myId !== reqIdRef.current) return;
      setItems(items);
      setNextCursor(nextCursor ?? null);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error(e);
      toast.error("Error cargando pagos al operador");
      setItems([]);
      setNextCursor(null);
    } finally {
      if (!controller.signal.aborted) setLoadingList(false);
    }
  }, [token, queryString, operatorId, bookingId]);

  // Carga inicial / cuando cambian dependencias de la query
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Refetch explícito cuando cambie reloadKey (después de crear un pago)
  useEffect(() => {
    if (reloadKey === undefined) return;
    fetchList();
  }, [fetchList, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const baseQS = new URLSearchParams(queryString);
      baseQS.set("cursor", String(nextCursor));

      const res = await authFetch(
        `/api/investments?${baseQS.toString()}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar más");
      const { items: more, nextCursor: c } = (await res.json()) as {
        items: InvestmentItem[];
        nextCursor: number | null;
      };

      // Si el backend no filtra por bookingId, filtramos client-side
      const filtered = bookingId
        ? more.filter((i) => i.booking_id === bookingId)
        : more;

      setItems((prev) => [...prev, ...filtered]);
      setNextCursor(c ?? null);
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar más registros");
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore, queryString, bookingId]);

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-lg font-medium">Pagos</p>
      </div>

      <div className="space-y-3">
        {loadingList ? (
          <div className="flex min-h-[16vh] items-center">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10">
            No hay pagos cargados {bookingId ? "para esta reserva." : "."}
          </div>
        ) : (
          <>
            {items.map((it) => (
              <OperatorPaymentCard key={it.id_investment} item={it} />
            ))}

            {nextCursor && (
              <div className="flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                >
                  {loadingMore ? <Spinner /> : "Ver más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
