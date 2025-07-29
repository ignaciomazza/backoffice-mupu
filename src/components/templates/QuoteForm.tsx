// src/components/templates/QuoteForm.tsx
"use client";

import React, { useState } from "react";
import { Quote } from "@/types";
import Spinner from "../Spinner";

export type SimpleQuote = Pick<
  Quote,
  "tripTitle" | "dateRange" | "region" | "currency" | "phone"
> & {
  logoBase64?: string;
  regionBase64?: string;
  items: { price: number; concept: string }[];
};

export default function QuoteForm({
  onSubmit,
}: {
  onSubmit: (data: SimpleQuote) => void;
}) {
  const [tripTitle, setTripTitle] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [region, setRegion] = useState<Quote["region"]>("");
  const [currency, setCurrency] = useState<Quote["currency"]>("ARS");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ price: "", concept: "" }] as {
    price: string;
    concept: string;
  }[]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!tripTitle.trim()) e.tripTitle = "Requerido";
    if (!dateRange.trim()) e.dateRange = "Requerido";
    if (!region) e.region = "Requerido";
    if (!phone) e.phone = "Requerido";
    items.forEach((it, i) => {
      if (!it.price) e[`price-${i}`] = "Requerido";
      if (!it.concept.trim()) e[`concept-${i}`] = "Requerido";
    });
    return e;
  };

  async function fetchBase64(
    path: string,
    quality = 0.2,
    maxWidth = 800,
  ): Promise<string | undefined> {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
          const scale = maxWidth / img.width;
          const w = maxWidth;
          const h = img.height * scale;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl.split(",")[1]);
        };
      });
    } catch {
      return undefined;
    }
  }

  const handleItemChange = (
    idx: number,
    field: "price" | "concept",
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  };

  const addItem = () =>
    setItems((prev) => [...prev, { price: "", concept: "" }]);

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setLoading(true);

    const [logoBase64, regionBase64] = await Promise.all([
      fetchBase64("/logo.png", 0.6, 200),
      fetchBase64(`/images/${region}.jpg`, 0.4, 800),
    ]);
    setLoading(false);

    onSubmit({
      tripTitle: tripTitle.trim(),
      dateRange: dateRange.trim(),
      region,
      currency,
      phone,
      logoBase64,
      regionBase64,
      items: items.map((it) => ({
        price: Number(it.price),
        concept: it.concept.trim(),
      })),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-6 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md backdrop-blur dark:text-white"
    >
      {/* Título del viaje */}
      <div>
        <label>Nombre del archivo</label>
        <input
          value={tripTitle}
          onChange={(e) => setTripTitle(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Escribir..."
        />
        {errors.tripTitle && <p className="text-red-500">{errors.tripTitle}</p>}
      </div>

      {/* Datos del viaje */}
      <div>
        <label>Datos del viaje</label>
        <textarea
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Escribir..."
        />
        {errors.dateRange && <p className="text-red-500">{errors.dateRange}</p>}
      </div>

      {/* Región */}
      <div>
        <label>Región</label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as Quote["region"])}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
        >
          <option value="" disabled>
            Seleccionar
          </option>
          <option value="norte-argentino">Norte Argentino</option>
          <option value="patagonia">Patagonia</option>
          <option value="ski">Ski</option>
          <option value="iguazu">Iguazu</option>
          <option value="mendoza">Mendoza</option>
          <option value="brasil">Brasil</option>
          <option value="caribe">Caribe</option>
          <option value="peru">Peru</option>
          <option value="safari">Safari</option>
          <option value="desierto-africa">Desierto de Africa</option>
          <option value="europa">Ciudad Europea</option>
          <option value="norte-europa">Norte Europeo</option>
          <option value="playa-europa">Playa Europea</option>
          <option value="auroras-boreales">Auroras Boreales</option>
          <option value="tailandia">Tailandia</option>
          <option value="japon">Japon</option>
          <option value="miami">Miami</option>
          <option value="nueva-york">Nueva York</option>
          <option value="california">California</option>
          <option value="seleccion">Seleccion Argentina</option>
          <option value="formula-1">Formula 1</option>
        </select>
        {errors.region && <p className="text-red-500">{errors.region}</p>}
      </div>

      {/* Precios y Conceptos */}
      <div>
        <label className="font-medium">Precios y Conceptos</label>
        <div className="space-y-4">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-end gap-4">
              <div className="basis-full">
                <label>Precio</label>
                <input
                  type="number"
                  step="0.01"
                  value={it.price}
                  onChange={(e) =>
                    handleItemChange(idx, "price", e.target.value)
                  }
                  className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="0.00"
                />
                {errors[`price-${idx}`] && (
                  <p className="text-red-500">{errors[`price-${idx}`]}</p>
                )}
              </div>
              <div className="basis-full">
                <label>Concepto</label>
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
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-4 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
          onChange={(e) => setCurrency(e.target.value as Quote["currency"])}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* Telefono */}
      <div>
        <label>Telefono</label>
        <select
          value={phone}
          onChange={(e) => setPhone(e.target.value as Quote["phone"])}
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

      <button
        type="submit"
        disabled={loading}
        className="w-44 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
      >
        {loading ? <Spinner /> : "Vista previa"}
      </button>
    </form>
  );
}
