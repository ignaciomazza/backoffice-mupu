// src/components/teams/TeamList.tsx

"use client";
import React from "react";
import { SalesTeam } from "@/types";
import TeamCard from "./TeamCard";

interface TeamListProps {
  teams: SalesTeam[];
  onEdit: (team: SalesTeam) => void;
  onDelete: (id: number) => void;
}

export default function TeamList({ teams, onEdit, onDelete }: TeamListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((team) => (
        <TeamCard
          key={team.id_team}
          team={team}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
