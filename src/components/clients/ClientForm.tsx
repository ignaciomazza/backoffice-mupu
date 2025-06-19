// src/components/clients/ClientForm.tsx

"use client";
import { motion } from "framer-motion";

export interface ClientFormData {
  first_name: string;
  last_name: string;
  phone?: string;
  address?: string;
  postal_code?: string;
  locality?: string;
  company_name?: string;
  tax_id?: string;
  commercial_address?: string;
  dni_number?: string;
  passport_number?: string;
  birth_date?: string;
  nationality?: string;
  gender?: string;
  email?: string;
}

interface ClientFormProps {
  formData: ClientFormData;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  editingClientId: number | null;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ClientForm({
  formData,
  handleChange,
  handleSubmit,
  editingClientId,
  isFormVisible,
  setIsFormVisible,
}: ClientFormProps) {
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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    } as React.ChangeEvent<HTMLInputElement>;
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
      } as React.ChangeEvent<HTMLInputElement>;
      handleChange(event);
    }
  };

  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const iso = formatDisplayToIso(value);
    const event = {
      target: { name, value: iso },
    } as React.ChangeEvent<HTMLInputElement>;
    handleChange(event);
  };

  // Definimos los campos requeridos (se elimina "email" y se incluye "gender")
  const requiredFields = [
    "first_name",
    "last_name",
    "phone",
    "birth_date",
    "nationality",
    "gender",
  ];

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 550 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingClientId ? "Editar Cliente" : "Agregar Cliente"}
        </p>
        <button className="rounded-full bg-black p-2 text-white dark:bg-white dark:text-black">
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
          className="max-h-[450px] items-center justify-center space-y-3 overflow-y-auto md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:pr-12"
        >
          {[
            { name: "first_name", label: "Nombre" },
            { name: "last_name", label: "Apellido" },
            { name: "phone", label: "Teléfono" },
            { name: "address", label: "Dirección" },
            { name: "postal_code", label: "Código Postal" },
            { name: "locality", label: "Localidad" },
            { name: "company_name", label: "Razón Social" },
            { name: "tax_id", label: "CUIT" },
            { name: "commercial_address", label: "Domicilio Comercial" },
            { name: "dni_number", label: "Número DNI" },
            { name: "passport_number", label: "Número Pasaporte" },
            { name: "birth_date", label: "Fecha de Nacimiento", type: "date" },
            { name: "nationality", label: "Nacionalidad" },
            { name: "gender", label: "Género" },
            { name: "email", label: "Correo electrónico" },
          ].map(({ name, label, type = "text" }) => (
            <div key={name}>
              <label className="ml-2 block dark:text-white">{label}</label>
              {name === "gender" ? (
                <select
                  name={name}
                  value={formData[name as keyof ClientFormData] || ""}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-2xl border border-black/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  required
                >
                  <option value="" disabled>
                    Seleccionar
                  </option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="No Binario">No Binario</option>
                </select>
              ) : (
                <input
                  type={type === "date" ? "text" : type}
                  name={name}
                  value={
                    type === "date"
                      ? formatIsoToDisplay(
                          String(formData[name as keyof ClientFormData] || ""),
                        )
                      : String(formData[name as keyof ClientFormData] || "")
                  }
                  onChange={type === "date" ? handleDateChange : handleChange}
                  {...(type === "date" && {
                    onPaste: handleDatePaste,
                    onBlur: handleDateBlur,
                  })}
                  className="w-full rounded-2xl border border-black/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder={type === "date" ? "Día/Mes/Año" : `${label}...`}
                  required={requiredFields.includes(name)}
                />
              )}
            </div>
          ))}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            >
              {editingClientId ? "Guardar Cambios" : "Agregar Cliente"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
