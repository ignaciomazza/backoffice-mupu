// src/components/bookings/BookingForm.tsx

import { ChangeEvent, FormEvent } from "react";
import { motion } from "framer-motion";

export interface BookingFormData {
  id_booking?: number;
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: string;
  invoice_observation: string;
  observation: string;
  titular_id: number;
  id_user: number;
  id_agency: number;
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
}

interface BookingFormProps {
  formData: BookingFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => Promise<void>;
  editingBookingId: number | null;
  isFormVisible: boolean;
  setFormData: React.Dispatch<React.SetStateAction<BookingFormData>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function BookingForm({
  formData,
  handleChange,
  handleSubmit,
  editingBookingId,
  setFormData,
  isFormVisible,
  setIsFormVisible,
}: BookingFormProps) {
  const formatIsoToDisplay = (iso: string): string => {
    if (!iso) return "";
    if (iso.includes("/")) return iso;
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatDisplayToIso = (display: string): string => {
    const parts = display.split("/");
    if (parts.length !== 3) return display;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    const digits = e.target.value.replace(/\D/g, "");
    let formatted = "";
    if (digits.length > 0) {
      formatted += digits.substring(0, 2);
      if (digits.length >= 3) {
        formatted += "/" + digits.substring(2, 4);
        if (digits.length >= 5) {
          formatted += "/" + digits.substring(4, 8);
        }
      }
    }
    const event = {
      target: { name, value: formatted },
    } as ChangeEvent<HTMLInputElement>;
    handleChange(event);
  };

  const handleDatePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData("text");
    const digits = pasteData.replace(/\D/g, "");
    if (digits.length === 8) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      const formatted = `${day}/${month}/${year}`;
      e.preventDefault();
      const event = {
        target: { name: e.currentTarget.name, value: formatted },
      } as ChangeEvent<HTMLInputElement>;
      handleChange(event);
    }
  };

  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const iso = formatDisplayToIso(value);
    const event = {
      target: { name, value: iso },
    } as ChangeEvent<HTMLInputElement>;
    handleChange(event);
  };

  const handleAcompananteChange = (index: number, value: string) => {
    const newId = Number(value);
    if (newId === formData.titular_id) {
      alert("El titular no puede ser incluido como acompañante.");
      return;
    }
    setFormData((prevData) => {
      const newClientsIds = [...prevData.clients_ids];
      newClientsIds[index] = newId;
      return { ...prevData, clients_ids: newClientsIds };
    });
  };

  const handleIncrement = () => {
    const newPaxCount = formData.pax_count + 1;
    setFormData((prevData) => ({
      ...prevData,
      pax_count: newPaxCount,
      clients_ids: Array(newPaxCount - 1).fill(""),
    }));
  };

  const handleDecrement = () => {
    if (formData.pax_count > 1) {
      const newPaxCount = formData.pax_count - 1;
      setFormData((prevData) => ({
        ...prevData,
        pax_count: newPaxCount,
        clients_ids: Array(newPaxCount - 1).fill(""),
      }));
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 550 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingBookingId ? "Editar Reserva" : "Agregar Reserva"}
        </p>
        <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur">
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          )}
        </button>
      </div>

      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="max-h-[400px] space-y-3 overflow-y-auto md:pr-12"
        >
          <div className="md:grid md:grid-cols-2 md:gap-4">
            {[
              {
                name: "details",
                label: "Detalle ( Impacta en el recibo )",
                type: "text",
                placeholder: "Detalle...",
                span: "col-span-2",
              },
              {
                name: "departure_date",
                label: "Desde",
                type: "date",
                placeholder: "Día/Mes/Año",
                span: "col-span-1",
              },
              {
                name: "return_date",
                label: "Hasta",
                type: "date",
                placeholder: "Día/Mes/Año",
                span: "col-span-1",
              },
            ].map(({ name, label, type = "text", placeholder, span }) => (
              <div key={name} className={span}>
                <label className="ml-2 block dark:text-white">{label}</label>
                <input
                  type={
                    name === "departure_date" || name === "return_date"
                      ? "text"
                      : type
                  }
                  name={name}
                  value={
                    name === "departure_date" || name === "return_date"
                      ? formatIsoToDisplay(
                          String(formData[name as keyof BookingFormData] || ""),
                        )
                      : String(formData[name as keyof BookingFormData] || "")
                  }
                  onChange={
                    name === "departure_date" || name === "return_date"
                      ? handleDateChange
                      : handleChange
                  }
                  {...((name === "departure_date" ||
                    name === "return_date") && {
                    onPaste: handleDatePaste,
                    onBlur: handleDateBlur,
                  })}
                  className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder={placeholder}
                  required
                />
              </div>
            ))}
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-4">
            <div>
              <label className="ml-2 block dark:text-white">
                Tipo de Factura
              </label>
              <select
                name="invoice_type"
                value={formData.invoice_type || ""}
                onChange={handleChange}
                className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                required
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                <option value="Factura A">
                  Responsable Inscripto {"( "}Factura A{" )"}
                </option>
                <option value="Factura B">
                  Consumidor final {"( "}Factura B{" )"}
                </option>
                <option value="Coordinar con administracion">
                  No facturar hasta coordinar con administracion
                </option>
              </select>
            </div>
            <div>
              <label className="ml-2 block dark:text-white">
                Observaciones de Factura
              </label>
              <input
                type="text"
                name="invoice_observation"
                value={formData.invoice_observation || ""}
                onChange={handleChange}
                className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                placeholder="Ej: Facturar a cliente con ID 342"
                required
              />
            </div>
          </div>

          <div>
            <label className="ml-2 block dark:text-white">ID del Titular</label>
            <input
              type="number"
              name="titular_id"
              value={formData.titular_id || ""}
              onChange={(e) => {
                const titularId = Number(e.target.value);
                setFormData((prevData) => ({
                  ...prevData,
                  titular_id: titularId,
                  clients_ids: prevData.clients_ids.filter(
                    (id) => id !== titularId,
                  ),
                }));
              }}
              onKeyDown={(e) => {
                if (["ArrowUp", "ArrowDown"].includes(e.key))
                  e.preventDefault();
              }}
              className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              min={1}
              placeholder="Ej: 342"
              required
            />
          </div>

          <div>
            <label className="ml-2 block dark:text-white">
              Cantidad de Acompañantes
            </label>
            <div className="ml-2 flex items-center space-x-2 py-2">
              <button
                type="button"
                onClick={handleDecrement}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
                disabled={formData.pax_count <= 1}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              </button>
              <span className="rounded-full border border-sky-950 px-3 py-1 dark:border-white dark:text-white">
                {formData.pax_count - 1}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {formData.pax_count >= 2 && (
            <div>
              <label className="ml-2 block dark:text-white">
                IDs de Acompañantes
              </label>
              {Array.from({ length: formData.pax_count - 1 }).map(
                (_, index) => (
                  <input
                    key={index}
                    type="number"
                    value={formData.clients_ids[index] || ""}
                    onChange={(e) =>
                      handleAcompananteChange(index, e.target.value)
                    }
                    className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                    placeholder={`ID del acompañante ${index + 1}`}
                    onKeyDown={(e) => {
                      if (["ArrowUp", "ArrowDown"].includes(e.key))
                        e.preventDefault();
                    }}
                  />
                ),
              )}
            </div>
          )}

          <div className="pb-2">
            <button
              type="submit"
              className="mt-4 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
            >
              {editingBookingId ? "Guardar Cambios" : "Agregar Reserva"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
