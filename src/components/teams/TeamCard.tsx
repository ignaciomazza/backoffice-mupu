// src/components/teams/TeamCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { SalesTeam } from "@/types";

interface TeamCardProps {
  team: SalesTeam;
  onEdit: (team: SalesTeam) => void;
  onDelete: (id: number) => void;
}

export default function TeamCard({ team, onEdit, onDelete }: TeamCardProps) {
  return (
    <motion.div
      layout
      layoutId={`team-${team.id_team}`}
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-6 dark:border dark:border-opacity-50 dark:border-white hover:shadow-lg transition-shadow"
    >
      <h3 className="text-lg font-semibold dark:font-medium">{team.name}</h3>
      <ul className="list-disc ml-5">
        {team.user_teams.map((ut) => (
          <li key={ut.id_user_team} className="font-light">
            {ut.user.first_name} {ut.user.last_name}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-4">
        <button
          onClick={() => onEdit(team)}
          className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 bg-black text-white dark:bg-white dark:text-black"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(team.id_team)}
          className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 bg-red-600 text-white dark:bg-red-800"
        >
          Eliminar
        </button>
      </div>
    </motion.div>
  );
}
