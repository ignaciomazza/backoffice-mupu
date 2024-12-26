// src/components/operators/OperatorForm.tsx

"use client";
import { motion } from "framer-motion";

interface OperatorFormProps {
  formData: any;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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
      className="overflow-hidden bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-3 mb-6 dark:border dark:border-white"
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingOperatorId ? "Editar Operador" : "Agregar Operador"}
        </p>
        <button className="p-2 rounded-full bg-black text-white dark:bg-white dark:text-black">
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
          className="space-y-3 overflow-y-auto max-h-[400px] pr-12"
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
              <label className="block ml-2 dark:text-white">{label}</label>
              <input
                type={type}
                name={name}
                value={String(formData[name as keyof typeof formData] || "")}
                onChange={handleChange}
                className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
              />
            </div>
          ))}
          <button
            type="submit"
            className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
          >
            {editingOperatorId ? "Guardar Cambios" : "Agregar Operador"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
