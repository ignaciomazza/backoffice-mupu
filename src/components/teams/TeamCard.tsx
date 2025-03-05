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
      className="space-y-6 rounded-3xl bg-white p-6 text-black shadow-md transition-shadow hover:shadow-lg dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      <h3 className="text-lg font-semibold dark:font-medium">{team.name}</h3>
      <ul className="ml-5 list-disc">
        {team.user_teams.map((ut) => (
          <li key={ut.id_user_team} className="font-light">
            {ut.user.first_name} {ut.user.last_name}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-4">
        <button
          onClick={() => onEdit(team)}
          className="rounded-full bg-black px-6 py-2 text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(team.id_team)}
          className="rounded-full bg-red-600 px-6 py-2 text-white transition-transform hover:scale-105 active:scale-100 dark:bg-red-800"
        >
          Eliminar
        </button>
      </div>
    </motion.div>
  );
}
