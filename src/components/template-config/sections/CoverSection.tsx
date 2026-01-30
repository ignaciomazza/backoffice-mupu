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
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="inline-flex size-8 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-400/20 dark:text-amber-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v9A2.25 2.25 0 0119.5 18h-15a2.25 2.25 0 01-2.25-2.25Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.25-5.25a2.25 2.25 0 013.182 0l1.5 1.5a2.25 2.25 0 003.182 0l3.318-3.318"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 8.25h.008v.008H15.75V8.25Z"
            />
          </svg>
        </span>
        Portada
      </h2>

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
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-900 shadow-sm shadow-sky-950/10 dark:text-white"
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
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/10 shadow-sm shadow-sky-950/10">
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
                    className="overflow-hidden rounded-xl border border-white/10 bg-white/10 p-2 shadow-sm shadow-sky-950/10"
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
                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
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
