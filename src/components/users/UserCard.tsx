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
    <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-6 dark:border dark:border-opacity-50 dark:border-white h-fit">
      <p className="text-xl font-light">{user.email}</p>
      <div className="list-disc ml-5">
        <li className="font-normal">
          Nombre
          <span className="font-light ml-2">
            {user.first_name} {user.last_name}
          </span>
        </li>
        <li className="font-normal">
          Posición
          <span className="font-light ml-2">{user.position || "-"}</span>
        </li>
        <li className="font-normal">
          Rol
          <span className="font-light ml-2">{user.role}</span>
        </li>
      </div>

      <div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
            onClick={() => handleEdit(user)}
          >
            Editar
          </button>
          <button
            className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-red-600 text-white dark:bg-red-800"
            onClick={() => deleteUser(user.id_user)}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
