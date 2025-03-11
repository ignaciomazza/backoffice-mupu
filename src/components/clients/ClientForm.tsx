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
  dni_issue_date?: string;
  dni_expiry_date?: string;
  birth_date?: string;
  nationality?: string;
  gender?: string;
  passport_issue?: string;
  passport_expiry?: string;
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
  // Definir cuáles campos son obligatorios según el modelo
  const requiredFields = [
    "first_name",
    "last_name",
    "phone",
    "dni_number",
    "dni_issue_date",
    "dni_expiry_date",
    "birth_date",
    "nationality",
    "gender",
  ];

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 500 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl bg-white p-4 text-black shadow-md dark:border dark:border-white dark:bg-black md:p-6"
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
          className="max-h-[400px] space-y-3 overflow-y-auto md:pr-12"
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
            { name: "dni_issue_date", label: "Emisión DNI", type: "date" },
            { name: "dni_expiry_date", label: "Expiración DNI", type: "date" },
            { name: "birth_date", label: "Fecha de Nacimiento", type: "date" },
            { name: "nationality", label: "Nacionalidad" },
            { name: "gender", label: "Género" },
            {
              name: "passport_issue",
              label: "Emisión Pasaporte",
              type: "date",
            },
            {
              name: "passport_expiry",
              label: "Expiración Pasaporte",
              type: "date",
            },
          ].map(({ name, label, type = "text" }) => (
            <div key={name}>
              <label className="ml-2 block dark:text-white">{label}</label>
              <input
                type={type}
                name={name}
                value={String(formData[name as keyof ClientFormData] || "")}
                onChange={handleChange}
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                placeholder={`${label}...`}
                required={requiredFields.includes(name)}
              />
            </div>
          ))}
          <button
            type="submit"
            className="block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            {editingClientId ? "Guardar Cambios" : "Agregar Cliente"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
