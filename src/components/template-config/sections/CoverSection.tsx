// src/components/template-config/sections/CoverSection.tsx

"use client";
import React, { useMemo, useState } from "react";
import { getAt, setAt, section, input, isObject } from "./_helpers";
import { Config, CoverSavedItem } from "../types";

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

const CoverSection: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  const coverMode = getAt<string>(cfg, ["coverImage", "mode"], "logo");
  const coverUrl = getAt<string>(cfg, ["coverImage", "url"], "");
  const savedRaw = getAt<unknown>(cfg, ["coverImage", "saved"], []);

  // saved estable (evita que cambie de referencia en cada render)
  const saved = useMemo<CoverSavedItem[]>(() => {
    if (!Array.isArray(savedRaw)) return [];
    return savedRaw
      .filter(isObject)
      .map((o) => ({ name: String(o.name || ""), url: String(o.url || "") }));
  }, [savedRaw]);

  const [tempName, setTempName] = useState("");
  const [tempUrl, setTempUrl] = useState("");

  const setCoverMode = (m: "logo" | "url") =>
    onChange(setAt(cfg, ["coverImage", "mode"], m));
  const setCoverUrl = (u: string) =>
    onChange(setAt(cfg, ["coverImage", "url"], u));

  const addToLibrary = () => {
    if (!tempName.trim() || !tempUrl.trim()) return;
    const dedup = new Map(saved.map((s) => [s.url, s]));
    dedup.set(tempUrl.trim(), { name: tempName.trim(), url: tempUrl.trim() });
    onChange(setAt(cfg, ["coverImage", "saved"], Array.from(dedup.values())));
    setTempName("");
    setTempUrl("");
  };

  const removeFromLibrary = (url: string) => {
    onChange(
      setAt(
        cfg,
        ["coverImage", "saved"],
        saved.filter((s) => s.url !== url),
      ),
    );
    if (coverUrl === url) setCoverUrl("");
  };

  const selectValue = useMemo(() => {
    const hit = saved.find((s) => s.url === coverUrl);
    return hit ? hit.url : "";
  }, [saved, coverUrl]);

  return (
    <section className={section}>
      <h2 className="mb-3 text-lg font-semibold">Portada</h2>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={coverMode === "logo"}
            onChange={() => setCoverMode("logo")}
            disabled={disabled}
          />
          Logo de la agencia
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={coverMode === "url"}
            onChange={() => setCoverMode("url")}
            disabled={disabled}
          />
          Usar URL
        </label>
      </div>

      {coverMode === "url" && (
        <div className="mt-3 space-y-3">
          {/* Guardar con nombre */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input
              className={input}
              placeholder="Nombre"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              disabled={disabled}
            />
            <input
              className={input}
              placeholder="https://…/portada.jpg"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={addToLibrary}
              disabled={disabled || !tempName || !tempUrl}
              className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
              title="Guardar en biblioteca"
            >
              Guardar
            </button>
          </div>

          {/* Select para elegir guardadas */}
          {saved.length > 0 && (
            <label className="block text-sm">
              Elegir portada
              <select
                className={`${input} mt-1 cursor-pointer`}
                value={selectValue}
                onChange={(e) => setCoverUrl(e.target.value)}
                disabled={disabled}
              >
                <option value="">Seleccionar</option>
                {saved.map((s) => (
                  <option key={s.url} value={s.url}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Vista previa */}
          {coverUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-900/10 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt="Vista previa portada"
                className="max-h-48 w-full object-cover"
              />
            </div>
          ) : null}

          {/* Biblioteca (grid con quitar) */}
          {saved.length > 0 && (
            <div className="mt-2">
              <p className="mb-2 text-sm opacity-80">Biblioteca</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {saved.map((s) => (
                  <div
                    key={s.url}
                    className="overflow-hidden rounded-xl border border-slate-900/10 p-2 dark:border-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.url}
                      alt={s.name}
                      className="h-24 w-full cursor-pointer rounded-lg object-cover"
                      onClick={() => setCoverUrl(s.url)}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div
                        className="truncate text-sm opacity-80"
                        title={s.name}
                      >
                        {s.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromLibrary(s.url)}
                        className="rounded-full bg-red-600 px-2 py-1 text-red-100 dark:bg-red-800"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="size-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18 18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default CoverSection;
