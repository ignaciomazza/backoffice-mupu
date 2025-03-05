// src/components/users/UserForm.tsx

"use client";
import { motion } from "framer-motion";

interface UserFormProps {
  formData: {
    email: string;
    password?: string;
    first_name: string;
    last_name: string;
    position: string;
    role: string;
    id_agency: number;
  };
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  editingUserId: number | null;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function UserForm({
  formData,
  handleChange,
  handleSubmit,
  editingUserId,
  isFormVisible,
  setIsFormVisible,
}: UserFormProps) {
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
          {editingUserId ? "Editar Usuario" : "Agregar Usuario"}
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
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Contraseña", type: "password" },
            { name: "first_name", label: "Nombre", type: "text" },
            { name: "last_name", label: "Apellido", type: "text" },
            { name: "position", label: "Posición", type: "text" },
          ].map(({ name, label, type }) => (
            <div key={name}>
              <label className="block ml-2 dark:text-white">{label}</label>
              <input
                type={type}
                name={name}
                value={String(formData[name as keyof typeof formData] || "")}
                onChange={handleChange}
                className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
                required={name !== "password" || !editingUserId}
              />
            </div>
          ))}
          <div>
            <label className="block ml-2 dark:text-white">Rol</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
            >
              <option value="desarrollador">Desarrollador</option>
              <option value="gerente">Gerente</option>
              <option value="lider">Lider de Equipo</option>
              <option value="vendedor">Vendedor</option>
              <option value="administrativo">Administrativo</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          <button
            type="submit"
            className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
          >
            {editingUserId ? "Guardar Cambios" : "Agregar Usuario"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
