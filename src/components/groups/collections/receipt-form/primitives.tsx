// src/components/receipts/receipt-form/primitives.tsx
import React from "react";

export const pillBase =
  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors md:text-xs";
export const pillNeutral =
  "border-sky-300/70 bg-white text-slate-700 dark:border-sky-600/30 dark:bg-sky-950/10 dark:text-slate-200";
export const pillOk =
  "border-emerald-300/80 bg-emerald-100/60 text-emerald-700 dark:border-emerald-500/70 dark:bg-emerald-900/25 dark:text-emerald-300";

export const inputBase =
  "w-full rounded-2xl border border-sky-300/80 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-600/30 dark:bg-sky-950/10 dark:text-slate-100 dark:focus:border-sky-400";

export const Section: React.FC<{
  title: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
  <section className="rounded-2xl border border-sky-300/70 bg-white p-4 dark:border-sky-600/30 dark:bg-sky-950/10">
    <div className="mb-4">
      <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-base">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7">{children}</div>
  </section>
);

export const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ id, label, hint, required, children }) => (
  <div className="space-y-2">
    <label
      htmlFor={id}
      className="ml-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100 md:text-sm"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p
        id={`${id}-hint`}
        className="ml-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs"
      >
        {hint}
      </p>
    )}
  </div>
);
