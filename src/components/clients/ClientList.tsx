// src/components/clients/ClientList.tsx

"use client";
import { Client } from "@/types";
import ClientCard from "./ClientCard";

interface ClientListProps {
  clients: Client[];
  expandedClientId: number | null;
  setExpandedClientId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingClient: (client: Client) => void;
  deleteClient: (id: number) => void;
}

export default function ClientList({
  clients,
  expandedClientId,
  setExpandedClientId,
  formatDate,
  startEditingClient,
  deleteClient,
}: ClientListProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {clients.map((client) => (
        <ClientCard
          key={client.id_client}
          client={client}
          expandedClientId={expandedClientId}
          setExpandedClientId={setExpandedClientId}
          formatDate={formatDate}
          startEditingClient={startEditingClient}
          deleteClient={deleteClient}
        />
      ))}
    </div>
  );
}
