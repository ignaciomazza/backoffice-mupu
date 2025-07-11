// src/app/bookings/services/[id]/page.tsx

"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, Service, Operator, Invoice, Receipt } from "@/types";
import ServicesContainer, {
  ServiceFormData,
} from "@/components/services/ServicesContainer";
import { InvoiceFormData } from "@/components/invoices/InvoiceForm";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import { CreditNoteFormData } from "@/components/credite-notes/CreditNoteForm";

interface UserProfile {
  role: string;
}

type Role =
  | "desarrollador"
  | "gerente"
  | "equipo"
  | "vendedor"
  | "administrativo"
  | "marketing";

export default function ServicesPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteWithItems[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
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

  const [billingData, setBillingData] = useState<{
    nonComputable: number;
    taxableBase21: number;
    taxableBase10_5: number;
    commissionExempt: number;
    commission21: number;
    commission10_5: number;
    vatOnCommission21: number;
    vatOnCommission10_5: number;
    totalCommissionWithoutVAT: number;
    impIVA: number;
    taxableCardInterest: number;
    vatOnCardInterest: number;
  }>({
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

  const handleBillingUpdate = useCallback((data: typeof billingData) => {
    setBillingData(data);
  }, []);

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/bookings/${id}`);
      if (!res.ok) throw new Error("Error al obtener la reserva");
      const data = await res.json();
      setBooking(data);
    } catch {
      toast.error("Error al obtener la reserva.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/services?bookingId=${id}`);
      if (!res.ok) throw new Error("Error al obtener los servicios");
      const data = await res.json();
      setServices(data.services);
    } catch {
      toast.error("Error al obtener los servicios.");
    }
  }, [id]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?bookingId=${id}`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setInvoices([]);
          return;
        }
        throw new Error("Error al obtener las facturas");
      }
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    }
  }, [id]);

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await fetch(`/api/receipts?bookingId=${id}`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setReceipts([]);
          return;
        }
        throw new Error("Error al obtener los recibos");
      }
      const data = await res.json();
      setReceipts(data.receipts || []);
    } catch {
      setReceipts([]);
    }
  }, [id]);

  const fetchCreditNotes = useCallback(async () => {
    try {
      // reunimos todas las llamadas por factura
      const all = await Promise.all(
        invoices.map((inv) =>
          fetch(`/api/credit-notes?invoiceId=${inv.id_invoice}`)
            .then((r) => (r.ok ? r.json() : { creditNotes: [] }))
            .then((data) => data.creditNotes as CreditNoteWithItems[]),
        ),
      );
      // aplanamos
      setCreditNotes(all.flat());
    } catch {
      setCreditNotes([]);
    }
  }, [invoices]);

  const handleReceiptCreated = () => {
    fetchReceipts();
  };

  const fetchOperators = useCallback(async () => {
    try {
      const res = await fetch("/api/operators");
      if (!res.ok) throw new Error("Error al obtener operadores");
      const data = await res.json();
      setOperators(data);
    } catch {
      toast.error("Error al obtener operadores.");
    }
  }, []);

  const handleReceiptDeleted = (id_receipt: number) => {
    setReceipts((prev) => prev.filter((r) => r.id_receipt !== id_receipt));
  };

  useEffect(() => {
    if (!token) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error("Error al obtener el perfil");
        const data = await res.json();
        setUserProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [token]);

  const userRole = (userProfile?.role?.toLowerCase() as Role) || undefined;

  useEffect(() => {
    if (id) {
      fetchBooking();
      fetchServices();
      fetchInvoices();
      fetchReceipts();
    }
  }, [id, fetchBooking, fetchServices, fetchInvoices, fetchReceipts]);

  useEffect(() => {
    if (invoices.length) fetchCreditNotes();
  }, [invoices, fetchCreditNotes]);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  useEffect(() => {
    if (booking) {
      setFormData((prev) => ({
        ...prev,
        departure_date: booking.departure_date
          ? new Date(booking.departure_date).toISOString().slice(0, 10)
          : "",
        return_date: booking.return_date
          ? new Date(booking.return_date).toISOString().slice(0, 10)
          : "",
      }));
    }
  }, [booking]);

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
    setCreditNoteFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

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
    setCreditNoteFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
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
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Error al crear factura.");
      }
      const result = await res.json();
      if (result.success) {
        setInvoices((prev) => [...prev, ...result.invoices]);
        toast.success("Factura creada exitosamente!");
      } else {
        toast.error(result.message || "Error al crear factura.");
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Error servidor.");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleCreditNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // validación mínima
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
      const res = await fetch("/api/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al crear nota de crédito.");
      }
      const result = await res.json();
      if (result.success) {
        toast.success("Nota de crédito creada exitosamente!");
        // refrescar lista de notas de crédito
        handleCreditNoteCreated();
        // opcional: limpiar formulario
        setCreditNoteFormData({
          invoiceId: "",
          tipoNota: "",
          exchangeRate: "",
          invoiceDate: "",
        });
        setIsCreditNoteFormVisible(false);
      } else {
        toast.error(result.message || "Error al crear nota de crédito.");
      }
    } catch (error: unknown) {
      // aquí tipeamos como unknown y comprobamos
      const msg = error instanceof Error ? error.message : "Error de servidor.";
      toast.error(msg);
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
      const payload = { ...formData, booking_id: id, ...billingData };
      const res = await fetch(url, {
        method: editingServiceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar servicio.");
      }
      const updated = await fetch(`/api/services?bookingId=${id}`);
      const data = await updated.json();
      setServices(data.services);
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
      });
    } catch (err: unknown) {
      toast.error((err as Error).message || "Error al guardar servicio.");
    }
  };

  const deleteService = async (serviceId: number) => {
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar servicio.");
      setServices((prev) => prev.filter((s) => s.id_service !== serviceId));
      toast.success("Servicio eliminado.");
    } catch {
      toast.error("No se pudo eliminar.");
    }
  };

  const formatDate = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleDateString("es-AR", {
          timeZone: "UTC",
        })
      : "N/A";

  const handleBookingUpdated = (updated: Booking) => {
    setBooking(updated);
  };

  const handleCreditNoteCreated = () => fetchCreditNotes();

  return (
    <ProtectedRoute>
      <ServicesContainer
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
    </ProtectedRoute>
  );
}
