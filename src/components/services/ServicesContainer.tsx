// src/components/services/ServicesContainer.tsx

"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { ToastContainer } from "react-toastify";
import ServiceForm from "@/components/services/ServiceForm";
import ServiceList from "@/components/services/ServiceList";
import InvoiceForm from "@/components/invoices/InvoiceForm";
import InvoiceList from "@/components/invoices/InvoiceList";
import Spinner from "@/components/Spinner";
import { Booking, Service, Operator, Invoice } from "@/types";

export type ServiceFormData = {
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

interface ServicesContainerProps {
  booking: Booking | null;
  services: Service[];
  operators: Operator[];
  invoices: Invoice[];
  invoiceFormData: {
    tipoFactura: string;
    clientIds: string[];
    services: string[];
    exchangeRate: string;
  };
  formData: ServiceFormData;
  editingServiceId: number | null;
  expandedServiceId: number | null;
  loading: boolean;
  isFormVisible: boolean;
  isInvoiceFormVisible: boolean;
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void;
  handleInvoiceChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  updateFormData: (key: string, value: any) => void;
  handleInvoiceSubmit: (e: React.FormEvent) => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  deleteService: (serviceId: number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  setEditingServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setFormData: React.Dispatch<React.SetStateAction<ServiceFormData>>;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsInvoiceFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ServicesContainer({
  booking,
  services,
  operators,
  invoices,
  invoiceFormData,
  formData,
  editingServiceId,
  expandedServiceId,
  loading,
  isFormVisible,
  isInvoiceFormVisible,
  handleChange,
  handleInvoiceChange,
  updateFormData,
  handleInvoiceSubmit,
  handleSubmit,
  deleteService,
  formatDate,
  setEditingServiceId,
  setIsFormVisible,
  setFormData,
  setExpandedServiceId,
  setIsInvoiceFormVisible,
}: ServicesContainerProps) {
  // Si ya terminó la carga pero no se obtuvo la reserva, mostramos un fallback
  if (!loading && !booking) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Spinner />
        <p className="mt-4 text-center dark:text-white">
          No se encontraron datos de la reserva.
        </p>
      </div>
    );
  }

  return (
    <motion.div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mb-6">
            <button className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black">
              <Link href={"/bookings"}>Volver</Link>
            </button>
          </div>
          {booking && (
            <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-4 mb-6 dark:border dark:border-white">
              <div className="flex justify-between mb-4">
                <h1 className="text-2xl font-semibold dark:font-medium">
                  Reserva
                </h1>
                <p className="text-xl font-light">{booking.id_booking}</p>
              </div>
              <p className="font-semibold dark:font-medium">
                Detalle{" "}
                <span className="font-light ml-2">
                  {booking.details || "N/A"}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Estado{" "}
                <span className="font-light ml-2">{booking.status || "-"}</span>
              </p>
              <p className="font-semibold dark:font-medium">
                Vendedor{" "}
                <span className="font-light ml-2">
                  {booking.user.first_name} {booking.user.last_name}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Titular{" "}
                <span className="font-light ml-2">
                  {booking.titular.first_name} {booking.titular.last_name}
                </span>
              </p>
              <div>
                <p className="font-semibold dark:font-medium">
                  Agencia{" "}
                  <span className="font-light ml-2">
                    {booking.agency.name || "N/A"}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Salida{" "}
                  <span className="font-light ml-2">
                    {formatDate(booking.departure_date)}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Regreso{" "}
                  <span className="font-light ml-2">
                    {formatDate(booking.return_date)}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Pasajeros{" "}
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
                <p className="font-semibold dark:font-medium mt-4">
                  Observaciones
                </p>
                <p className="font-light">
                  {booking.observation || "Sin observaciones"}
                </p>
              </div>
            </div>
          )}
          {booking ? (
            <>
              <ServiceForm
                formData={formData}
                operators={operators}
                handleChange={handleChange}
                handleSubmit={handleSubmit}
                editingServiceId={editingServiceId}
                isFormVisible={isFormVisible}
                setIsFormVisible={setIsFormVisible}
              />
              <h2 className="text-xl font-semibold dark:font-medium mt-8 mb-4">
                Servicios Agregados
              </h2>
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
                      ? new Date(service.departure_date)
                          .toISOString()
                          .split("T")[0]
                      : "",
                    return_date: service.return_date
                      ? new Date(service.return_date)
                          .toISOString()
                          .split("T")[0]
                      : "",
                    id_operator: service.id_operator || 0,
                  });
                  setIsFormVisible(true);
                }}
                deleteService={deleteService}
              />
              <h2 className="text-xl font-semibold dark:font-medium mt-8 mb-4">
                Factura
              </h2>
              <InvoiceForm
                formData={invoiceFormData}
                handleChange={handleInvoiceChange}
                handleSubmit={handleInvoiceSubmit}
                isFormVisible={isInvoiceFormVisible}
                setIsFormVisible={setIsInvoiceFormVisible}
                updateFormData={updateFormData}
              />
              {invoices.length > 0 && <InvoiceList invoices={invoices} />}
            </>
          ) : (
            <div className="flex justify-center items-center h-40">
              <Spinner />
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </motion.div>
  );
}
