// src/utils/invoiceNumbers.ts

const cleanPart = (value: unknown) => {
  const str = String(value ?? "").trim();
  if (!str || str === "0") return "";
  return str;
};

export const buildInvoiceNumber = (
  ptoVta: number,
  cbteTipo: number,
  cbteDesde: number | string,
) => {
  const p = cleanPart(ptoVta);
  const t = cleanPart(cbteTipo);
  const n = cleanPart(cbteDesde);
  if (!n) return "";
  if (p && t) return `${p}-${t}-${n}`;
  if (p) return `${p}-${n}`;
  return n;
};

export const buildInvoiceNumberLegacy = (
  ptoVta: number,
  cbteDesde: number | string,
) => {
  const p = cleanPart(ptoVta);
  const n = cleanPart(cbteDesde);
  if (!n) return "";
  if (p) return `${p}-${n}`;
  return n;
};

export const displayInvoiceNumber = (value?: string | number | null) => {
  const str = String(value ?? "").trim();
  if (!str) return "";
  const parts = str.split("-");
  if (parts.length === 3) {
    return `${parts[0]}-${parts[2]}`;
  }
  return str;
};
