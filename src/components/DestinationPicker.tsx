// src/components/DestinationPicker.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";

type PickerType = "destination" | "country";

type APICountry = {
  id_country: number;
  name: string;
  iso2: string;
  enabled?: boolean;
};

type APIDestination = {
  id_destination: number;
  name: string;
  slug: string;
  alt_names: string[];
  popularity: number;
  enabled: boolean;
  country: { id_country: number; name: string; iso2: string };
};

export type DestinationOption = {
  id: number;
  kind: PickerType; // "destination" | "country"
  name: string; // "Salta" o "Argentina"
  country?: { id: number; name: string; iso2: string }; // presente cuando kind = "destination"
  // Campo de ayuda para que guardes un string amigable en Service.destination
  displayLabel: string; // p.ej. "Salta, Argentina (AR)" o "Argentina (AR)"
  raw?: APIDestination | APICountry;
};

type DestinationPickerProps = {
  /** "destination" por defecto */
  type?: PickerType;
  /** Selección simple o múltiple */
  multiple?: boolean;
  /** Valor controlado desde afuera (opcional). Para multiple, enviar array */
  value?: DestinationOption | DestinationOption[] | null;
  /** Notifica cada vez que cambia la selección */
  onChange: (val: DestinationOption | DestinationOption[] | null) => void;
  /** Notifica si hay una selección válida (útil para deshabilitar submit) */
  onValidChange?: (valid: boolean) => void;
  /** Placeholder del input */
  placeholder?: string;
  /** Deshabilitar interacción */
  disabled?: boolean;
  /** Autofocus al montar */
  autoFocus?: boolean;
  /** Clase extra */
  className?: string;
  /** Nombre del input (por si lo integrás a un form) */
  name?: string;
  /** Texto de ayuda debajo del campo */
  hint?: string;
  /** Mínimo de caracteres para empezar a buscar */
  minChars?: number; // default 1
};

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Normaliza a una etiqueta "bonita" para mostrar en el chip/input */
const toLabel = (opt: DestinationOption) => {
  if (opt.kind === "destination" && opt.country) {
    return `${opt.name}, ${opt.country.name} (${opt.country.iso2})`;
  }
  if (opt.kind === "country" && opt.country) {
    return `${opt.name} (${opt.country.iso2})`;
  }
  // país sin country anidado (caso raro) o destino sin país (no debería pasar)
  return opt.name;
};

export default function DestinationPicker({
  type = "destination",
  multiple = false,
  value = null,
  onChange,
  onValidChange,
  placeholder,
  disabled,
  autoFocus,
  className = "",
  name,
  hint,
  minChars = 1,
}: DestinationPickerProps) {
  const { token } = useAuth();

  // Estado interno (para modo no-controlado visual del input)
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 350);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<DestinationOption[]>([]);
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Normaliza el "value" a lista para simplificar lógica
  const selectedList: DestinationOption[] = useMemo(() => {
    if (multiple) return (value as DestinationOption[]) || [];
    return value ? [value as DestinationOption] : [];
  }, [value, multiple]);

  // Validez: hay al menos un seleccionado (o exactamente uno en single)
  const isValid = multiple
    ? selectedList.length > 0
    : selectedList.length === 1;

  useEffect(() => {
    onValidChange?.(isValid);
  }, [isValid, onValidChange]);

  // Cierra el popover si se hace click afuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Buscar opciones (destinos o países)
  const fetchOptions = useCallback(
    async (q: string) => {
      if (!token) return;
      if (abortRef.current) abortRef.current.abort();
      const c = new AbortController();
      abortRef.current = c;

      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        params.set("take", "15");
        // no queremos inactivos
        params.set("includeDisabled", "false");

        const url =
          type === "destination"
            ? `/api/destinations?${params.toString()}`
            : `/api/countries?${params.toString()}`;

        const res = await authFetch(
          url,
          { cache: "no-store", signal: c.signal },
          token,
        );

        if (!res.ok) throw new Error("No se pudo obtener resultados");

        const json = await res.json();

        const opts: DestinationOption[] =
          type === "destination"
            ? ((json.items as APIDestination[]) || []).map((d) => ({
                id: d.id_destination,
                kind: "destination",
                name: d.name,
                country: {
                  id: d.country.id_country,
                  name: d.country.name,
                  iso2: d.country.iso2,
                },
                displayLabel: `${d.name}, ${d.country.name} (${d.country.iso2})`,
                raw: d,
              }))
            : ((json.items as APICountry[]) || []).map((c) => ({
                id: c.id_country,
                kind: "country",
                name: c.name,
                country: { id: c.id_country, name: c.name, iso2: c.iso2 },
                displayLabel: `${c.name} (${c.iso2})`,
                raw: c,
              }));

        // Excluir los que ya están seleccionados (en multiple)
        const filtered =
          multiple && selectedList.length
            ? opts.filter(
                (o) =>
                  !selectedList.some((s) => s.kind === o.kind && s.id === o.id),
              )
            : opts;

        setOptions(filtered);
        setHighlight(0);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [token, type, multiple, selectedList],
  );

  // Dispara búsqueda cuando cambia el query debounced
  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < minChars) {
      setOptions([]);
      return;
    }
    fetchOptions(debounced);
  }, [debounced, fetchOptions, open, minChars]);

  // Helpers de selección
  const commitSingle = (opt: DestinationOption | null) => {
    onChange(opt);
    if (opt) {
      setQuery(toLabel(opt)); // espejo del valor elegido
    } else {
      setQuery("");
    }
    setOpen(false);
  };

  const commitMultipleAdd = (opt: DestinationOption) => {
    const next = [...selectedList, opt];
    onChange(next);
    setQuery("");
    // Mantener el popover abierto para seguir sumando
    setOpen(true);
    // Reconsultar para que desaparezca de la lista
    fetchOptions("");
    inputRef.current?.focus();
  };

  const removeTag = (id: number, kind: PickerType) => {
    const next = selectedList.filter((s) => !(s.id === id && s.kind === kind));
    onChange(multiple ? next : null);
  };

  // Teclado
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (!opt) return;
      if (multiple) commitMultipleAdd(opt);
      else commitSingle(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const currentLabel = useMemo(() => {
    // En múltiple el input debe reflejar lo que se escribe
    if (multiple) return query;

    // En single: si hay selección y no hay query, mostramos la etiqueta del seleccionado
    if (selectedList[0] && query.trim() === "") return toLabel(selectedList[0]);

    // Si hay query (esté o no seleccionado algo), mostramos lo que escribe el usuario
    return query;
  }, [multiple, selectedList, query]);

  return (
    <div ref={rootRef} className={`w-full ${className}`}>
      <label className="mb-1 block text-sm opacity-80">
        {type === "destination" ? "Destino" : "País"}
      </label>

      {/* Input + chips (para multiple) */}
      <div
        className={`relative flex min-h-[42px] items-center gap-2 rounded-2xl border border-white/10 bg-white/50 p-2 shadow-sm shadow-sky-950/10 backdrop-blur dark:bg-white/10 ${
          disabled ? "opacity-60" : ""
        }`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {multiple && selectedList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedList.map((s) => (
              <span
                key={`${s.kind}-${s.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-xs text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
                title={toLabel(s)}
              >
                {s.kind === "destination" && s.country
                  ? `${s.name}, ${s.country.name}`
                  : s.name}
                <button
                  type="button"
                  aria-label="Eliminar"
                  className="rounded-full p-1 hover:bg-white/40 dark:hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(s.id, s.kind);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          name={name}
          disabled={disabled}
          autoFocus={autoFocus}
          value={currentLabel}
          onChange={(e) => {
            // si es single y hay uno elegido, al tipear reseteamos la selección
            if (!multiple && selectedList[0]) {
              onChange(null);
            }
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ??
            (type === "destination"
              ? "Ej.: París, Salta…"
              : "Ej.: Argentina, Francia…")
          }
          className={`flex-1 bg-transparent outline-none placeholder:font-light ${multiple ? "min-w-[180px]" : ""}`}
        />

        {/* Clear */}
        {!multiple && selectedList[0] && !disabled && (
          <button
            type="button"
            className="rounded-full p-1 hover:bg-white/40 dark:hover:bg-white/10"
            aria-label="Limpiar selección"
            onClick={(e) => {
              e.stopPropagation();
              commitSingle(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {hint && (
        <p className="mt-1 text-xs text-sky-950/70 dark:text-white/70">
          {hint}
        </p>
      )}

      {/* Popover de resultados */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative z-20"
          >
            <div className="absolute mt-2 max-h-[48vh] w-full overflow-auto rounded-2xl border border-white/10 bg-white/95 p-1 shadow-2xl backdrop-blur dark:bg-sky-950/90">
              {/* Estado de búsqueda */}
              {loading && (
                <div className="flex items-center justify-center p-4">
                  <Spinner />
                </div>
              )}

              {!loading && debounced.trim().length < minChars && (
                <div className="p-3 text-sm opacity-70">
                  Escribí al menos {minChars} caracter(es)…
                </div>
              )}

              {!loading &&
                debounced.trim().length >= minChars &&
                (options.length === 0 ? (
                  <div className="p-3 text-sm opacity-70">Sin resultados</div>
                ) : (
                  <ul role="listbox" aria-label="Resultados">
                    {options.map((opt, idx) => (
                      <li key={`${opt.kind}-${opt.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={idx === highlight}
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() =>
                            multiple
                              ? commitMultipleAdd(opt)
                              : commitSingle(opt)
                          }
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            idx === highlight
                              ? "bg-sky-100 text-sky-900 dark:bg-white/10 dark:text-white"
                              : "hover:bg-sky-100/60 hover:text-sky-900 dark:hover:bg-white/5"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {/* Icono simple por tipo */}
                            <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/50 dark:bg-white/10">
                              {opt.kind === "destination" ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="size-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.6}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 10.5c0 7.142-7.5 10.5-7.5 10.5S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="size-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.6}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 7.5l9-4.5 9 4.5M3 7.5v9l9 4.5 9-4.5v-9"
                                  />
                                </svg>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {opt.kind === "destination" && opt.country
                                  ? `${opt.name}, ${opt.country.name}`
                                  : opt.name}
                              </p>
                              <p className="truncate text-xs opacity-70">
                                {opt.kind === "destination" && opt.country
                                  ? `País: ${opt.country.name} (${opt.country.iso2})`
                                  : `ISO: ${opt.country?.iso2 ?? "-"}`}
                              </p>
                            </div>
                          </div>

                          {!multiple && idx === highlight && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900 dark:bg-white/10 dark:text-white">
                              Enter
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
