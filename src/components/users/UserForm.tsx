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
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
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
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 500 : 100,
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
          {editingUserId ? "Editar Usuario" : "Agregar Usuario"}
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
          className="max-h-[450px] items-center justify-center space-y-3 overflow-y-auto md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:pr-12"
        >
          {[
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Contraseña", type: "password" },
            { name: "first_name", label: "Nombre", type: "text" },
            { name: "last_name", label: "Apellido", type: "text" },
            { name: "position", label: "Posición", type: "text" },
          ].map(({ name, label, type }) => (
            <div key={name}>
              <label className="ml-2 block dark:text-white">{label}</label>
              <input
                type={type}
                name={name}
                placeholder={label}
                value={String(formData[name as keyof typeof formData] || "")}
                onChange={handleChange}
                className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                required={name !== "password" || !editingUserId}
              />
            </div>
          ))}
          <div>
            <label className="ml-2 block dark:text-white">Rol</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            >
              <option value="desarrollador">Desarrollador</option>
              <option value="gerente">Gerente</option>
              <option value="lider">Lider de Equipo</option>
              <option value="vendedor">Vendedor</option>
              <option value="administrativo">Administrativo</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="block rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
            >
              {editingUserId ? "Guardar Cambios" : "Agregar Usuario"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
