// src/components/agency/AgencyArcaCard.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function AgencyArcaCard() {
  return (
    <motion.div
      layout
      className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
    >
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-sky-950 dark:text-white">
          ARCA – Conexión en producción
        </h2>
        <p className="text-sm text-sky-950/70 dark:text-white/70">
          Configurá el CUIT representado y autorizá servicios con Automations
          de Afip SDK. Todo en producción, sin mezclas de ambientes.
        </p>
      </div>

      <Link
        href="/arca"
        className="inline-flex rounded-full border border-sky-500/40 bg-sky-500/20 px-5 py-2 text-sm text-white shadow-sm transition-transform hover:scale-95 active:scale-90"
      >
        Ir a Conectar ARCA
      </Link>
    </motion.div>
  );
}
