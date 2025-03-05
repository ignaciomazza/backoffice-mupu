// src/components/clients/ClientForm.tsx

"use client";
import { motion } from "framer-motion";

interface ClientFormProps {
  formData: any;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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
  // Los siguientes campos son opcionales
  const optionalFields = [
    "commercial_address",
    "company_name",
  ];

  // Opciones para la condición frente al IVA
  const ivaOptions = [
    { Id: 1, Desc: "IVA Responsable Inscripto", Cmp_Clase: "A/M/C" },
    { Id: 6, Desc: "Responsable Monotributo", Cmp_Clase: "A/M/C" },
    { Id: 13, Desc: "Monotributista Social", Cmp_Clase: "A/M/C" },
    {
      Id: 16,
      Desc: "Monotributo Trabajador Independiente Promovido",
      Cmp_Clase: "A/M/C",
    },
    { Id: 4, Desc: "IVA Sujeto Exento", Cmp_Clase: "B/C" },
    { Id: 5, Desc: "Consumidor Final", Cmp_Clase: "B/C" },
    { Id: 7, Desc: "Sujeto No Categorizado", Cmp_Clase: "B/C" },
    { Id: 8, Desc: "Proveedor del Exterior", Cmp_Clase: "B/C" },
    { Id: 9, Desc: "Cliente del Exterior", Cmp_Clase: "B/C" },
    { Id: 10, Desc: "IVA Liberado – Ley N° 19.640", Cmp_Clase: "B/C" },
    { Id: 15, Desc: "IVA No Alcanzado", Cmp_Clase: "B/C" },
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
      className="overflow-hidden bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-3 mb-6 dark:border dark:border-white"
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingClientId ? "Editar Cliente" : "Agregar Cliente"}
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
              <label className="block ml-2 dark:text-white">{label}</label>
              {name === "iva_condition" ? (
                <select
                  name="iva_condition"
                  value={String(formData["iva_condition"] || "")}
                  onChange={handleChange}
                  className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
                  required
                >
                  <option value="">Seleccione una opción</option>
                  {ivaOptions.map((option) => (
                    <option key={option.Id} value={option.Id}>
                      {option.Desc}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={type}
                  name={name}
                  value={String(formData[name as keyof typeof formData] || "")}
                  onChange={handleChange}
                  className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
                  required={!optionalFields.includes(name)}
                />
              )}
            </div>
          ))}
          <button
            type="submit"
            className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
          >
            {editingClientId ? "Guardar Cambios" : "Agregar Cliente"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
