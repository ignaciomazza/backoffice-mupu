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
      className="h-fit space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white"
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
          className="rounded-full bg-black px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.4}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(team.id_team)}
          className="rounded-full bg-red-600 px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.4}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
