// src/components/templates/QuoteForm.tsx
"use client";

import React, { useState } from "react";
import { Quote } from "@/types";
import Spinner from "../Spinner";

export type SimpleQuote = Pick<
  Quote,
  "tripTitle" | "dateRange" | "region" | "price" | "currency" | "concept"
> & {
  logoBase64?: string;
  regionBase64?: string;
};

export default function QuoteForm({
  onSubmit, 
}: {
  onSubmit: (data: SimpleQuote) => void;
}) {
  const [tripTitle, setTripTitle] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [region, setRegion] = useState<Quote["region"]>("argentina");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Quote["currency"]>("ARS");
  const [concept, setConcept] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!tripTitle.trim()) e.tripTitle = "Requerido";
    if (!dateRange.trim()) e.dateRange = "Requerido";
    if (isNaN(Number(price))) e.price = "Debe ser un número";
    return e;
  };

  async function fetchBase64(
    path: string,
    quality = 0.2, // calidad JPEG entre 0 (muy baja) y 1 (máxima)
    maxWidth = 800, // ancho máximo en px
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
          resolve(dataUrl.split(",")[1]); // base64 sólo
        };
      });
    } catch {
      return undefined;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setLoading(true);

    // obtenemos y comprimimos imágenes
    const [logoBase64, regionBase64] = await Promise.all([
      fetchBase64("/logo.png", 0.6, 200),
      fetchBase64(`/images/${region}.jpg`, 0.4, 800),
    ]);

    setLoading(false);

    onSubmit({
      tripTitle: tripTitle.trim(),
      dateRange: dateRange.trim(),
      region,
      price: Number(price),
      currency,
      concept,
      logoBase64,
      regionBase64,
    });
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v);

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
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
          <option value="norte-argentino">Norte Argentino</option>
          <option value="patagonia">Patagonia</option>
          <option value="ski">Ski</option>
          <option value="iguazu">Iguazu</option>
          <option value="mendoza">Mendoza</option>
          <option value="brasil">Brasil</option>
          <option value="caribe">Caribe</option>
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
      </div>

      {/* Precio y moneda */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Precio</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            placeholder="Escribir..."
          />
          <p>{fmtCurrency(Number(price))}</p>
          {errors.price && <p className="text-red-500">{errors.price}</p>}
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
      </div>

      <div>
        <label>Concepto</label>
        <input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Precio por persona. Base Doble. Impuestos incluidos."
        />
        {errors.concept && <p className="text-red-500">{errors.concept}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-44 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
      >
        {loading ? <Spinner /> : "Vista previa"}
      </button>
    </form>
  );
}
