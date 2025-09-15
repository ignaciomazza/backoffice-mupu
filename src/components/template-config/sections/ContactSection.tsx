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
      <h2 className="mb-3 text-lg font-semibold">Contacto a mostrar</h2>
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
      </p>
    </section>
  );
};

export default ContactSection;
