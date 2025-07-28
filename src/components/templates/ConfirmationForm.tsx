// src/components/templates/ConfirmationForm.tsx
"use client";

import React, { useState } from "react";
import { Confirmation } from "@/types";

type ConfirmationRegion = "argentina" | "brasil" | "caribe" | "europa";
type ConfirmationWithLogo = Confirmation & { logoBase64?: string };

export default function ConfirmationForm({
  onSubmit,
}: {
  onSubmit: (data: ConfirmationWithLogo) => void;
}) {
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [paxCount, setPaxCount] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [conditions, setConditions] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState<Confirmation["currency"]>("ARS");
  const [passengerData, setPassengerData] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState(false);
  const [region, setRegion] = useState<ConfirmationRegion>("argentina");

  const validate = () => {
    const e: Record<string, string> = {};
    if (!confirmationNumber.trim()) e.confirmationNumber = "Requerido";
    if (!clientName.trim()) e.clientName = "Requerido";
    if (!issueDate.trim()) e.issueDate = "Requerido";
    if (isNaN(Number(paxCount))) e.paxCount = "Debe ser número";
    if (isNaN(Number(total))) e.total = "Debe ser número";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setLoadingImg(true);

    // Fetch logo según la región y convertir a Base64
    let logoBase64: string | undefined;
    try {
      const res = await fetch(`/images/${region}.jpg`);
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      logoBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } catch {
      logoBase64 = undefined;
    }
    setLoadingImg(false);

    // Convertir servicios: cada línea "Título:detalle"
    const services = servicesText
      .split("\n")
      .map((line) => line.split(":"))
      .filter((parts) => parts.length === 2)
      .map(([title, detail]) => ({
        title: title.trim(),
        detail: detail.trim(),
      }));

    onSubmit({
      confirmationNumber: confirmationNumber.trim(),
      clientName: clientName.trim(),
      issueDate: issueDate.trim(),
      expiryDate: expiryDate.trim() || undefined,
      paxCount: Number(paxCount),
      services,
      conditions: conditions.trim(),
      total: Number(total),
      currency,
      passengerData: passengerData.trim() || undefined,
      logoBase64,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>N° Confirmación</label>
        <input
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          className="w-full border px-2 py-1"
        />
        {errors.confirmationNumber && (
          <p className="text-red-500">{errors.confirmationNumber}</p>
        )}
      </div>

      <div>
        <label>Nombre Cliente</label>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="w-full border px-2 py-1"
        />
        {errors.clientName && (
          <p className="text-red-500">{errors.clientName}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Fecha Emisión</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full border px-2 py-1"
          />
          {errors.issueDate && (
            <p className="text-red-500">{errors.issueDate}</p>
          )}
        </div>
        <div>
          <label>Fecha Vto. (opcional)</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full border px-2 py-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Pasajeros (cant.)</label>
          <input
            type="number"
            value={paxCount}
            onChange={(e) => setPaxCount(e.target.value)}
            className="w-full border px-2 py-1"
          />
          {errors.paxCount && <p className="text-red-500">{errors.paxCount}</p>}
        </div>
        <div>
          <label>Total</label>
          <input
            type="number"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="w-full border px-2 py-1"
          />
          {errors.total && <p className="text-red-500">{errors.total}</p>}
        </div>
      </div>

      <div>
        <label>Servicios (Título:detalle por línea)</label>
        <textarea
          rows={3}
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
          className="w-full border px-2 py-1"
        />
      </div>

      <div>
        <label>Cláusulas / Condiciones</label>
        <textarea
          rows={3}
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          className="w-full border px-2 py-1"
        />
      </div>

      <div>
        <label>Datos pasajeros (opcional)</label>
        <textarea
          rows={2}
          value={passengerData}
          onChange={(e) => setPassengerData(e.target.value)}
          className="w-full border px-2 py-1"
        />
      </div>

      <div>
        <label>Región</label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as ConfirmationRegion)}
          className="w-full border px-2 py-1"
        >
          <option value="argentina">Argentina</option>
          <option value="brasil">Brasil</option>
          <option value="caribe">Caribe</option>
          <option value="europa">Europa</option>
        </select>
      </div>

      <div>
        <label>Moneda</label>
        <select
          value={currency}
          onChange={(e) =>
            setCurrency(e.target.value as Confirmation["currency"])
          }
          className="w-full border px-2 py-1"
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <button type="submit" disabled={loadingImg} className="btn-primary">
        {loadingImg ? "Procesando imagen…" : "Generar vista previa"}
      </button>
    </form>
  );
}
