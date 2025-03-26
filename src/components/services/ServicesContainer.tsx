// src/components/services/ServicesContainer.tsx

"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { ToastContainer } from "react-toastify";
import ServiceForm from "@/components/services/ServiceForm";
import ServiceList from "@/components/services/ServiceList";
import InvoiceForm, {
  InvoiceFormData,
} from "@/components/invoices/InvoiceForm";
import InvoiceList from "@/components/invoices/InvoiceList";
import Spinner from "@/components/Spinner";
import { Booking, Service, Operator, Invoice } from "@/types";

export type ServiceFormData = {
  type: string;
  description: string;
  sale_price: number;
  cost_price: number;
  destination: string;
  reference: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

interface ServicesContainerProps {
  booking: Booking | null;
  services: Service[];
  operators: Operator[];
  invoices: Invoice[];
  invoiceFormData: InvoiceFormData;
  formData: ServiceFormData;
  editingServiceId: number | null;
  expandedServiceId: number | null;
  loading: boolean;
  isFormVisible: boolean;
  isInvoiceFormVisible: boolean;
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  handleInvoiceChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  updateFormData: (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData],
  ) => void;
  handleInvoiceSubmit: (e: React.FormEvent) => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  deleteService: (serviceId: number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  setEditingServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setFormData: React.Dispatch<React.SetStateAction<ServiceFormData>>;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsInvoiceFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmitting: boolean;
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
  isSubmitting,
}: ServicesContainerProps) {
  if (!loading && !booking) {
    return (
      <div className="flex size-64 flex-col items-center justify-center">
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
        <div className="flex min-h-[90vh] w-full items-center">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mb-6">
            <Link
              href={"/bookings"}
              className="block w-fit rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            >
              Volver
            </Link>
          </div>
          {booking && (
            <div className="mb-6 space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black dark:text-white">
              <div className="mb-4 flex justify-between">
                <h1 className="text-2xl font-semibold dark:font-medium">
                  Reserva
                </h1>
                <p className="text-xl font-light">{booking.id_booking}</p>
              </div>
              <p className="font-semibold dark:font-medium">
                Detalle
                <span className="ml-2 font-light">
                  {booking.details || "N/A"}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Estado
                <span className="ml-2 font-light">{booking.status || "-"}</span>
              </p>
              <p className="font-semibold dark:font-medium">
                Vendedor
                <span className="ml-2 font-light">
                  {booking.user.first_name} {booking.user.last_name}
                </span>
              </p>
              <p className="font-semibold dark:font-medium">
                Titular
                <span className="ml-2 font-light">
                  {booking.titular.first_name} {booking.titular.last_name}
                </span>
              </p>
              <div>
                <p className="font-semibold dark:font-medium">
                  Agencia
                  <span className="ml-2 font-light">
                    {booking.agency.name || "N/A"}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Salida
                  <span className="ml-2 font-light">
                    {formatDate(booking.departure_date)}
                  </span>
                </p>
                <p className="font-semibold dark:font-medium">
                  Fecha de Regreso
                  <span className="ml-2 font-light">
                    {formatDate(booking.return_date)}
                  </span>
                </p>
              </div>
              <p className="mt-4 font-semibold dark:font-medium">
                Pasajeros{" "}
                <span className="font-light">{`( ${booking.pax_count} )`}</span>
              </p>
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
              <p className="mt-4 font-semibold dark:font-medium">Facturacion</p>
              <ul className="ml-4 list-disc">
                <li>
                  <p className="font-light">
                    {booking.invoice_type || "Sin observaciones"}
                  </p>
                </li>
                <li>
                  <p className="font-light">
                    {`${booking.invoice_observation}` || "Sin observaciones"}
                  </p>
                </li>
              </ul>
              <p className="mt-4 font-semibold dark:font-medium">
                Observaciones de administracion
              </p>
              <p className="font-light">
                {booking.observation || "Sin observaciones"}
              </p>
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
              <h2 className="mb-4 mt-8 text-xl font-semibold dark:font-medium">
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
              <h2 className="mb-4 mt-8 text-xl font-semibold dark:font-medium">
                Factura
              </h2>
              <InvoiceForm
                formData={invoiceFormData}
                handleChange={handleInvoiceChange}
                handleSubmit={handleInvoiceSubmit}
                isFormVisible={isInvoiceFormVisible}
                setIsFormVisible={setIsInvoiceFormVisible}
                updateFormData={updateFormData}
                isSubmitting={isSubmitting}
              />
              {invoices.length > 0 && <InvoiceList invoices={invoices} />}
            </>
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </motion.div>
  );
}
