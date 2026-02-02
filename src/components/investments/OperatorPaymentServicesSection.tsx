// src/components/investments/OperatorPaymentServicesSection.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";
import { useBookingSearch } from "@/hooks/receipts/useBookingSearch";
import { useServicesForBooking } from "@/hooks/receipts/useServicesForBooking";
import type { BookingOption } from "@/types/receipts";
type OperatorLite = { id_operator: number; name: string };

type OperatorServiceLite = {
  id_service: number;
  agency_service_id?: number | null;
  booking_id: number;
  id_operator: number;
  currency: string;
  cost_price?: number | null;
  type?: string;
  destination?: string;
  booking?: { id_booking: number; agency_booking_id?: number | null } | null;
  operator?: { id_operator: number; name?: string | null } | null;
};

type SelectionSummary = {
  serviceIds: number[];
  services: OperatorServiceLite[];
  totalCost: number;
  operatorId: number | null;
  currency: string | null;
  bookingIds: number[];
};

type Props = {
  token: string | null;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  initialServiceIds: number[];
  resetKey: number;
  operatorId: number | null;
  currency: string;
  amount: string;
  operators: OperatorLite[];
  onSelectionChange: (summary: SelectionSummary) => void;
};

const Section = ({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-4">
    <div className="mb-3">
      <h3 className="text-base font-semibold tracking-tight text-sky-950 dark:text-white">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-xs font-light text-sky-950/70 dark:text-white/70">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  </section>
);

const Field = ({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="ml-1 block text-sm font-medium text-sky-950 dark:text-white"
    >
      {label}
    </label>
    {children}
    {hint && (
      <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">{hint}</p>
    )}
  </div>
);

const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm shadow-sm backdrop-blur transition hover:bg-white/20 dark:border-white/10 dark:bg-white/10 ${
      checked ? "ring-1 ring-emerald-400/60" : ""
    }`}
  >
    <span
      className={`inline-block h-4 w-7 rounded-full ${
        checked ? "bg-emerald-500/70" : "bg-white/30 dark:bg-white/10"
      }`}
    >
      <span
        className={`block size-4 rounded-full bg-white transition ${
          checked ? "translate-x-3" : ""
        }`}
      />
    </span>
    <span>{label}</span>
  </button>
);

const inputBase =
  "w-full rounded-2xl border border-sky-200 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-sky-100/10 dark:border-sky-200/60 dark:text-white";

const pillBase = "rounded-full px-3 py-1 text-xs font-medium";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
const pillWarn = "bg-rose-500/15 text-rose-700 dark:text-rose-300";

function formatMoney(n: number, cur = "ARS") {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

export default function OperatorPaymentServicesSection({
  token,
  enabled,
  onToggle,
  initialServiceIds,
  resetKey,
  operatorId,
  currency,
  amount,
  operators,
  onSelectionChange,
}: Props) {
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  const [selectedServices, setSelectedServices] = useState<OperatorServiceLite[]>([]);

  const { bookingQuery, setBookingQuery, bookingOptions, loadingBookings } =
    useBookingSearch({ token, enabled });

  const loadServicesForBooking = useCallback(
    async (bookingId: number) => {
      if (!token) return [];
      const res = await authFetch(
        `/api/services?bookingId=${bookingId}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { services?: OperatorServiceLite[] };
      return data.services ?? [];
    },
    [token],
  );

  const { services, loadingServices } = useServicesForBooking<OperatorServiceLite>({
    bookingId: selectedBookingId,
    loadServicesForBooking,
  });

  const loadServicesByIds = useCallback(
    async (ids: number[]) => {
      if (!token || ids.length === 0) return [];
      const res = await authFetch(
        `/api/services?ids=${ids.join(",")}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { services?: OperatorServiceLite[] };
      return data.services ?? [];
    },
    [token],
  );

  useEffect(() => {
    let alive = true;
    setSelectedServices([]);
    setSelectedBookingId(null);
    if (!enabled) {
      onSelectionChange({
        serviceIds: [],
        services: [],
        totalCost: 0,
        operatorId: null,
        currency: null,
        bookingIds: [],
      });
      return () => {
        alive = false;
      };
    }
    if (!token || initialServiceIds.length === 0) {
      onSelectionChange({
        serviceIds: [],
        services: [],
        totalCost: 0,
        operatorId: null,
        currency: null,
        bookingIds: [],
      });
      return () => {
        alive = false;
      };
    }
    loadServicesByIds(initialServiceIds)
      .then((list) => {
        if (!alive) return;
        setSelectedServices(list);
      })
      .catch(() => {
        if (!alive) return;
        toast.error("No se pudieron cargar los servicios asociados.");
      });
    return () => {
      alive = false;
    };
  }, [resetKey, enabled, token, initialServiceIds, loadServicesByIds, onSelectionChange]);

  const lockOperatorId = useMemo(() => {
    if (selectedServices.length > 0) return selectedServices[0].id_operator;
    return operatorId ?? null;
  }, [selectedServices, operatorId]);

  const lockCurrency = useMemo(() => {
    const raw =
      selectedServices.length > 0
        ? selectedServices[0].currency || ""
        : currency || "";
    const upper = raw.toUpperCase();
    return upper || null;
  }, [selectedServices, currency]);

  const selectedServiceIds = useMemo(
    () => selectedServices.map((s) => s.id_service),
    [selectedServices],
  );

  const totalCost = useMemo(
    () =>
      selectedServices.reduce(
        (sum, s) => sum + Number(s.cost_price || 0),
        0,
      ),
    [selectedServices],
  );

  const bookingIds = useMemo(
    () => Array.from(new Set(selectedServices.map((s) => s.booking_id))),
    [selectedServices],
  );

  useEffect(() => {
    const operatorIdFromSelection =
      selectedServices.length > 0 ? selectedServices[0].id_operator : null;
    const currencyFromSelection =
      selectedServices.length > 0
        ? (selectedServices[0].currency || "").toUpperCase()
        : null;
    onSelectionChange({
      serviceIds: selectedServiceIds,
      services: selectedServices,
      totalCost,
      operatorId: operatorIdFromSelection,
      currency: currencyFromSelection,
      bookingIds,
    });
  }, [selectedServiceIds, selectedServices, totalCost, bookingIds, onSelectionChange]);

  const toggleService = (svc: OperatorServiceLite) => {
    const isSelected = selectedServiceIds.includes(svc.id_service);
    if (isSelected) {
      setSelectedServices((prev) =>
        prev.filter((s) => s.id_service !== svc.id_service),
      );
      return;
    }
    if (lockOperatorId && svc.id_operator !== lockOperatorId) {
      toast.error(
        "No podés mezclar servicios de operadores distintos en un mismo pago.",
      );
      return;
    }
    const svcCurrency = (svc.currency || "").toUpperCase();
    if (lockCurrency && svcCurrency !== lockCurrency) {
      toast.error(
        "No podés mezclar servicios de monedas distintas en un mismo pago.",
      );
      return;
    }
    setSelectedServices((prev) => [...prev, svc]);
  };

  const amountNum = Number(amount);
  const exceedsAmount =
    Number.isFinite(amountNum) && amountNum > 0 && totalCost > amountNum;

  return (
    <Section
      title="Servicios asociados"
      desc="Podés asociar el pago a uno o más servicios (misma moneda y mismo operador)."
    >
      <div className="md:col-span-2">
        <Toggle
          checked={enabled}
          onChange={onToggle}
          label="Asociar servicios ahora"
        />
      </div>

      {enabled && (
        <>
          <Field
            id="booking_search"
            label="Buscar reserva"
            hint="Por número o titular…"
          >
            <input
              id="booking_search"
              value={bookingQuery}
              onChange={(e) => setBookingQuery(e.target.value)}
              placeholder="Escribí al menos 2 caracteres"
              className={inputBase}
              autoComplete="off"
            />
          </Field>

          <div className="md:col-span-2">
            {loadingBookings ? (
              <div className="py-2">
                <Spinner />
              </div>
            ) : bookingOptions.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded-2xl border border-white/10">
                {bookingOptions.map((opt: BookingOption) => {
                  const active = selectedBookingId === opt.id_booking;
                  return (
                    <button
                      key={opt.id_booking}
                      type="button"
                      className={`w-full px-3 py-2 text-left transition hover:bg-white/5 ${
                        active ? "bg-white/10" : ""
                      }`}
                      onClick={() => setSelectedBookingId(opt.id_booking)}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      {opt.subtitle && (
                        <div className="text-xs text-sky-950/70 dark:text-white/70">
                          {opt.subtitle}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : bookingQuery && bookingQuery.length >= 2 ? (
              <p className="text-sm text-sky-950/70 dark:text-white/70">
                Sin resultados.
              </p>
            ) : null}
          </div>

          {selectedBookingId && (
            <div className="md:col-span-2">
              <label className="mb-1 ml-1 block text-sm font-medium text-sky-950 dark:text-white">
                Servicios de la reserva
              </label>

              {loadingServices ? (
                <div className="py-2">
                  <Spinner />
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-sky-950/70 dark:text-white/70">
                  No hay servicios para esta reserva.
                </p>
              ) : (
                <div className="space-y-2">
                  {services.map((svc) => {
                    const checked = selectedServiceIds.includes(svc.id_service);
                    const disabled =
                      (!!lockOperatorId &&
                        svc.id_operator !== lockOperatorId &&
                        !checked) ||
                      (!!lockCurrency &&
                        (svc.currency || "").toUpperCase() !== lockCurrency &&
                        !checked);

                    const opName =
                      operators.find(
                        (o) => o.id_operator === svc.id_operator,
                      )?.name ||
                      svc.operator?.name ||
                      "Operador";

                    return (
                      <label
                        key={svc.id_service}
                        className={`flex items-start gap-3 rounded-2xl border px-3 py-2 ${
                          checked
                            ? "border-white/20 bg-white/10"
                            : "border-white/10"
                        } ${disabled ? "opacity-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleService(svc)}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            N° {svc.agency_service_id ?? svc.id_service} ·{" "}
                            {svc.type}
                            {svc.destination ? ` · ${svc.destination}` : ""}
                          </div>
                          <div className="text-xs text-sky-950/70 dark:text-white/70">
                            Operador: <b>{opName}</b> • Moneda:{" "}
                            <b>{(svc.currency || "ARS").toUpperCase()}</b> •
                            Costo:{" "}
                            {formatMoney(
                              Number(svc.cost_price || 0),
                              (svc.currency || "ARS").toUpperCase(),
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              <span className={`${pillBase} ${pillNeutral}`}>
                Seleccionados: {selectedServices.length}
              </span>
              <span
                className={`${pillBase} ${lockCurrency ? pillOk : pillNeutral}`}
              >
                Moneda {lockCurrency || "—"}
              </span>
              {lockOperatorId && (
                <span className={`${pillBase} ${pillNeutral}`}>
                  Operador N° {lockOperatorId}
                </span>
              )}
              {bookingIds.length > 0 && (
                <span className={`${pillBase} ${pillNeutral}`}>
                  Reservas: {bookingIds.length}
                </span>
              )}
              {selectedServices.length > 0 && (
                <span className={`${pillBase} ${exceedsAmount ? pillWarn : pillOk}`}>
                  Total costos: {formatMoney(totalCost, lockCurrency || "ARS")}
                </span>
              )}
            </div>
            {exceedsAmount && (
              <p className="mt-2 text-xs text-rose-600">
                El costo total de los servicios supera el monto del pago.
              </p>
            )}
          </div>

          {selectedServices.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-xs text-sky-950/70 dark:text-white/70">
                Servicios seleccionados:
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedServices.map((svc) => {
                  const bookingNumber =
                    svc.booking?.agency_booking_id ?? svc.booking_id;
                  return (
                    <button
                      key={`sel-${svc.id_service}`}
                      type="button"
                      onClick={() => toggleService(svc)}
                      className="rounded-full border border-white/10 bg-white/40 px-3 py-1 text-xs text-sky-900 transition hover:bg-white/60 dark:bg-white/10 dark:text-white"
                      title="Quitar servicio"
                    >
                      Res. {bookingNumber} · Svc{" "}
                      {svc.agency_service_id ?? svc.id_service}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
