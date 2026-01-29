// src/components/clients/ClientRelationsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { Client, PassengerCategory, ClientSimpleCompanion } from "@/types";
import { authFetch } from "@/utils/authFetch";
import ClientPicker from "./ClientPicker";
import Spinner from "@/components/Spinner";

type Props = {
  client: Client;
  token?: string | null;
  passengerCategories?: PassengerCategory[];
  onClose: () => void;
};

const PANEL =
  "rounded-3xl border border-white/10 bg-white/10 p-4 shadow-sm shadow-sky-950/10 backdrop-blur";

export default function ClientRelationsPanel({
  client,
  token,
  passengerCategories = [],
  onClose,
}: Props) {
  const [relations, setRelations] = useState<
    Array<{ id_relation: number; related_client: Client }>
  >([]);
  const [relLoading, setRelLoading] = useState(false);
  const [simpleLoading, setSimpleLoading] = useState(false);
  const [simpleCompanions, setSimpleCompanions] = useState<
    ClientSimpleCompanion[]
  >([]);
  const [newCompanion, setNewCompanion] = useState<{
    category_id: string;
    age: string;
    notes: string;
  }>({ category_id: "", age: "", notes: "" });

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setRelLoading(true);
    (async () => {
      try {
        const res = await authFetch(
          `/api/client-relations?client_id=${client.id_client}`,
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudieron cargar relaciones");
        const data = (await res.json().catch(() => [])) as Array<{
          id_relation: number;
          related_client?: Client;
        }>;
        if (!alive) return;
        setRelations(
          data.filter((r) => r.related_client) as Array<{
            id_relation: number;
            related_client: Client;
          }>,
        );
      } catch {
        if (alive) setRelations([]);
      } finally {
        if (alive) setRelLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, client.id_client]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setSimpleLoading(true);
    (async () => {
      try {
        const res = await authFetch(
          `/api/client-simple-companions?client_id=${client.id_client}`,
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudieron cargar acompañantes");
        const data = (await res.json().catch(() => [])) as ClientSimpleCompanion[];
        if (alive) setSimpleCompanions(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setSimpleCompanions([]);
      } finally {
        if (alive) setSimpleLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, client.id_client]);

  const addRelation = async (rel: Client) => {
    if (!token) return;
    try {
      const res = await authFetch(
        "/api/client-relations",
        {
          method: "POST",
          body: JSON.stringify({
            client_id: client.id_client,
            related_client_id: rel.id_client,
          }),
        },
        token,
      );
      if (!res.ok) return;
      const reload = await authFetch(
        `/api/client-relations?client_id=${client.id_client}`,
        { cache: "no-store" },
        token,
      );
      if (reload.ok) {
        const data = (await reload.json().catch(() => [])) as Array<{
          id_relation: number;
          related_client?: Client;
        }>;
        setRelations(
          data.filter((r) => r.related_client) as Array<{
            id_relation: number;
            related_client: Client;
          }>,
        );
      }
    } catch {
      // ignore
    }
  };

  const removeRelation = async (relId: number) => {
    if (!token) return;
    try {
      const current = relations.find((r) => r.related_client.id_client === relId);
      if (!current?.id_relation) return;
      const res = await authFetch(
        `/api/client-relations/${current.id_relation}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) return;
      setRelations((prev) =>
        prev.filter((c) => c.related_client.id_client !== relId),
      );
    } catch {
      // ignore
    }
  };

  const addSimpleCompanion = async () => {
    if (!token) return;
    try {
      const payload = {
        client_id: client.id_client,
        category_id: newCompanion.category_id
          ? Number(newCompanion.category_id)
          : null,
        age: newCompanion.age ? Number(newCompanion.age) : null,
        notes: newCompanion.notes,
      };
      const res = await authFetch(
        "/api/client-simple-companions",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) return;
      const created = (await res.json().catch(() => null)) as
        | ClientSimpleCompanion
        | null;
      if (created) {
        setSimpleCompanions((prev) => [...prev, created]);
      }
      setNewCompanion({ category_id: "", age: "", notes: "" });
    } catch {
      // ignore
    }
  };

  const removeSimpleCompanion = async (id?: number) => {
    if (!token || !id) return;
    try {
      const res = await authFetch(
        `/api/client-simple-companions/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) return;
      setSimpleCompanions((prev) =>
        prev.filter((c) => c.id_template !== id),
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className={`${PANEL} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/60 dark:text-white/60">
            Relaciones y acompañantes
          </p>
          <p className="text-lg font-semibold">
            {client.first_name} {client.last_name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
        >
          Cerrar
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-sm font-semibold">Relaciones</p>
          {relLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs opacity-70">
              <Spinner />
              Cargando…
            </div>
          ) : relations.length === 0 ? (
            <p className="mt-2 text-xs opacity-70">
              No hay relaciones cargadas.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {relations.map((r) => (
                <span
                  key={`rel-${r.related_client.id_client}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1"
                >
                  {`${r.related_client.first_name ?? ""} ${r.related_client.last_name ?? ""}`.trim() ||
                    `Pax ${
                      r.related_client.agency_client_id ??
                      r.related_client.id_client
                    }`}
                  <button
                    type="button"
                    onClick={() => removeRelation(r.related_client.id_client)}
                    className="text-rose-600 hover:text-rose-700"
                    aria-label="Eliminar relación"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3">
            <ClientPicker
              token={token}
              label="Agregar relación"
              placeholder="Buscar pax..."
              valueId={null}
              excludeIds={[
                client.id_client,
                ...relations.map((r) => r.related_client.id_client),
              ]}
              onSelect={addRelation}
              onClear={() => undefined}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-sm font-semibold">Acompañantes simples</p>
          {simpleLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs opacity-70">
              <Spinner />
              Cargando…
            </div>
          ) : simpleCompanions.length === 0 ? (
            <p className="mt-2 text-xs opacity-70">
              No hay acompañantes simples guardados.
            </p>
          ) : (
            <div className="mt-2 space-y-2 text-xs">
              {simpleCompanions.map((c) => (
                <div
                  key={`simple-${c.id_template}`}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <span className="font-medium">
                    {c.category?.name || "Sin categoría"}
                  </span>
                  {c.age != null && <span>· {c.age} años</span>}
                  {c.notes && <span>· {c.notes}</span>}
                  <button
                    type="button"
                    onClick={() => removeSimpleCompanion(c.id_template)}
                    className="ml-auto text-rose-600 hover:text-rose-700"
                    aria-label="Eliminar acompañante"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_0.6fr_1.2fr_auto]">
            <select
              value={newCompanion.category_id}
              onChange={(e) =>
                setNewCompanion((prev) => ({
                  ...prev,
                  category_id: e.target.value,
                }))
              }
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
            >
              <option value="">Categoría</option>
              {passengerCategories
                .filter((p) => p.enabled !== false)
                .map((p) => (
                  <option key={p.id_category} value={p.id_category}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={0}
              value={newCompanion.age}
              onChange={(e) =>
                setNewCompanion((prev) => ({
                  ...prev,
                  age: e.target.value,
                }))
              }
              placeholder="Edad"
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={newCompanion.notes}
              onChange={(e) =>
                setNewCompanion((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              placeholder="Notas"
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={addSimpleCompanion}
              className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
