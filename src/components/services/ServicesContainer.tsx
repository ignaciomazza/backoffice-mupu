// src/components/services/ServicesContainer.tsx

"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import ServiceForm from "@/components/services/ServiceForm";
import ServiceList from "@/components/services/ServiceList";
import InvoiceForm, {
  InvoiceFormData,
} from "@/components/invoices/InvoiceForm";
import InvoiceList from "@/components/invoices/InvoiceList";
import Spinner from "@/components/Spinner";
import { Booking, Service, Operator, Invoice, Receipt } from "@/types";
import ReceiptForm from "@/components/receipts/ReceiptForm";
import ReceiptList from "@/components/receipts/ReceiptList";
import { useEffect, useState } from "react";

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
  card_interest?: number;
  card_interest_21?: number;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

interface BillingData {
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
}

interface ServicesContainerProps {
  booking: Booking | null;
  services: Service[];
  availableServices: Service[];
  operators: Operator[];
  invoices: Invoice[];
  receipts: Receipt[];
  onReceiptCreated?: (r: Receipt) => void;
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
  onBillingUpdate?: (data: BillingData) => void;
  role: string;
  onBookingUpdated?: (updated: Booking) => void;
}

export default function ServicesContainer({
  booking,
  services,
  availableServices,
  operators,
  invoices,
  receipts,
  onReceiptCreated,
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
  onBillingUpdate,
  role,
  onBookingUpdated,
}: ServicesContainerProps) {
  // 1) Hooks siempre se ejecutan
  const [selectedStatus, setSelectedStatus] = useState("Pendiente");
  useEffect(() => {
    if (booking?.status) {
      setSelectedStatus(booking.status);
    }
  }, [booking]);

  // 2) Luego el return condicional
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

  const handleSaveStatus = async () => {
    if (!booking) return;
    try {
      const res = await fetch(`/api/bookings/${booking.id_booking}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // todos los campos obligatorios del PUT original,
          // pero cambiando sólo “status”
          status: selectedStatus,
          details: booking.details,
          invoice_type: booking.invoice_type,
          invoice_observation: booking.invoice_observation,
          observation: booking.observation,
          titular_id: booking.titular.id_client,
          id_agency: booking.agency.id_agency,
          departure_date: booking.departure_date,
          return_date: booking.return_date,
          pax_count: booking.pax_count,
          clients_ids: booking.clients.map((c) => c.id_client),
          id_user: booking.user.id_user,
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      toast.success("Estado actualizado!");
      // Si querés refrescar el booking en el padre:
      onBookingUpdated?.(updated);
    } catch {
      toast.error("No se pudo actualizar el estado.");
    }
  };

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
              href="/bookings"
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
              <p className="mt-4 font-semibold dark:font-medium">Facturación</p>
              <ul className="ml-4 list-disc">
                <li>
                  <p className="font-light">
                    {booking.invoice_type || "Sin observaciones"}
                  </p>
                </li>
                <li>
                  <p className="font-light">
                    {booking.invoice_observation || "Sin observaciones"}
                  </p>
                </li>
              </ul>
              <p className="mt-4 font-semibold dark:font-medium">
                Observaciones de administración
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
                onBillingUpdate={onBillingUpdate}
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
                    card_interest: service.card_interest || 0,
                    card_interest_21: service.card_interest_21 || 0,
                  });
                  setIsFormVisible(true);
                }}
                deleteService={deleteService}
              />

              {(role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <div>
                  <h2 className="mb-4 mt-8 text-xl font-semibold dark:font-medium">
                    Recibo
                  </h2>
                  <ReceiptForm booking={booking} onCreated={onReceiptCreated} />
                  {receipts.length > 0 && <ReceiptList receipts={receipts} />}
                </div>
              )}

              {(role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <div>
                  <h2 className="mb-4 mt-8 text-xl font-semibold dark:font-medium">
                    Factura
                  </h2>
                  <InvoiceForm
                    formData={invoiceFormData}
                    availableServices={availableServices}
                    handleChange={handleInvoiceChange}
                    handleSubmit={handleInvoiceSubmit}
                    isFormVisible={isInvoiceFormVisible}
                    setIsFormVisible={setIsInvoiceFormVisible}
                    updateFormData={updateFormData}
                    isSubmitting={isSubmitting}
                  />
                  {invoices.length > 0 && <InvoiceList invoices={invoices} />}
                </div>
              )}

              {(role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <div className="my-8">
                  <h2 className="mb-4 text-xl font-semibold dark:font-medium">
                    Estado
                  </h2>
                  <div className="flex w-full items-center rounded-3xl text-center text-black shadow-md dark:border dark:border-white/50 dark:text-white">
                    {["Pendiente", "Pago", "Facturado"].map((st, i) => (
                      <div
                        key={st}
                        onClick={() => setSelectedStatus(st)}
                        className={`basis-1/4 p-4 font-light tracking-wide hover:cursor-pointer md:p-6 ${i === 0 ? "rounded-l-3xl" : ""} ${i === 1 ? "border-x border-black/20 dark:border-white/20" : ""} ${
                          selectedStatus === st
                            ? "bg-black/5 dark:bg-white/5"
                            : ""
                        } `}
                      >
                        {st}
                      </div>
                    ))}
                    <button
                      onClick={handleSaveStatus}
                      className="mx-4 basis-1/4 rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black md:mx-6"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}
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
