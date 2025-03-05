// src/components/operators/OperatorForm.tsx

"use client";
import { motion } from "framer-motion";

// Definimos un tipo para los datos del formulario de operador
export type OperatorFormData = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  state: string;
  country: string;
  vat_status: string;
  legal_name: string;
  tax_id: string;
};

interface OperatorFormProps {
  formData: OperatorFormData;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  editingOperatorId: number | null;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function OperatorForm({
  formData,
  handleChange,
  handleSubmit,
  editingOperatorId,
  isFormVisible,
  setIsFormVisible,
}: OperatorFormProps) {
  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 500 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingOperatorId ? "Editar Operador" : "Agregar Operador"}
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
          className="max-h-[400px] space-y-3 overflow-y-auto pr-12"
        >
          {[
            { name: "name", label: "Nombre", type: "text" },
            { name: "email", label: "Email", type: "email" },
            { name: "phone", label: "Teléfono", type: "tel" },
            { name: "website", label: "Sitio Web", type: "url" },
            { name: "address", label: "Dirección", type: "text" },
            { name: "postal_code", label: "Código Postal", type: "text" },
            { name: "city", label: "Localidad", type: "text" },
            { name: "state", label: "Provincia", type: "text" },
            { name: "country", label: "País", type: "text" },
            { name: "vat_status", label: "Condición IVA", type: "text" },
            { name: "legal_name", label: "Razón Social", type: "text" },
            { name: "tax_id", label: "CUIT", type: "text" },
          ].map(({ name, label, type = "text" }) => (
            <div key={name}>
              <label className="ml-2 block dark:text-white">{label}</label>
              <input
                type={type}
                name={name}
                value={String(formData[name as keyof OperatorFormData] || "")}
                onChange={handleChange}
                className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
              />
            </div>
          ))}
          <button
            type="submit"
            className="block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
          >
            {editingOperatorId ? "Guardar Cambios" : "Agregar Operador"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
