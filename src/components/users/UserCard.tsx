// src/components/users/UserCard.tsx

"use client";
import React from "react";
import { User } from "@/types";

interface UserCardProps {
  user: User;
  startEditingUser: (user: User) => void;
  deleteUser: (id: number) => void;
}

export default function UserCard({
  user,
  startEditingUser,
  deleteUser,
}: UserCardProps) {
  const handleEdit = (user: User) => {
    startEditingUser(user);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="h-fit space-y-6 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white">
      <p className="text-xl font-light">{user.email}</p>
      <div className="ml-5 list-disc">
        <li className="font-normal">
          Nombre
          <span className="ml-2 font-light">
            {user.first_name} {user.last_name}
          </span>
        </li>
        <li className="font-normal">
          Posición
          <span className="ml-2 font-light">{user.position || "-"}</span>
        </li>
        <li className="font-normal">
          Rol
          <span className="ml-2 font-light">{user.role}</span>
        </li>
      </div>

      <div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
            onClick={() => handleEdit(user)}
          >
            Editar
          </button>
          <button
            className="rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-red-800"
            onClick={() => deleteUser(user.id_user)}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
