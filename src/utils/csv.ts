export type CsvRowCell = {
  value: unknown;
  numeric?: boolean;
};

const sanitizeCsvText = (value: unknown): string =>
  String(value ?? "").replace(/\r?\n|\r/g, " ");

export const quoteCsvText = (value: unknown): string =>
  `"${sanitizeCsvText(value).replace(/"/g, '""')}"`;

export function formatCsvNumber(
  value: unknown,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";

  const minimumFractionDigits = options?.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2;

  return n.toLocaleString("es-AR", {
    useGrouping: false,
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

export const toCsvRow = (
  cells: CsvRowCell[],
  delimiter = ";",
): string => {
  return cells
    .map((cell) =>
      cell.numeric ? String(cell.value ?? "") : quoteCsvText(cell.value),
    )
    .join(delimiter);
};

export const toCsvHeaderRow = (
  headers: string[],
  delimiter = ";",
): string => {
  return toCsvRow(headers.map((header) => ({ value: header })), delimiter);
};

export function downloadCsvFile(csvContent: string, fileName: string): void {
  if (typeof window === "undefined") return;

  const blob = new Blob(["\uFEFF", csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
