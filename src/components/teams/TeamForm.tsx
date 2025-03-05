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
      className="overflow-hidden bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-4 mb-6 mx-2 dark:border dark:border-white"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-lg mb-2 dark:text-white">
            Nombre del Equipo
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
        <div>
          <label className="block text-lg mb-2 dark:text-white">
            Seleccionar Miembros
          </label>
          <ul className="space-y-2">
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
        <button
          type="submit"
          className="w-full py-2 px-4 rounded-full transition-transform hover:scale-[1.01] active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
        >
          Enviar
        </button>
      </form>
    </motion.div>
  );
}
