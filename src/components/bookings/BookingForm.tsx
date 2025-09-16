// src/components/bookings/BookingForm.tsx
import { ChangeEvent, FormEvent, useState } from "react";
import { motion } from "framer-motion";
import Spinner from "@/components/Spinner";
import ClientPicker from "@/components/clients/ClientPicker";
import { Client, User } from "@/types";

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
  /** NUEVO: fecha de creación (YYYY-MM-DD) */
  creation_date?: string;
}

interface BookingFormProps {
  token?: string | null;
  formData: BookingFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => Promise<void>;
  editingBookingId: number | null;
  isFormVisible: boolean;
  setFormData: React.Dispatch<React.SetStateAction<BookingFormData>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** NUEVO: controles de interfaz para admins/gerentes/devs */
  canPickCreator?: boolean; // permite elegir id_user
  canEditCreationDate?: boolean; // permite editar creation_date
  creatorsList?: User[]; // lista de usuarios para el select de “Creador”
}

export default function BookingForm({
  token,
  formData,
  handleChange,
  handleSubmit,
  editingBookingId,
  setFormData,
  isFormVisible,
  setIsFormVisible,
  canPickCreator = false,
  canEditCreationDate = false,
  creatorsList = [],
}: BookingFormProps) {
  const [loading, setLoading] = useState(false);

  // Toggle para mostrar/ocultar el bloque admin (creador/fecha de creación)
  const [useAdminAdjust, setUseAdminAdjust] = useState(false);

  const localHandleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await handleSubmit(e);
    } finally {
      setLoading(false);
    }
  };

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

  // Helpers para IDs válidos
  const isValidId = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0;

  const handleIncrement = () => {
    setFormData((prev) => {
      // Aumentamos la cantidad de pax, pero NO pusheamos placeholders (0)
      const newCount = prev.pax_count + 1;
      return {
        ...prev,
        pax_count: newCount,
        // mantenemos el array tal cual; los slots vacíos se muestran por pax_count
        clients_ids: [...prev.clients_ids],
      };
    });
  };

  const handleDecrement = () => {
    setFormData((prev) => {
      if (prev.pax_count <= 1) return prev;
      const newCount = prev.pax_count - 1;
      // recortamos el array para que no queden sobras
      const next = prev.clients_ids.slice(0, Math.max(0, newCount - 1));
      return {
        ...prev,
        pax_count: newCount,
        clients_ids: next,
      };
    });
  };

  const canShowAdminBox = canPickCreator || canEditCreationDate;

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 650 : 100,
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
          onSubmit={localHandleSubmit}
          className="max-h-[500px] space-y-3 overflow-y-auto md:pr-12"
        >
          {/* Detalle + Fechas de viaje */}
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
                  className="w-full appearance-none rounded-2xl border border-sky-950/10 bg-white/50 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder={placeholder}
                  required
                />
              </div>
            ))}
          </div>

          {/* Facturación */}
          <div className="md:grid md:grid-cols-2 md:gap-4">
            <div>
              <label className="ml-2 block dark:text-white">
                Tipo de Factura
              </label>
              <select
                name="invoice_type"
                value={formData.invoice_type || ""}
                onChange={handleChange}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
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
                className="w-full appearance-none rounded-2xl border border-sky-950/10 bg-white/50 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                placeholder="Ej: Facturar al cliente N° 342"
                required
              />
            </div>
          </div>

          {/* Titular */}
          <div>
            <ClientPicker
              token={token}
              label="Titular"
              placeholder="Buscar por N° Cliente, DNI, Pasaporte, CUIT o Nombre..."
              valueId={
                isValidId(formData.titular_id) ? formData.titular_id : null
              }
              excludeIds={formData.clients_ids.filter(isValidId)}
              required
              onSelect={(c: Client) =>
                setFormData((prev) => ({
                  ...prev,
                  titular_id: c.id_client,
                  // sacamos al titular si estaba como acompañante
                  clients_ids: prev.clients_ids.filter(
                    (id) => id !== c.id_client,
                  ),
                }))
              }
              onClear={() =>
                setFormData((prev) => ({ ...prev, titular_id: 0 }))
              }
            />
          </div>

          {/* Acompañantes */}
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
              <label className="ml-2 block dark:text-white">Acompañantes</label>

              {Array.from({ length: formData.pax_count - 1 }).map(
                (_, index) => {
                  const rawId = formData.clients_ids[index];
                  const currentId = isValidId(rawId) ? rawId : null;

                  const exclude = [
                    formData.titular_id,
                    ...formData.clients_ids.filter((_, i) => i !== index),
                  ].filter(isValidId) as number[];

                  return (
                    <div key={index} className="mt-3">
                      <ClientPicker
                        token={token}
                        label={`Acompañante ${index + 1}`}
                        placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                        valueId={currentId}
                        excludeIds={exclude}
                        onSelect={(c: Client) =>
                          setFormData((prev) => {
                            const next = [...prev.clients_ids];
                            next[index] = c.id_client;
                            return { ...prev, clients_ids: next };
                          })
                        }
                        onClear={() =>
                          setFormData((prev) => {
                            const next = [...prev.clients_ids];
                            // guardar NaN para “vacío” (se ignora al enviar)
                            next[index] = Number.NaN;
                            return { ...prev, clients_ids: next };
                          })
                        }
                      />
                    </div>
                  );
                },
              )}
            </div>
          )}

          {/* ====== NUEVO: Bloque “Ajustes administrativos” con checkbox ====== */}
          {canShowAdminBox && (
            <div className="rounded-2xl border border-white/10 p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAdminAdjust}
                  onChange={(e) => setUseAdminAdjust(e.target.checked)}
                />
                <span className="text-sm">
                  Ajustar creador y/o fecha de creación
                </span>
              </label>

              {useAdminAdjust && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {/* Elegir Creador */}
                  {canPickCreator && (
                    <div>
                      <p className="mb-1 text-sm font-medium">
                        Creador de la reserva
                      </p>
                      <select
                        className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 bg-white/50 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                        name="id_user"
                        value={formData.id_user || 0}
                        onChange={(e) => {
                          const id = Number(e.target.value || 0);
                          // reusamos handleChange para mantener una sola fuente
                          const ev = {
                            target: { name: "id_user", value: String(id) },
                          } as unknown as ChangeEvent<HTMLSelectElement>;
                          handleChange(ev);
                        }}
                      >
                        <option value={0} disabled>
                          Seleccionar…
                        </option>
                        {creatorsList.map((u) => (
                          <option key={u.id_user} value={u.id_user}>
                            {u.first_name} {u.last_name}
                          </option>
                        ))}
                      </select>
                      <div className="ml-1 mt-1 text-xs opacity-70">
                        Si no cambiás nada, queda el usuario actual.
                      </div>
                    </div>
                  )}

                  {/* Fecha de creación editable */}
                  {canEditCreationDate && (
                    <div>
                      <p className="mb-1 text-sm font-medium">
                        Fecha de creación
                      </p>
                      <input
                        type="text"
                        name="creation_date"
                        placeholder="Día/Mes/Año"
                        className="w-full appearance-none rounded-2xl border border-sky-950/10 bg-white/50 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                        value={formatIsoToDisplay(formData.creation_date || "")}
                        onChange={handleDateChange}
                        onPaste={handleDatePaste}
                        onBlur={handleDateBlur}
                      />
                      <div className="ml-1 mt-1 text-xs opacity-70">
                        Si lo dejás vacío, el backend usará la fecha actual.
                      </div>
                    </div>
                  )}

                  <div className="text-xs opacity-70 md:col-span-2">
                    Estos ajustes requieren permisos y el backend valida el
                    alcance.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pb-2">
            <button
              type="submit"
              disabled={loading}
              className={`mt-4 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${
                loading ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              {loading ? (
                <Spinner />
              ) : editingBookingId ? (
                "Guardar Cambios"
              ) : (
                "Agregar Reserva"
              )}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
