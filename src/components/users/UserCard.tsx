// src/components/users/UserCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { User } from "@/types";

interface UserCardProps {
  user: User;
  expandedUserId: number | null;
  setExpandedUserId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingUser: (user: User) => void;
  deleteUser: (id: number) => void;
}

export default function UserCard({
  user,
  expandedUserId,
  setExpandedUserId,
  startEditingUser,
  deleteUser,
}: UserCardProps) {
  const isExpanded = expandedUserId === user.id_user;

  const handleEdit = (user: User) => {
    startEditingUser(user);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <motion.div
      layout
      layoutId={`user-${user.id_user}`}
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white h-fit"
    >
      <p className="text-xl font-light text-end">{user.email}</p>
      <p className="font-semibold dark:font-medium">
        Nombre
        <span className="font-light ml-2">{user.first_name}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Apellido
        <span className="font-light ml-2">{user.last_name}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Posición
        <span className="font-light ml-2">{user.position || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Rol
        <span className="font-light ml-2">{user.role}</span>
      </p>

      <div>
        {isExpanded ? (
          <div className="flex justify-between w-full">
            <button
              onClick={() =>
                setExpandedUserId((prevId) =>
                  prevId === user.id_user ? null : user.id_user
                )
              }
              className="p-2 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
            >
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
                  d="M5 12h14"
                />
              </svg>
            </button>
            <div className="flex gap-2 mt-4">
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
        ) : (
          <button
            onClick={() =>
              setExpandedUserId((prevId) =>
                prevId === user.id_user ? null : user.id_user
              )
            }
            className="p-2 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
          >
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
          </button>
        )}
      </div>
    </motion.div>
  );
}
