// src/components/services/ServiceList.tsx

"use client";
import React from "react";
import ServiceCard from "./ServiceCard";
import { Service } from "@/types";

interface ServiceListProps {
  services: Service[];
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
}

export default function ServiceList({
  services,
  expandedServiceId,
  setExpandedServiceId,
  startEditingService,
  deleteService,
}: ServiceListProps) {
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", {
      timeZone: "UTC",
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <ServiceCard
          key={service.id_service}
          service={service}
          expandedServiceId={expandedServiceId}
          setExpandedServiceId={setExpandedServiceId}
          startEditingService={startEditingService}
          deleteService={deleteService}
          formatDate={formatDate}
        />
      ))}
    </div>
  );
}
