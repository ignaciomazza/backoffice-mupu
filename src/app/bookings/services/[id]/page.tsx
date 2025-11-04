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
import { CreditNoteFormData } from "@/components/credite-notes/CreditNoteForm";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";

type Role =
  | "desarrollador"
  | "gerente"
  | "equipo"
  | "vendedor"
  | "administrativo"
  | "marketing";

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
  });

  const [creditNoteFormData, setCreditNoteFormData] =
    useState<CreditNoteFormData>({
      invoiceId: "",
      tipoNota: "",
      exchangeRate: "",
      invoiceDate: "",
    });

  const [isCreditNoteFormVisible, setIsCreditNoteFormVisible] = useState(false);
  const [isCreditNoteSubmitting, setIsCreditNoteSubmitting] = useState(false);

  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isInvoiceFormVisible, setIsInvoiceFormVisible] = useState(false);
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
    async (bookingId: string, signal?: AbortSignal) => {
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
    async (bookingId: string, signal?: AbortSignal) => {
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
    async (bookingId: string, signal?: AbortSignal) => {
      if (!token) return [];
      const res = await authFetch(
        `/api/receipts?bookingId=${bookingId}`,
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
      const data = await res.json();
      const items: Receipt[] = Array.isArray(data?.receipts)
        ? (data.receipts as Receipt[])
        : [];
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
        await fetchServices(id, ac.signal);

        // 3) Invoices → Credit notes
        const invs = await fetchInvoices(id, ac.signal);
        await fetchCreditNotes(invs, ac.signal);

        // 4) Receipts
        await fetchReceipts(id, ac.signal);

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

  // Rol: intenta /api/role y si da 404, cae a /api/user/profile
  useEffect(() => {
    if (!token) return;
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

  /* ============================ HANDLERS ============================ */

  const handleReceiptCreated = () => {
    if (id) void fetchReceipts(id);
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

  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !invoiceFormData.tipoFactura ||
      invoiceFormData.clientIds.length === 0 ||
      invoiceFormData.services.length === 0
    ) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    const payload = {
      bookingId: Number(id),
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
    };

    setInvoiceLoading(true);
    try {
      const res = await authFetch(
        "/api/invoices",
        { method: "POST", body: JSON.stringify(payload) },
        token || undefined,
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(
          (error as { message?: string }).message || "Error al crear factura.",
        );
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
          (result as { message?: string }).message || "Error al crear factura.",
        );
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Error servidor.");
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

    const payload = {
      invoiceId: Number(creditNoteFormData.invoiceId),
      tipoNota: parseInt(creditNoteFormData.tipoNota, 10),
      exchangeRate: creditNoteFormData.exchangeRate
        ? parseFloat(creditNoteFormData.exchangeRate)
        : undefined,
      invoiceDate: creditNoteFormData.invoiceDate || undefined,
    };

    setIsCreditNoteSubmitting(true);
    try {
      const res = await authFetch(
        "/api/credit-notes",
        { method: "POST", body: JSON.stringify(payload) },
        token || undefined,
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          (err as { message?: string }).message ||
            "Error al crear nota de crédito.",
        );
      }
      const result = await res.json();
      if ((result as { success?: boolean }).success) {
        toast.success("Nota de crédito creada exitosamente!");
        handleCreditNoteCreated();
        setCreditNoteFormData({
          invoiceId: "",
          tipoNota: "",
          exchangeRate: "",
          invoiceDate: "",
        });
        setIsCreditNoteFormVisible(false);
      } else {
        toast.error(
          (result as { message?: string }).message ||
            "Error al crear nota de crédito.",
        );
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Error de servidor.",
      );
    } finally {
      setIsCreditNoteSubmitting(false);
    }
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.type || !id) {
      toast.error("Completa los campos obligatorios.");
      return;
    }
    try {
      const url = editingServiceId
        ? `/api/services/${editingServiceId}`
        : "/api/services";

      const payload = {
        ...formData,
        booking_id: Number(id),
        ...billingData,
        transfer_fee_pct: billingData.transferFeePct,
        transfer_fee_amount: billingData.transferFeeAmount,
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

      await fetchServices(id);
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
          invoiceFormData={invoiceFormData}
          formData={formData}
          editingServiceId={editingServiceId}
          expandedServiceId={expandedServiceId}
          loading={loading}
          isFormVisible={isFormVisible}
          isInvoiceFormVisible={isInvoiceFormVisible}
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
          setIsInvoiceFormVisible={setIsInvoiceFormVisible}
          isSubmitting={invoiceLoading}
          onBillingUpdate={handleBillingUpdate}
          role={userRole}
          onBookingUpdated={handleBookingUpdated}
          creditNoteFormData={creditNoteFormData}
          isCreditNoteFormVisible={isCreditNoteFormVisible}
          setIsCreditNoteFormVisible={setIsCreditNoteFormVisible}
          handleCreditNoteChange={handleCreditNoteChange}
          updateCreditNoteFormData={updateCreditNoteFormData}
          handleCreditNoteSubmit={handleCreditNoteSubmit}
          isCreditNoteSubmitting={isCreditNoteSubmitting}
        />
      )}
    </ProtectedRoute>
  );
}
