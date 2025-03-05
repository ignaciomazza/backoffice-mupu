// src/app/bookings/services/[id]/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, Service, Operator, Invoice } from "@/types";
import ServicesContainer, {
  ServiceFormData,
} from "@/components/services/ServicesContainer";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function ServicesPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceFormData, setInvoiceFormData] = useState({
    tipoFactura: "",
    clientIds: [] as string[],
    services: [] as string[],
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
    not_computable: 0,
    taxable_21: 0,
    taxable_105: 0,
    currency: "ARS",
    payment_due_date: "",
    id_operator: 0,
    departure_date: "",
    return_date: "",
  });
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isInvoiceFormVisible, setIsInvoiceFormVisible] = useState(false);

  // Función para obtener la reserva
  const fetchBooking = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/bookings/${id}`);
      if (!res.ok) {
        throw new Error("Error al obtener la reserva");
      }
      const data = await res.json();
      setBooking(data);
    } catch (err) {
      console.error("Error fetching booking:", err);
      toast.error("Error al obtener la reserva.");
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener los servicios
  const fetchServices = async () => {
    try {
      const res = await fetch(`/api/services?bookingId=${id}`);
      if (!res.ok) {
        throw new Error("Error al obtener los servicios");
      }
      const data = await res.json();
      setServices(data.services);
    } catch (err) {
      console.error("Error fetching services:", err);
      toast.error("Error al obtener los servicios.");
    }
  };

  // Función para obtener las facturas
  const fetchInvoices = async () => {
    try {
      const res = await fetch(`/api/invoices?bookingId=${id}`);
      if (!res.ok) {
        if (res.status === 405) {
          setInvoices([]);
          return;
        }
        throw new Error("Error al obtener las facturas");
      }
      const data = await res.json();
      setInvoices(data.invoices);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      toast.error("Error al obtener las facturas.");
      setInvoices([]);
    }
  };

  // Función para obtener operadores
  const fetchOperators = async () => {
    try {
      const res = await fetch("/api/operators");
      if (!res.ok) {
        throw new Error("Error al obtener operadores");
      }
      const data = await res.json();
      setOperators(data);
    } catch (err) {
      console.error("Error fetching operators:", err);
      toast.error("Error al obtener operadores.");
    }
  };

  useEffect(() => {
    if (id) {
      fetchBooking();
      fetchServices();
      fetchInvoices();
    }
  }, [id]);

  useEffect(() => {
    fetchOperators();
  }, []);

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
        "not_computable",
        "taxable_21",
        "taxable_105",
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

  const updateFormData = (key: string, value: any) => {
    setInvoiceFormData((prev) => ({ ...prev, [key]: value }));
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
    } catch (err) {
      console.error("Invoice submission error:", err);
      toast.error("Error de conexión con el servidor.");
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
      const res = await fetch(url, {
        method: editingServiceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, booking_id: id }),
      });
      if (!res.ok) {
        const errorResponse = await res.json();
        throw new Error(
          errorResponse.error || "Error al agregar/actualizar el servicio."
        );
      }
      const updatedServicesResponse = await fetch(
        `/api/services?bookingId=${id}`
      );
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
        not_computable: 0,
        taxable_21: 0,
        taxable_105: 0,
        currency: "ARS",
        payment_due_date: "",
        id_operator: 0,
        departure_date: "",
        return_date: "",
      });
    } catch (error: any) {
      console.error("Error al enviar el formulario:", error.message);
      toast.error(error.message || "Error inesperado.");
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
    } catch (error) {
      console.error("Error al eliminar el servicio:", error);
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
      />
    </ProtectedRoute>
  );
}
