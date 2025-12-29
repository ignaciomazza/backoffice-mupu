//  src/components/template-config/sections/ContactSection.tsx

"use client";
import React from "react";
import { setAt, section, asStringArray } from "./_helpers";
import { Config } from "../types";

const CONTACT_OPTIONS = [
  "phones",
  "email",
  "website",
  "address",
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
] as const;

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

const ContactSection: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  const contactItems = asStringArray(cfg["contactItems"]);
  const toggleContact = (key: (typeof CONTACT_OPTIONS)[number]) => {
    const set = new Set(contactItems);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange(setAt(cfg, ["contactItems"], Array.from(set)));
  };

  return (
    <section className={section}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="inline-flex size-8 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-sm shadow-emerald-900/10 dark:border-emerald-400/20 dark:text-emerald-300">
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
              d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 7.5l9 6 9-6"
            />
          </svg>
        </span>
        Contacto a mostrar
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CONTACT_OPTIONS.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={contactItems.includes(opt)}
              onChange={() => toggleContact(opt)}
              disabled={disabled}
            />
            {opt}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs opacity-70">
        * Si marcás <b>phones</b>, el usuario podrá elegir cuál teléfono en el
        formulario.
        <br />* Las redes sociales se cargan en la configuración de la agencia.
      </p>
    </section>
  );
};

export default ContactSection;
