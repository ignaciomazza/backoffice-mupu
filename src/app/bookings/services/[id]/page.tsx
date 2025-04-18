// src/app/bookings/services/[id]/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, Service, Operator, Invoice } from "@/types";
import ServicesContainer, {
  ServiceFormData,
} from "@/components/services/ServicesContainer";
import ProtectedRoute from "@/components/ProtectedRoute";

interface InvoiceFormData {
  tipoFactura: string;
  clientIds: string[];
  services: string[];
  exchangeRate?: string;
}

export default function ServicesPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
    tipoFactura: "",
    clientIds: [],
    services: [],
    exchangeRate: "",
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
    currency: "",
    id_operator: 0,
    departure_date: "",
    return_date: "",
  });
  // Nuevo estado para almacenar el desglose calculado (BillingBreakDown)
  const [billingData, setBillingData] = useState({
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
  });
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isInvoiceFormVisible, setIsInvoiceFormVisible] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/bookings/${id}`);
      if (!res.ok) {
        throw new Error("Error al obtener la reserva");
      }
      const data = await res.json();
      setBooking(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching booking:", err.message);
      }
      toast.error("Error al obtener la reserva.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/services?bookingId=${id}`);
      if (!res.ok) {
        throw new Error("Error al obtener los servicios");
      }
      const data = await res.json();
      setServices(data.services);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching services:", err.message);
      }
      toast.error("Error al obtener los servicios.");
    }
  }, [id]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?bookingId=${id}`);
      if (!res.ok) {
        if (res.status === 405 || res.status === 404) {
          setInvoices([]);
          return;
        }
        throw new Error("Error al obtener las facturas");
      }
      const data = await res.json();
      if (!data.invoices || data.invoices.length === 0) {
        setInvoices([]);
        return;
      }
      setInvoices(data.invoices);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching invoices:", err.message);
      }
      setInvoices([]);
    }
  }, [id]);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await fetch("/api/operators");
      if (!res.ok) {
        throw new Error("Error al obtener operadores");
      }
      const data = await res.json();
      setOperators(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching operators:", err.message);
      }
      toast.error("Error al obtener operadores.");
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchBooking();
      fetchServices();
      fetchInvoices();
    }
  }, [id, fetchBooking, fetchServices, fetchInvoices]);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  // Establece por defecto las fechas del formulario cuando se obtiene la reserva
  useEffect(() => {
    if (booking) {
      setFormData((prev) => ({
        ...prev,
        departure_date: booking.departure_date
          ? new Date(booking.departure_date).toISOString().split("T")[0]
          : "",
        return_date: booking.return_date
          ? new Date(booking.return_date).toISOString().split("T")[0]
          : "",
        payment_due_date: new Date().toISOString().split("T")[0],
      }));
    }
  }, [booking]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: [
        "sale_price",
        "cost_price",
        "tax_21",
        "tax_105",
        "exempt",
        "other_taxes",
      ].includes(name)
        ? parseFloat(value) || 0
        : value,
    }));
  };

  const handleInvoiceChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setInvoiceFormData((prev) => ({ ...prev, [name]: value }));
  };

  const updateFormData = (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData]
  ): void => {
    setInvoiceFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Callback para recibir datos de BillingBreakdown
  const handleBillingUpdate = (billingValues: typeof billingData) => {
    setBillingData(billingValues);
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
    };
    console.log("Enviando datos de factura:", payload);
    setInvoiceLoading(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorResponse = await res.json();
        throw new Error(errorResponse.error || "Error al crear la factura.");
      }
      const result = await res.json();
      if (result.success) {
        setInvoices((prev) => [
          ...prev,
          ...result.invoices.filter(
            (invoice: Invoice) => invoice && invoice.id_invoice
          ),
        ]);
        toast.success("Factura creada exitosamente!");
      } else {
        toast.error(result.message || "Error al crear la factura.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Invoice submission error:", err.message);
        toast.error(err.message || "Error de conexión con el servidor.");
      }
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.type || !id) {
      toast.error("Por favor, completa todos los campos obligatorios.");
      return;
    }
    try {
      const url = editingServiceId
        ? `/api/services/${editingServiceId}`
        : "/api/services";
      // Combinar formData y billingData en el payload
      const payload = { ...formData, booking_id: id, ...billingData };
      const res = await fetch(url, {
        method: editingServiceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorResponse = await res.json();
        throw new Error(
          errorResponse.error || "Error al agregar/actualizar el servicio."
        );
      }
      const updatedServicesResponse = await fetch(`/api/services?bookingId=${id}`);
      if (!updatedServicesResponse.ok) {
        throw new Error("Error al actualizar la lista de servicios.");
      }
      const updatedServices = await updatedServicesResponse.json();
      setServices(updatedServices.services);
      toast.success(
        editingServiceId
          ? "Servicio actualizado con éxito!"
          : "Servicio agregado con éxito!"
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
        currency: "ARS",
        id_operator: 0,
        departure_date: "",
        return_date: "",
      });
      // Reiniciar billingData (opcional)
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
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error al enviar el formulario:", err.message);
        toast.error(err.message || "Error inesperado.");
      }
    }
  };

  const deleteService = async (serviceId: number) => {
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Error al eliminar el servicio.");
      }
      setServices((prevServices) =>
        prevServices.filter((service) => service.id_service !== serviceId)
      );
      toast.success("Servicio eliminado con éxito.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error al eliminar el servicio:", err.message);
      }
      toast.error("No se pudo eliminar el servicio. Inténtalo nuevamente.");
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { timeZone: "UTC" });
  };

  return (
    <ProtectedRoute>
      <ServicesContainer
        booking={booking}
        services={services}
        operators={operators}
        invoices={invoices}
        invoiceFormData={invoiceFormData}
        formData={formData}
        editingServiceId={editingServiceId}
        expandedServiceId={expandedServiceId}
        loading={loading}
        isFormVisible={isFormVisible}
        isInvoiceFormVisible={isInvoiceFormVisible}
        handleChange={handleChange}
        handleInvoiceChange={handleInvoiceChange}
        updateFormData={updateFormData}
        handleInvoiceSubmit={handleInvoiceSubmit}
        handleSubmit={handleSubmit}
        deleteService={deleteService}
        formatDate={formatDate}
        setEditingServiceId={setEditingServiceId}
        setIsFormVisible={setIsFormVisible}
        setFormData={setFormData}
        setExpandedServiceId={setExpandedServiceId}
        setIsInvoiceFormVisible={setIsInvoiceFormVisible}
        isSubmitting={invoiceLoading}
        onBillingUpdate={handleBillingUpdate} 
      />
    </ProtectedRoute>
  );
}
