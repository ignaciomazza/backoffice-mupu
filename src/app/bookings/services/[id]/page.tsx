// src/app/bookings/services/[id]/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  Booking,
  Service,
  Operator,
  Invoice,
  Receipt,
  BillingData,
} from "@/types";
import ServicesContainer, {
  ServiceFormData,
} from "@/components/services/ServicesContainer";
import { InvoiceFormData } from "@/components/invoices/InvoiceForm";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import { CreditNoteFormData } from "@/components/credit-notes/CreditNoteForm";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";
import {
  computeManualTotals,
  type ManualTotalsInput,
} from "@/services/afip/manualTotals";

// ===== Cookies utils =====
type Role =
  | "desarrollador"
  | "gerente"
  | "equipo"
  | "vendedor"
  | "administrativo"
  | "marketing";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${encodeURIComponent(name)}=`));
  return row ? decodeURIComponent(row.split("=")[1] || "") : null;
}

function readRoleFromCookie(): Role | "" {
  const raw = getCookie("role");
  return normalizeRole(raw);
}

function normalizeRole(raw: unknown): Role | "" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (["admin", "administrador", "administrativa"].includes(s))
    return "administrativo";
  if (["dev", "developer"].includes(s)) return "desarrollador";
  return (
    [
      "desarrollador",
      "gerente",
      "equipo",
      "vendedor",
      "administrativo",
      "marketing",
    ] as const
  ).includes(s as Role)
    ? (s as Role)
    : "";
}

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractReceiptsArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!isRecord(json)) return [];

  if (Array.isArray(json.receipts)) return json.receipts;
  if (Array.isArray(json.items)) return json.items;

  const data = json.data;
  if (isRecord(data)) {
    if (Array.isArray(data.receipts)) return data.receipts;
    if (Array.isArray(data.items)) return data.items;
  }

  return [];
}

function coerceReceipt(r: unknown): Receipt {
  const obj = isRecord(r) ? r : {};

  const rawId = obj.id_receipt ?? obj.id ?? 0;
  const id = Number(rawId);

  const rawIssue = obj.issue_date ?? obj.date ?? null;

  const rawAmount = obj.amount ?? obj.total ?? 0;
  const amount =
    typeof rawAmount === "number" ? rawAmount : Number(rawAmount ?? 0);

  const base = (isRecord(r) ? (r as Partial<Receipt>) : {}) as Partial<Receipt>;

  return {
    ...base,
    id_receipt: Number.isFinite(id) ? id : 0,
    agency_receipt_id:
      obj.agency_receipt_id != null ? Number(obj.agency_receipt_id) : undefined,
    receipt_number: String(obj.receipt_number ?? obj.number ?? ""),
    issue_date: rawIssue as Receipt["issue_date"],
    amount: Number.isFinite(amount) ? amount : 0,
    amount_currency: String(obj.amount_currency ?? obj.currency ?? "ARS"),
  } as Receipt;
}

export default function ServicesPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteWithItems[]>([]);

  const [role, setRole] = useState<Role | "">("");
  const { token } = useAuth();

  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    tipoFactura: "",
    clientIds: [],
    services: [],
    exchangeRate: "",
    description21: [],
    description10_5: [],
    descriptionNonComputable: [],
    invoiceDate: "",
    manualTotalsEnabled: false,
    manualTotal: "",
    manualBase21: "",
    manualIva21: "",
    manualBase10_5: "",
    manualIva10_5: "",
    manualExempt: "",
  });

  const [formData, setFormData] = useState<ServiceFormData>({
    type: "",
    description: "",
    sale_price: 0,
    cost_price: 0,
    destination: "",
    reference: "",
    tax_21: 0,
    tax_105: 0,
    exempt: 0,
    other_taxes: 0,
    card_interest: 0,
    card_interest_21: 0,
    currency: "ARS",
    id_operator: 0,
    departure_date: "",
    return_date: "",
  });

  const [billingData, setBillingData] = useState<BillingData>({
    nonComputable: 0,
    taxableBase21: 0,
    taxableBase10_5: 0,
    commissionExempt: 0,
    commission21: 0,
    commission10_5: 0,
    vatOnCommission21: 0,
    vatOnCommission10_5: 0,
    totalCommissionWithoutVAT: 0,
    impIVA: 0,
    taxableCardInterest: 0,
    vatOnCardInterest: 0,
    transferFeeAmount: 0,
    transferFeePct: 0.024,
    extraCostsAmount: 0,
    extraTaxesAmount: 0,
    extraAdjustments: [],
  });

  const [creditNoteFormData, setCreditNoteFormData] =
    useState<CreditNoteFormData>({
      invoiceId: "",
      tipoNota: "",
      exchangeRate: "",
      invoiceDate: "",
      manualTotalsEnabled: false,
      manualTotal: "",
      manualBase21: "",
      manualIva21: "",
      manualBase10_5: "",
      manualIva10_5: "",
      manualExempt: "",
    });

  const [isBillingFormVisible, setIsBillingFormVisible] = useState(false);
  const [isCreditNoteSubmitting, setIsCreditNoteSubmitting] = useState(false);

  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleBillingUpdate = useCallback((data: BillingData) => {
    setBillingData(data);
  }, []);

  /* ============================ LOADERS ============================ */

  const fetchServices = useCallback(
    async (bookingId: number, signal?: AbortSignal) => {
      if (!token) return [];
      const res = await authFetch(
        `/api/services?bookingId=${bookingId}`,
        { cache: "no-store", signal },
        token,
      );
      if (!res.ok) throw new Error("Error al obtener los servicios");
      const data = await res.json();
      const items: Service[] = Array.isArray(data?.services)
        ? (data.services as Service[])
        : [];
      if (mountedRef.current) setServices(items);
      return items;
    },
    [token],
  );

  const fetchInvoices = useCallback(
    async (bookingId: number, signal?: AbortSignal) => {
      if (!token) return [];
      const res = await authFetch(
        `/api/invoices?bookingId=${bookingId}`,
        { cache: "no-store", signal },
        token,
      );
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          if (mountedRef.current) setInvoices([]);
          return [];
        }
        throw new Error("Error al obtener las facturas");
      }
      const data = await res.json();
      const items: Invoice[] = Array.isArray(data?.invoices)
        ? (data.invoices as Invoice[])
        : [];
      if (mountedRef.current) setInvoices(items);
      return items;
    },
    [token],
  );

  const fetchReceipts = useCallback(
    async (bookingId: number, signal?: AbortSignal) => {
      if (!token) return [];

      // 👇 si tu endpoint nuevo es paginado, pedimos un take grande para reservas
      const qs = new URLSearchParams();
      qs.set("bookingId", String(bookingId));
      qs.set("take", "200");

      const res = await authFetch(
        `/api/receipts?${qs.toString()}`,
        { cache: "no-store", signal },
        token,
      );

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          if (mountedRef.current) setReceipts([]);
          return [];
        }
        throw new Error("Error al obtener los recibos");
      }

      const json: unknown = await res.json().catch(() => null);
      const arr = extractReceiptsArray(json);
      const items = arr.map(coerceReceipt).filter((x) => x.id_receipt > 0);

      if (mountedRef.current) setReceipts(items);
      return items;
    },
    [token],
  );

  const fetchCreditNotes = useCallback(
    async (invs: Invoice[], signal?: AbortSignal) => {
      if (!token || invs.length === 0) {
        if (mountedRef.current) setCreditNotes([]);
        return [];
      }
      try {
        const all = await Promise.all(
          invs.map(async (inv) => {
            const r = await authFetch(
              `/api/credit-notes?invoiceId=${inv.id_invoice}`,
              { cache: "no-store", signal },
              token,
            );
            if (!r.ok) return [];
            const j = await r.json();
            return (
              Array.isArray(j?.creditNotes) ? j.creditNotes : []
            ) as CreditNoteWithItems[];
          }),
        );
        const flat = all.flat();
        if (mountedRef.current) setCreditNotes(flat);
        return flat;
      } catch {
        if (mountedRef.current) setCreditNotes([]);
        return [];
      }
    },
    [token],
  );

  const fetchOperatorsByAgency = useCallback(
    async (agencyId: number, signal?: AbortSignal) => {
      if (!token || !agencyId) return [];
      const res = await authFetch(
        `/api/operators?agencyId=${agencyId}`,
        { cache: "no-store", signal },
        token,
      );
      if (!res.ok) throw new Error("Error al obtener operadores");
      const data = (await res.json()) as Operator[];
      if (mountedRef.current) setOperators(data);
      return data;
    },
    [token],
  );

  // Carga secuencial: booking → services → (invoices → creditNotes) → receipts → operators
  useEffect(() => {
    if (!id || !token) return;
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);

        // 1) Booking
        const res = await authFetch(
          `/api/bookings/${id}`,
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al obtener la reserva");
        const bk: Booking = await res.json();
        if (!mountedRef.current) return;
        setBooking(bk);

        // 2) Services
        await fetchServices(bk.id_booking, ac.signal);

        // 3) Invoices → Credit notes
        const invs = await fetchInvoices(bk.id_booking, ac.signal);
        await fetchCreditNotes(invs, ac.signal);

        // 4) Receipts
        await fetchReceipts(bk.id_booking, ac.signal);

        // 5) Operators por agencia
        if (bk?.agency?.id_agency) {
          await fetchOperatorsByAgency(bk.agency.id_agency, ac.signal);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "No se pudieron cargar los datos.";
        toast.error(msg);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [
    id,
    token,
    fetchServices,
    fetchInvoices,
    fetchReceipts,
    fetchCreditNotes,
    fetchOperatorsByAgency,
  ]);

  // Rol: cookie-first; si no existe, fallback a API una sola vez.
  // Además, re-sincroniza al volver el foco a la pestaña.
  useEffect(() => {
    if (!token) return;

    // 1) Cookie → rápido y sin golpear la DB
    const fromCookie = readRoleFromCookie();
    if (fromCookie) {
      setRole(fromCookie);
      return; // evitamos fetch innecesario
    }

    // 2) Fallback a API si no hay cookie
    const ac = new AbortController();
    (async () => {
      try {
        let value: Role | "" = "";
        const r = await authFetch(
          "/api/role",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (r.ok) {
          const data = await r.json();
          value = normalizeRole((data as { role?: unknown })?.role);
        } else if (r.status === 404) {
          const p = await authFetch(
            "/api/user/profile",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (p.ok) {
            const j = await p.json();
            value = normalizeRole((j as { role?: unknown })?.role);
          }
        }
        if (mountedRef.current) setRole(value);
      } catch {
        // silencioso
      }
    })();

    return () => ac.abort();
  }, [token]);

  // Releer la cookie al volver el foco (por si el rol cambió en otra pestaña)
  useEffect(() => {
    const onFocus = () => {
      const cookieRole = readRoleFromCookie(); // puede ser "" si no está
      if (!cookieRole) return;
      if ((cookieRole || "") !== (role || "")) setRole(cookieRole);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [role]);

  /* ============================ HANDLERS ============================ */

  const handleReceiptCreated = () => {
    if (booking?.id_booking) void fetchReceipts(booking.id_booking);
  };

  const handleReceiptDeleted = (id_receipt: number) => {
    setReceipts((prev) => prev.filter((r) => r.id_receipt !== id_receipt));
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    const numericFields = [
      "sale_price",
      "cost_price",
      "tax_21",
      "tax_105",
      "exempt",
      "other_taxes",
      "card_interest",
      "card_interest_21",
    ];
    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.includes(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleInvoiceChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setInvoiceFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreditNoteChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setCreditNoteFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ Se usan pasando la ref al contenedor
  const updateInvoiceFormData = (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData],
  ) => {
    setInvoiceFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateCreditNoteFormData = <K extends keyof CreditNoteFormData>(
    key: K,
    value: CreditNoteFormData[K],
  ) => {
    setCreditNoteFormData((prev) => ({ ...prev, [key]: value }));
  };

  const parseManualAmount = (value?: string) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed.replace(",", "."));
    return Number.isFinite(num) ? num : undefined;
  };

  const buildManualTotals = (data: {
    manualTotalsEnabled: boolean;
    manualTotal: string;
    manualBase21: string;
    manualIva21: string;
    manualBase10_5: string;
    manualIva10_5: string;
    manualExempt: string;
  }): { manualTotals?: ManualTotalsInput; error?: string } => {
    if (!data.manualTotalsEnabled) return { manualTotals: undefined };

    const manualTotals: ManualTotalsInput = {
      total: parseManualAmount(data.manualTotal),
      base21: parseManualAmount(data.manualBase21),
      iva21: parseManualAmount(data.manualIva21),
      base10_5: parseManualAmount(data.manualBase10_5),
      iva10_5: parseManualAmount(data.manualIva10_5),
      exempt: parseManualAmount(data.manualExempt),
    };

    const hasManualValues = Object.values(manualTotals).some(
      (v) => typeof v === "number",
    );

    if (!hasManualValues) {
      return { error: "Completá al menos un importe manual." };
    }

    const validation = computeManualTotals(manualTotals);
    if (!validation.ok) {
      return { error: validation.error };
    }

    return { manualTotals };
  };

  const getInvoiceErrorToast = (raw?: string): string => {
    const msg = String(raw ?? "").trim();
    if (!msg) {
      return "No se pudo crear la factura. Revisá los datos e intentá de nuevo.";
    }

    const m = msg.toLowerCase();

    if (m.includes("importes manuales")) {
      return msg;
    }
    if (m.includes("no autenticado") || m.includes("x-user-id")) {
      return "Tu sesión expiró. Volvé a iniciar sesión.";
    }
    if (m.includes("token")) {
      return "Tu sesión expiró. Volvé a iniciar sesión.";
    }
    if (m.includes("agencia asociada")) {
      return "Tu usuario no tiene agencia asignada. Contactá a un administrador.";
    }
    if (m.includes("agencia no encontrada")) {
      return "No se encontró la agencia. Contactá a un administrador.";
    }
    if (m.includes("reserva no pertenece")) {
      return "La reserva no pertenece a tu agencia.";
    }
    if (m.includes("reserva no encontrada")) {
      return "No se encontró la reserva.";
    }
    if (m.includes("falta cuit") || m.includes("cuit inválido")) {
      return "Error en el CUIT. Revisá el CUIT del cliente o de la agencia.";
    }
    if (m.includes("cuit invalido") || m.includes("tax_id")) {
      return "Error en el CUIT. Revisá el CUIT del cliente o de la agencia.";
    }
    if (m.includes("falta dni")) {
      return "Falta DNI del cliente. Revisá el documento para Factura B.";
    }
    if (m.includes("docnro") || m.includes("documento")) {
      return "Documento del cliente inválido. Revisá DNI/CUIT.";
    }
    if (
      m.includes("cert") ||
      m.includes("key") ||
      m.includes("afip_secret_key") ||
      m.includes("formato cifrado")
    ) {
      return "Credenciales AFIP inválidas o faltantes. Revisá certificado y clave.";
    }
    if (
      m.includes("fecha de factura") ||
      m.includes("formato de fecha") ||
      m.includes("yyyy-mm-dd")
    ) {
      return "Fecha de factura inválida. Debe estar dentro de los 8 días.";
    }
    if (
      m.includes("fchserv") ||
      m.includes("fecha de servicio") ||
      m.includes("servicio desde") ||
      m.includes("servicio hasta")
    ) {
      return "Fecha de servicio inválida. Revisá las fechas de los servicios.";
    }
    if (
      m.includes("punto de venta") ||
      m.includes("feparamgetptosventa") ||
      m.includes("ptovta") ||
      m.includes("seleccionado no esta habilitado")
    ) {
      return "Punto de venta invalido para WSFE. Revisalo en ARCA y reintenta.";
    }
    if (
      m.includes("iva") ||
      m.includes("impuesto") ||
      m.includes("tributo") ||
      m.includes("alicuota")
    ) {
      return "Error en impuestos/IVA de los servicios. Revisá los importes.";
    }
    if (
      m.includes("cotización") ||
      m.includes("cotizacion") ||
      m.includes("exchangeRate".toLowerCase()) ||
      m.includes("moncotiz")
    ) {
      return "Cotización inválida. Revisá la moneda y el tipo de cambio.";
    }
    if (
      m.includes("afip no disponible") ||
      m.includes("internal server error") ||
      m.includes("invalid xml") ||
      m.includes("request failed")
    ) {
      return "AFIP no respondió correctamente. Intentá más tarde.";
    }
    if (m.includes("cae")) {
      return "AFIP no otorgó CAE. Intentá nuevamente más tarde.";
    }
    if (m.includes("debe haber al menos un servicio")) {
      return "Seleccioná al menos un servicio.";
    }
    if (m.includes("debe haber al menos un cliente")) {
      return "Seleccioná al menos un cliente.";
    }
    if (m.includes("tipoFactura".toLowerCase())) {
      return "Tipo de factura inválido. Elegí Factura A o B.";
    }
    if (m.includes("no se generó ninguna factura")) {
      return "No se pudo generar la factura. Revisá CUIT/DNI del cliente y los servicios.";
    }

    return msg;
  };

  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceLoading) return;
    if (
      !invoiceFormData.tipoFactura ||
      invoiceFormData.clientIds.length === 0 ||
      invoiceFormData.services.length === 0
    ) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    const clientCount = (invoiceFormData.clientIds || []).filter((v) =>
      String(v || "").trim(),
    ).length;
    const serviceCount = invoiceFormData.services.length;
    const tipoLabel =
      invoiceFormData.tipoFactura === "1" ? "Factura A" : "Factura B";
    const dateLabel = invoiceFormData.invoiceDate
      ? `\nFecha: ${invoiceFormData.invoiceDate}`
      : "";

    if (
      !window.confirm(
        `¿Emitir ${tipoLabel} para ${clientCount} cliente(s) y ${serviceCount} servicio(s)?${dateLabel}`,
      )
    ) {
      return;
    }
    if (!booking?.id_booking) {
      toast.error("No se pudo identificar la reserva.");
      return;
    }
    const manualBuild = buildManualTotals(invoiceFormData);
    if (manualBuild.error) {
      toast.error(manualBuild.error);
      return;
    }

    const payload = {
      bookingId: booking.id_booking,
      services: invoiceFormData.services.map((s) => Number(s)),
      clientIds: invoiceFormData.clientIds.map((c) => Number(c)),
      tipoFactura: parseInt(invoiceFormData.tipoFactura, 10),
      exchangeRate: invoiceFormData.exchangeRate
        ? parseFloat(invoiceFormData.exchangeRate)
        : undefined,
      description21: invoiceFormData.description21,
      description10_5: invoiceFormData.description10_5,
      descriptionNonComputable: invoiceFormData.descriptionNonComputable,
      invoiceDate: invoiceFormData.invoiceDate,
      manualTotals: manualBuild.manualTotals,
    };

    setInvoiceLoading(true);
    try {
      const res = await authFetch(
        "/api/invoices",
        { method: "POST", body: JSON.stringify(payload) },
        token || undefined,
      );
      if (!res.ok) {
        const raw = await res.text();
        let message = raw;
        try {
          message = (JSON.parse(raw) as { message?: string }).message || raw;
        } catch {
          // mantener raw
        }
        throw new Error(getInvoiceErrorToast(message));
      }
      const result = await res.json();
      if ((result as { success?: boolean }).success) {
        setInvoices((prev) => [
          ...prev,
          ...((result as { invoices?: Invoice[] }).invoices ?? []),
        ]);
        toast.success("Factura creada exitosamente!");
      } else {
        toast.error(
          getInvoiceErrorToast((result as { message?: string }).message),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error servidor.";
      toast.error(getInvoiceErrorToast(msg));
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleCreditNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditNoteFormData.invoiceId || !creditNoteFormData.tipoNota) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }

    const manualBuild = buildManualTotals(creditNoteFormData);
    if (manualBuild.error) {
      toast.error(manualBuild.error);
      return;
    }

    const payload = {
      invoiceId: Number(creditNoteFormData.invoiceId),
      tipoNota: parseInt(creditNoteFormData.tipoNota, 10),
      exchangeRate: creditNoteFormData.exchangeRate
        ? parseFloat(creditNoteFormData.exchangeRate)
        : undefined,
      invoiceDate: creditNoteFormData.invoiceDate || undefined,
      manualTotals: manualBuild.manualTotals,
    };

    setIsCreditNoteSubmitting(true);
    try {
      const res = await authFetch(
        "/api/credit-notes",
        { method: "POST", body: JSON.stringify(payload) },
        token || undefined,
      );
      const raw = await res.text();
      let parsed: { message?: string; success?: boolean } | null = null;
      try {
        parsed = JSON.parse(raw) as { message?: string; success?: boolean };
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        const msg = parsed?.message || raw;
        throw new Error(getInvoiceErrorToast(msg));
      }
      const result = (parsed ?? {}) as { message?: string; success?: boolean };
      if (result.success) {
        toast.success("Nota de crédito creada exitosamente!");
        handleCreditNoteCreated();
        setCreditNoteFormData({
          invoiceId: "",
          tipoNota: "",
          exchangeRate: "",
          invoiceDate: "",
          manualTotalsEnabled: false,
          manualTotal: "",
          manualBase21: "",
          manualIva21: "",
          manualBase10_5: "",
          manualIva10_5: "",
          manualExempt: "",
        });
        setIsBillingFormVisible(false);
      } else {
        toast.error(
          getInvoiceErrorToast(
            result.message || "Error al crear nota de crédito.",
          ),
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error de servidor.";
      toast.error(getInvoiceErrorToast(msg));
    } finally {
      setIsCreditNoteSubmitting(false);
    }
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.type || !booking?.id_booking) {
      toast.error("Completa los campos obligatorios.");
      return;
    }
    try {
      const url = editingServiceId
        ? `/api/services/${editingServiceId}`
        : "/api/services";

      const payload = {
        ...formData,
        booking_id: booking.id_booking,
        ...billingData,
        transfer_fee_pct: billingData.transferFeePct,
        transfer_fee_amount: billingData.transferFeeAmount,
        extra_costs_amount: billingData.extraCostsAmount,
        extra_taxes_amount: billingData.extraTaxesAmount,
        extra_adjustments: billingData.extraAdjustments,
      };

      const res = await authFetch(
        url,
        {
          method: editingServiceId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
        token || undefined,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || "Error al guardar servicio.",
        );
      }

      await fetchServices(booking.id_booking);
      toast.success(
        editingServiceId ? "Servicio actualizado!" : "Servicio agregado!",
      );

      setEditingServiceId(null);
      setIsFormVisible(false);
      setFormData({
        type: "",
        description: "",
        sale_price: 0,
        cost_price: 0,
        destination: "",
        reference: "",
        tax_21: 0,
        tax_105: 0,
        exempt: 0,
        other_taxes: 0,
        card_interest: 0,
        card_interest_21: 0,
        currency: "ARS",
        id_operator: 0,
        departure_date: "",
        return_date: "",
      });
      setBillingData({
        nonComputable: 0,
        taxableBase21: 0,
        taxableBase10_5: 0,
        commissionExempt: 0,
        commission21: 0,
        commission10_5: 0,
        vatOnCommission21: 0,
        vatOnCommission10_5: 0,
        totalCommissionWithoutVAT: 0,
        impIVA: 0,
        taxableCardInterest: 0,
        vatOnCardInterest: 0,
        transferFeeAmount: 0,
        transferFeePct: 0.024,
        extraCostsAmount: 0,
        extraTaxesAmount: 0,
        extraAdjustments: [],
      });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Error al guardar servicio.");
    }
  };

  const deleteService = async (serviceId: number) => {
    try {
      const res = await authFetch(
        `/api/services/${serviceId}`,
        { method: "DELETE" },
        token || undefined,
      );
      if (!res.ok) throw new Error("Error al eliminar servicio.");
      setServices((prev) => prev.filter((s) => s.id_service !== serviceId));
      toast.success("Servicio eliminado.");
    } catch {
      toast.error("No se pudo eliminar.");
    }
  };

  const formatDate = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleDateString("es-AR", { timeZone: "UTC" })
      : "N/A";

  const handleBookingUpdated = (updated: Booking) => setBooking(updated);
  const handleCreditNoteCreated = () => {
    if (invoices.length) void fetchCreditNotes(invoices);
  };

  const handleInvoiceUpdated = useCallback((updated: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id_invoice === updated.id_invoice
          ? { ...inv, payloadAfip: updated.payloadAfip }
          : inv,
      ),
    );
  }, []);

  const userRole = (role as Role) || "";

  return (
    <ProtectedRoute>
      {!token ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <ServicesContainer
          token={token}
          booking={booking}
          services={services}
          availableServices={services}
          operators={operators}
          invoices={invoices}
          receipts={receipts}
          creditNotes={creditNotes}
          onReceiptCreated={handleReceiptCreated}
          onReceiptDeleted={handleReceiptDeleted}
          onCreditNoteCreated={handleCreditNoteCreated}
          onInvoiceUpdated={handleInvoiceUpdated}
          invoiceFormData={invoiceFormData}
          formData={formData}
          editingServiceId={editingServiceId}
          expandedServiceId={expandedServiceId}
          loading={loading}
          isFormVisible={isFormVisible}
          isBillingFormVisible={isBillingFormVisible}
          handleChange={handleChange}
          handleInvoiceChange={handleInvoiceChange}
          updateFormData={updateInvoiceFormData}
          handleInvoiceSubmit={handleInvoiceSubmit}
          handleSubmit={handleSubmitService}
          deleteService={deleteService}
          formatDate={formatDate}
          setEditingServiceId={setEditingServiceId}
          setIsFormVisible={setIsFormVisible}
          setFormData={setFormData}
          setExpandedServiceId={setExpandedServiceId}
          setIsBillingFormVisible={setIsBillingFormVisible}
          isSubmitting={invoiceLoading}
          onBillingUpdate={handleBillingUpdate}
          role={userRole}
          onBookingUpdated={handleBookingUpdated}
          creditNoteFormData={creditNoteFormData}
          handleCreditNoteChange={handleCreditNoteChange}
          updateCreditNoteFormData={updateCreditNoteFormData}
          handleCreditNoteSubmit={handleCreditNoteSubmit}
          isCreditNoteSubmitting={isCreditNoteSubmitting}
        />
      )}
    </ProtectedRoute>
  );
}
