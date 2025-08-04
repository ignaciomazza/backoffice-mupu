// src/components/templates/ConfirmationForm.tsx
"use client";

import React, { useState } from "react";
import { Confirmation } from "@/types";
import Spinner from "../Spinner";

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
  const [payment, setPayment] = useState("");
  const [phone, setPhone] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [itemsPassenger, setItemsPassenger] = useState([
    { name: "", dni: "", birth: "" },
  ] as {
    name: string;
    dni: string;
    birth: string;
  }[]);
  const [items, setItems] = useState([{ price: "", concept: "" }] as {
    price: string;
    concept: string;
  }[]);
  const [currency, setCurrency] = useState<Confirmation["currency"]>("ARS");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!confirmationNumber.trim()) e.confirmationNumber = "Requerido";
    if (!clientName.trim()) e.clientName = "Requerido";
    if (!issueDate.trim()) e.issueDate = "Requerido";
    items.forEach((it, i) => {
      if (!it.price) e[`price-${i}`] = "Requerido";
      if (!it.concept.trim()) e[`concept-${i}`] = "Requerido";
    });
    return e;
  };

  const handleItemChange = (
    idx: number,
    field: "price" | "concept",
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  };

  const handleItemPassengerChange = (
    idx: number,
    field: "name" | "dni" | "birth",
    value: string,
  ) => {
    setItemsPassenger((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  };

  const addItem = () =>
    setItems((prev) => [...prev, { price: "", concept: "" }]);

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const addItemPassenger = () =>
    setItemsPassenger((prev) => [...prev, { name: "", dni: "", birth: "" }]);

  const removeItemPassenger = (idx: number) =>
    setItemsPassenger((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setLoadingImg(true);

    // Fetch y Base64 del logo según región
    let logoBase64: string | undefined;
    try {
      const res = await fetch(`/images/avion.jpg`);
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      logoBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } catch {
      logoBase64 = undefined;
    }
    setLoadingImg(false);

    onSubmit({
      confirmationNumber: confirmationNumber.trim(),
      clientName: clientName.trim(),
      issueDate: issueDate.trim(),
      expiryDate: expiryDate.trim(),
      services: servicesText.trim(),
      payment: payment.trim(),
      itemsPassenger: itemsPassenger.map((it) => ({
        name: it.name.trim(),
        dni: it.dni.trim(),
        birth: it.birth.trim(),
      })),
      items: items.map((it) => ({
        price: Number(it.price),
        concept: it.concept.trim(),
      })),
      currency,
      phone,
      logoBase64,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-6 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      {/* Número de confirmación */}
      <div>
        <label>N° Confirmación</label>
        <input
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Ej: 12345"
        />
        {errors.confirmationNumber && (
          <p className="text-red-500">{errors.confirmationNumber}</p>
        )}
      </div>

      {/* Nombre del cliente */}
      <div>
        <label>Titular</label>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Nombre completo"
        />
        {errors.clientName && (
          <p className="text-red-500">{errors.clientName}</p>
        )}
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label>Fecha de Alta</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          {errors.issueDate && (
            <p className="text-red-500">{errors.issueDate}</p>
          )}
        </div>
        <div>
          <label>Fecha Vto.</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
        </div>
      </div>

      {/* Pax y total */}
      <div>
        <label>Telefono</label>
        <select
          value={phone}
          onChange={(e) => setPhone(e.target.value as Confirmation["phone"])}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
        >
          <option value="" disabled>
            Seleccionar
          </option>
          <option value="+54 9 11 5970 1234">+54 9 11 5970 1234</option>
          <option value="+54 9 11 2401 5658">+54 9 11 2401 5658</option>
          <option value="+54 9 11 3422 4808">+54 9 11 3422 4808</option>
          <option value="+54 9 11 4024 8903">+54 9 11 4024 8903</option>
          <option value="+54 9 11 7061 7492">+54 9 11 7061 7492</option>
          <option value="+54 9 11 2881 7030">+54 9 11 2881 7030</option>
          <option value="+54 9 11 3648 1636">+54 9 11 3648 1636</option>
        </select>
        {errors.phone && <p className="text-red-500">{errors.phone}</p>}
      </div>

      {/* Servicios */}
      <div>
        <label>Servicios </label>
        <textarea
          rows={3}
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Escribir..."
        />
      </div>
      <div>
        <label>Datos pasajeros</label>
        {itemsPassenger.map((it, idx) => (
          <div key={idx} className="mb-3 flex w-full gap-3">
            <input
              type="text"
              value={it.name}
              onChange={(e) =>
                handleItemPassengerChange(idx, "name", e.target.value)
              }
              className="basis-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Nombre completo"
            />
            <input
              type="text"
              value={it.dni}
              onChange={(e) =>
                handleItemPassengerChange(idx, "dni", e.target.value)
              }
              className="basis-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="DNI"
            />
            <input
              type="text"
              value={it.birth}
              onChange={(e) =>
                handleItemPassengerChange(idx, "birth", e.target.value)
              }
              className="basis-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Fecha de nacimiento"
            />
            {itemsPassenger.length > 1 && (
              <button
                type="button"
                onClick={() => removeItemPassenger(idx)}
                disabled={itemsPassenger.length === 1}
                className="w-fit cursor-pointer rounded-full bg-red-600 p-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
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
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addItemPassenger}
          className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
      </div>

      {/* Precios y Conceptos */}
      <div>
        {items.map((it, idx) => (
          <div key={idx}>
            <div className="mb-1 flex w-full gap-3">
              <div className="basis-full">
                <input
                  type="number"
                  step="0.01"
                  value={it.price}
                  onChange={(e) =>
                    handleItemChange(idx, "price", e.target.value)
                  }
                  className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="Precio"
                />
                {errors[`price-${idx}`] && (
                  <p className="text-red-500">{errors[`price-${idx}`]}</p>
                )}
              </div>
              <div className="basis-full">
                <input
                  value={it.concept}
                  onChange={(e) =>
                    handleItemChange(idx, "concept", e.target.value)
                  }
                  className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="Descripción"
                />
                {errors[`concept-${idx}`] && (
                  <p className="text-red-500">{errors[`concept-${idx}`]}</p>
                )}
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="w-fit cursor-pointer rounded-full bg-red-600 p-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
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
              )}
            </div>
            <p className="mb-3 ml-1">
              {new Intl.NumberFormat("es-AR", {
                style: "currency",
                currency: currency,
              }).format(Number(it.price))}
            </p>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
      </div>

      <div>
        <label>Moneda</label>
        <select
          value={currency}
          onChange={(e) =>
            setCurrency(e.target.value as Confirmation["currency"])
          }
          className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* Nombre del cliente */}
      <div>
        <label>Plan de pago (opcional)</label>
        <textarea
          rows={3}
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Pago"
        />
        {errors.clientName && <p className="text-red-500">{errors.payment}</p>}
      </div>

      {/* Botón */}
      <button
        type="submit"
        disabled={loadingImg}
        className="mt-4 w-44 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
      >
        {loadingImg ? <Spinner /> : "Vista previa"}
      </button>
    </form>
  );
}
