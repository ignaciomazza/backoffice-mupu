// src/components/bookings/BookingForm.tsx
import { ChangeEvent, FormEvent, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Spinner from "@/components/Spinner";
import ClientPicker from "@/components/clients/ClientPicker";
import { Client, User } from "@/types";

/* =========================
 * Tipos
 * ========================= */
export interface BookingFormData {
  id_booking?: number;
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: string;
  invoice_observation: string; // ← opcional (sin required)
  observation: string;
  titular_id: number;
  id_user: number;
  id_agency: number;
  departure_date: string; // aaaa-mm-dd
  return_date: string; // aaaa-mm-dd
  pax_count: number; // total (titular + acompañantes)
  clients_ids: number[]; // solo acompañantes
  creation_date?: string; // aaaa-mm-dd
}

interface BookingFormProps {
  token?: string | null;
  formData: BookingFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => Promise<void> | void;
  editingBookingId: number | null;
  isFormVisible: boolean;
  setFormData: React.Dispatch<React.SetStateAction<BookingFormData>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /* Controles admin/dev */
  canPickCreator?: boolean;
  canEditCreationDate?: boolean;
  creatorsList?: User[];
}

/* =========================
 * UI primitives (alineadas a ServiceForm/ClientForm)
 * ========================= */
const Section: React.FC<{
  title: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-4">
    <div className="mb-3">
      <h3 className="text-base font-semibold tracking-tight text-sky-950 dark:text-white">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-xs font-light text-sky-950/70 dark:text-white/70">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  </section>
);

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ id, label, hint, required, children }) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="ml-1 block text-sm font-medium text-sky-950 dark:text-white"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p
        id={`${id}-hint`}
        className="ml-1 text-xs text-sky-950/70 dark:text-white/70"
      >
        {hint}
      </p>
    )}
  </div>
);

/* =========================
 * Helpers
 * ========================= */
const isValidId = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const formatIsoToDisplay = (iso: string): string => {
  if (!iso) return "";
  if (iso.includes("/")) return iso;
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

const formatDisplayToIso = (display: string): string => {
  const p = display.split("/");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : display;
};

/* Pills / inputs con acentos emerald/rose (suave) */
const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
const pillWarn = "bg-rose-500/15 text-rose-700 dark:text-rose-300";

const inputBase =
  "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10";
const inputOkFocus = "focus:ring-2 focus:ring-emerald-400/40";
const inputWarnFocus = "focus:ring-2 focus:ring-rose-400/40";

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
  const [useAdminAdjust, setUseAdminAdjust] = useState(false);

  const localHandleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await Promise.resolve(handleSubmit(e));
    } finally {
      setLoading(false);
    }
  };

  /* --- Fecha con máscara dd/mm/aaaa --- */
  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    const d = e.target.value.replace(/\D/g, "");
    let f = "";
    if (d.length >= 1) f += d.substring(0, 2);
    if (d.length >= 3) f += "/" + d.substring(2, 4);
    if (d.length >= 5) f += "/" + d.substring(4, 8);
    handleChange({
      target: { name, value: f },
    } as ChangeEvent<HTMLInputElement>);
  };

  const handleDatePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "");
    if (t.length === 8) {
      e.preventDefault();
      handleChange({
        target: {
          name: e.currentTarget.name,
          value: `${t.slice(0, 2)}/${t.slice(2, 4)}/${t.slice(4, 8)}`,
        },
      } as ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    handleChange({
      target: { name, value: formatDisplayToIso(value) },
    } as ChangeEvent<HTMLInputElement>);
  };

  /* --- Pax controls --- */
  const handleIncrement = () => {
    setFormData((prev) => ({
      ...prev,
      pax_count: prev.pax_count + 1,
      clients_ids: [...prev.clients_ids],
    }));
  };

  const handleDecrement = () => {
    setFormData((prev) => {
      if (prev.pax_count <= 1) return prev;
      const newCount = prev.pax_count - 1;
      return {
        ...prev,
        pax_count: newCount,
        clients_ids: prev.clients_ids.slice(0, Math.max(0, newCount - 1)),
      };
    });
  };

  const canShowAdminBox = canPickCreator || canEditCreationDate;

  const totalPax = formData.pax_count;
  const hasTitular = isValidId(formData.titular_id);
  const titularPill = hasTitular
    ? `Titular N° ${formData.titular_id}`
    : "Sin titular";
  const hasDeparture = !!formData.departure_date;
  const hasReturn = !!formData.return_date;
  const bothDates = hasDeparture && hasReturn;

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 700 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      id="booking-form"
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      {/* HEADER */}
      <div
        className={`sticky top-0 z-10 ${isFormVisible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={() => setIsFormVisible(!isFormVisible)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFormVisible}
          aria-controls="booking-form-body"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
              {isFormVisible ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              )}
            </div>
            <div>
              <p className="text-lg font-semibold">
                {editingBookingId ? "Editar Reserva" : "Agregar Reserva"}
              </p>
            </div>
          </div>

          {/* Pills con acentos */}
          <div className="hidden items-center gap-2 md:flex">
            <span className={`${pillBase} ${hasTitular ? pillOk : pillWarn}`}>
              {titularPill}
            </span>
            <span
              className={`${pillBase} ${totalPax > 1 ? pillOk : pillNeutral}`}
              title="Total de pasajeros (incluye titular)"
            >
              PAX: {totalPax}
            </span>
            {(hasDeparture || hasReturn) && (
              <span className={`${pillBase} ${bothDates ? pillOk : pillWarn}`}>
                {formatIsoToDisplay(formData.departure_date || "")}
                {formData.return_date
                  ? ` → ${formatIsoToDisplay(formData.return_date)}`
                  : ""}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* BODY */}
      <AnimatePresence initial={false}>
        {isFormVisible && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <motion.form
              id="booking-form-body"
              onSubmit={localHandleSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              {/* DATOS BÁSICOS */}
              <Section
                title="Datos básicos"
                desc="Qué se está reservando y cuándo viaja el pasajero."
              >
                <Field
                  id="details"
                  label="Detalle (impacta en recibo)"
                  required
                >
                  <input
                    id="details"
                    type="text"
                    name="details"
                    value={formData.details || ""}
                    onChange={handleChange}
                    placeholder="Detalle..."
                    required
                    className={`${inputBase} ${formData.details ? inputOkFocus : inputWarnFocus}`}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                  <Field
                    id="departure_date"
                    label="Desde"
                    hint="Formato: dd/mm/aaaa"
                    required
                  >
                    <input
                      id="departure_date"
                      type="text"
                      name="departure_date"
                      value={formatIsoToDisplay(formData.departure_date || "")}
                      onChange={handleDateChange}
                      onPaste={handleDatePaste}
                      onBlur={handleDateBlur}
                      inputMode="numeric"
                      placeholder="dd/mm/aaaa"
                      required
                      className={`${inputBase} ${hasDeparture ? inputOkFocus : inputWarnFocus}`}
                    />
                  </Field>

                  <Field
                    id="return_date"
                    label="Hasta"
                    hint="Formato: dd/mm/aaaa"
                    required
                  >
                    <input
                      id="return_date"
                      type="text"
                      name="return_date"
                      value={formatIsoToDisplay(formData.return_date || "")}
                      onChange={handleDateChange}
                      onPaste={handleDatePaste}
                      onBlur={handleDateBlur}
                      inputMode="numeric"
                      placeholder="dd/mm/aaaa"
                      required
                      className={`${inputBase} ${hasReturn ? inputOkFocus : inputWarnFocus}`}
                    />
                  </Field>
                </div>
              </Section>

              {/* FACTURACIÓN */}
              <Section
                title="Facturación"
                desc="Cómo querés facturar esta reserva."
              >
                <Field id="invoice_type" label="Tipo de Factura" required>
                  <select
                    id="invoice_type"
                    name="invoice_type"
                    value={formData.invoice_type || ""}
                    onChange={handleChange}
                    required
                    className={`${inputBase} cursor-pointer`}
                  >
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    <option value="Factura A">
                      Responsable Inscripto (Factura A)
                    </option>
                    <option value="Factura B">
                      Consumidor final (Factura B)
                    </option>
                    <option value="Coordinar con administracion">
                      No facturar hasta coordinar con administración
                    </option>
                  </select>
                </Field>

                {/* OPCIONAL */}
                <Field
                  id="invoice_observation"
                  label="Observaciones de Factura"
                  hint="Ej.: Facturar al pax N° 342"
                >
                  <input
                    id="invoice_observation"
                    type="text"
                    name="invoice_observation"
                    value={formData.invoice_observation || ""}
                    onChange={handleChange}
                    placeholder="Ej: Facturar al pax N° 342"
                    className={`${inputBase} ${formData.invoice_observation ? inputOkFocus : ""}`}
                  />
                </Field>

                {formData.invoice_observation && (
                  <div className="md:col-span-2">
                    <span className={`${pillBase} ${pillOk}`}>
                      Observación cargada
                    </span>
                  </div>
                )}
              </Section>

              {/* PASAJEROS */}
              <Section
                title="Pasajeros"
                desc="Seleccioná titular y (si corresponde) acompañantes."
              >
                <div className="md:col-span-2">
                  <ClientPicker
                    token={token}
                    label="Titular"
                    placeholder="Buscar por N° Pax, DNI, Pasaporte, CUIT o Nombre..."
                    valueId={hasTitular ? formData.titular_id : null}
                    excludeIds={formData.clients_ids.filter(isValidId)}
                    required
                    onSelect={(c: Client) =>
                      setFormData((prev) => ({
                        ...prev,
                        titular_id: c.id_client,
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

                <div className="md:col-span-2">
                  <label className="mb-1 ml-1 block text-sm font-medium text-sky-950 dark:text-white">
                    Cantidad de acompañantes
                  </label>
                  <div className="ml-1 flex items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={handleDecrement}
                      className="rounded-full border border-sky-950 p-1 disabled:opacity-50 dark:border-white dark:text-white"
                      disabled={formData.pax_count <= 1}
                      title="Quitar acompañante"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 12h14"
                        />
                      </svg>
                    </button>
                    <span
                      className={`${pillBase} ${
                        Math.max(0, formData.pax_count - 1) > 0
                          ? pillOk
                          : pillNeutral
                      }`}
                    >
                      {Math.max(0, formData.pax_count - 1)}
                    </span>
                    <button
                      type="button"
                      onClick={handleIncrement}
                      className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
                      title="Agregar acompañante"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
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
                  <div className="md:col-span-2">
                    <label className="mb-1 ml-1 block text-sm font-medium text-sky-950 dark:text-white">
                      Acompañantes
                    </label>

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
                                  next[index] = Number.NaN; // vacío
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
              </Section>

              {/* NOTAS INTERNAS */}
              <Section
                title="Notas internas"
                desc="Solo para uso interno del equipo (no impacta en facturación)."
              >
                <div className="md:col-span-2">
                  <Field id="observation" label="Observación">
                    <textarea
                      id="observation"
                      name="observation"
                      value={formData.observation || ""}
                      onChange={handleChange}
                      placeholder="Notas internas de la reserva…"
                      rows={3}
                      className={`${inputBase} ${formData.observation ? inputOkFocus : ""} resize-y`}
                    />
                  </Field>
                </div>
              </Section>

              {/* AJUSTES ADMINISTRATIVOS */}
              {canShowAdminBox && (
                <Section
                  title="Ajustes administrativos"
                  desc="Requieren permisos. El backend valida el alcance."
                >
                  <div className="flex items-center gap-3 md:col-span-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={useAdminAdjust}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseAdminAdjust(checked);
                          // 👉 Al habilitar, forzamos la selección del creador a "Seleccionar…"
                          if (checked && canPickCreator) {
                            setFormData((prev) => ({ ...prev, id_user: 0 }));
                          }
                        }}
                        className="size-4 rounded border-white/30 bg-white/30 text-sky-600 shadow-sm shadow-sky-950/10 dark:border-white/20 dark:bg-white/10"
                      />
                      Habilitar ajustes de creador/fecha de creación
                    </label>

                    {useAdminAdjust && (
                      <span className={`${pillBase} ${pillOk}`}>Activo</span>
                    )}
                  </div>

                  {useAdminAdjust && (
                    <>
                      {canPickCreator && (
                        <Field id="id_user" label="Creador de la reserva">
                          <select
                            id="id_user"
                            name="id_user"
                            value={formData.id_user || 0}
                            onChange={(e) => {
                              const id = Number(e.target.value || 0);
                              handleChange({
                                target: { name: "id_user", value: String(id) },
                              } as unknown as React.ChangeEvent<HTMLSelectElement>);
                            }}
                            className={`${inputBase} cursor-pointer`}
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
                        </Field>
                      )}

                      {canEditCreationDate && (
                        <Field
                          id="creation_date"
                          label="Fecha de creación"
                          hint="dd/mm/aaaa"
                        >
                          <input
                            id="creation_date"
                            type="text"
                            name="creation_date"
                            placeholder="dd/mm/aaaa"
                            className={`${inputBase} ${formData.creation_date ? inputOkFocus : ""}`}
                            value={formatIsoToDisplay(
                              formData.creation_date || "",
                            )}
                            onChange={handleDateChange}
                            onPaste={handleDatePaste}
                            onBlur={handleDateBlur}
                          />
                          <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                            Si lo dejás vacío, el backend usará la fecha actual.
                          </p>
                        </Field>
                      )}
                    </>
                  )}
                </Section>
              )}

              {/* ACTION BAR */}
              <div className="sticky bottom-2 z-10 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    loading
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                  aria-label={
                    editingBookingId
                      ? "Guardar cambios de la reserva"
                      : "Agregar reserva"
                  }
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
