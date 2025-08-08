// src/components/teams/TeamForm.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";

interface TeamFormProps {
  name: string;
  selectedUserIds: number[];
  users: { id_user: number; first_name: string; last_name: string }[];
  onNameChange: (value: string) => void;
  onUserToggle: (userId: number) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isVisible: boolean;
}

export default function TeamForm({
  name,
  selectedUserIds,
  users,
  onNameChange,
  onUserToggle,
  onSubmit,
  isVisible,
}: TeamFormProps) {
  return (
    <motion.div
      layout
      initial={{ maxHeight: 0, opacity: 0 }}
      animate={{
        maxHeight: isVisible ? 1000 : 0,
        opacity: isVisible ? 1 : 0,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-auto rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <form onSubmit={onSubmit} className="h-full space-y-4">
        <div>
          <label className="mb-2 block text-lg dark:text-white">
            Nombre del Equipo
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Equipo Online"
            required
            className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-2 block text-lg dark:text-white">
            Seleccionar Miembros
          </label>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {users.map((user) => (
              <li key={user.id_user}>
                <label className="flex items-center dark:text-white">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id_user)}
                    onChange={() => onUserToggle(user.id_user)}
                    className="custom-checkbox mr-2"
                  />
                  {user.first_name} {user.last_name}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex w-full justify-end">
          <button
            type="submit"
            className="w-1/4 rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            Enviar
          </button>
        </div>
      </form>
    </motion.div>
  );
}
