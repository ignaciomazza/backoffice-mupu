// src/app/bookings/services/[id]/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { Booking, Service, Operator } from "@/types";
import ServiceForm from "@/components/services/ServiceForm";
import ServiceList from "@/components/services/ServiceList";

type ServiceFormData = {
  type: string;
  description?: string;
  sale_price: number;
  cost_price: number;
  destination?: string;
  reference?: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  not_computable?: number;
  taxable_21?: number;
  taxable_105?: number;
  currency: string;
  payment_due_date: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

export default function ServicesPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;

  const [services, setServices] = useState<Service[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
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
    currency: "USD",
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

  useEffect(() => {
    if (id) {
      setLoading(true);
      fetch(`/api/bookings/${id}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error("Error al obtener la reserva");
          }
          return res.json();
        })
        .then((data) => setBooking(data))
        .catch((err) => {
          console.error("Error fetching booking:", err);
          toast.error("Error al obtener la reserva.");
        })
        .finally(() => setLoading(false));

      fetch(`/api/services?bookingId=${id}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error("Error al obtener los servicios");
          }
          return res.json();
        })
        .then(({ services }) => setServices(services))
        .catch((err) => {
          console.error("Error fetching services:", err);
          toast.error("Error al obtener los servicios.");
        });
    }
  }, [id]);

  useEffect(() => {
    fetch("/api/operators")
      .then((res) => res.json())
      .then((data) => setOperators(data))
      .catch((error) => console.error("Error fetching operators:", error));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type || !formData.currency || !id) {
      toast.error("Por favor, completa todos los campos obligatorios.");
      return;
    }

    try {
      const url = editingServiceId
        ? `/api/services/${editingServiceId}`
        : "/api/services";
      const method = editingServiceId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, booking_id: id }),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(
          errorResponse.error || "Error al agregar/actualizar el servicio."
        );
      }

      // Refetch services to ensure data consistency
      const updatedServicesResponse = await fetch(
        `/api/services?bookingId=${id}`
      );
      if (!updatedServicesResponse.ok) {
        throw new Error("Error al actualizar la lista de servicios.");
      }

      const updatedServices = await updatedServicesResponse.json();

      // Update the state with the new list of services
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
        currency: "USD",
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

  const deleteService = async (id: number) => {
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Error al eliminar el servicio.");
      }

      setServices((prevServices) =>
        prevServices.filter((service) => service.id_service !== id)
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
    return date.toLocaleDateString("es-AR", {
      timeZone: "UTC",
    });
  };

  return (
    <motion.div>
      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          <div className="mb-6">
            <button className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black">
              <Link href={"/bookings"}>Volver</Link>
            </button>
          </div>
          {booking && (
            <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-white h-fit mb-6">
              <div className="flex justify-between mb-4">
                <h1 className="text-2xl font-semibold dark:font-medium">
                  Reserva
                </h1>
                <p className="text-xl font-light">
                  {booking.id_booking}
                </p>
              </div>
              <p className="font-semibold dark:font-medium">
                Detalle
                <span className="font-light ml-2">
                  {booking.details || "N/A"}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Estado
                <span className="font-light ml-2">{booking.status || "-"}</span>
              </p>
              <p className="font-semibold dark:font-medium">
                Vendedor
                <span className="font-light ml-2">
                  {booking.user.first_name} {booking.user.last_name}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Titular
                <span className="font-light ml-2">
                  {booking.titular.first_name} {booking.titular.last_name}
                </span>
              </p>

              <div>
                <p className="font-semibold dark:font-medium">
                  Agencia
                  <span className="font-light ml-2">
                    {booking.agency.name || "N/A"}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Salida
                  <span className="font-light ml-2">
                    {formatDate(booking.departure_date)}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Regreso
                  <span className="font-light ml-2">{formatDate(booking.return_date)}</span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Pasajeros
                  <span className="font-light ml-2">{booking.pax_count}</span>
                </p>

                <p className="font-semibold dark:font-medium mt-4">Pasajeros</p>
                <ul className="ml-4 list-disc">
                  <li>
                    {booking.titular.first_name} {booking.titular.last_name}
                  </li>
                  {booking.clients.map((client) => (
                    <li key={client.id_client}>
                      {client.first_name} {client.last_name}
                    </li>
                  ))}
                </ul>
                <p className="font-semibold dark:font-medium mt-4">Observaciones</p>
                <p className="font-light">
                  {booking.observation || "Sin observaciones"}
                </p>
              </div>
            </div>
          )}

          <ServiceForm
            formData={formData}
            operators={operators}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingServiceId={editingServiceId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
          />

          <h2 className="text-xl font-semibold dark:font-medium mt-8 mb-4">Servicios Agregados</h2>
          <ServiceList
            services={services}
            expandedServiceId={expandedServiceId}
            setExpandedServiceId={setExpandedServiceId}
            startEditingService={(service) => {
              setEditingServiceId(service.id_service);
              setFormData({
                ...service,
                payment_due_date: service.payment_due_date
                  ? new Date(service.payment_due_date)
                      .toISOString()
                      .split("T")[0]
                  : "",
                departure_date: service.departure_date
                  ? new Date(service.departure_date).toISOString().split("T")[0]
                  : "",
                return_date: service.return_date
                  ? new Date(service.return_date).toISOString().split("T")[0]
                  : "",
                id_operator: service.id_operator || 0,
              });
              setIsFormVisible(true);
            }}
            deleteService={deleteService}
          />
        </>
      )}
      <ToastContainer />
    </motion.div>
  );
}
