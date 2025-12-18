const statusPalette: Record<string, string> = {
  pendiente: "bg-amber-100/90 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  pago: "bg-emerald-100/90 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
  facturado: "bg-sky-100/90 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  bloqueada:
    "bg-sky-50 text-sky-950 dark:bg-sky-300/30 dark:text-sky-50",
  cancelada: "bg-rose-100 text-rose-900 dark:bg-rose-500/35 dark:text-rose-50",
  abierta: "bg-sky-50 text-sky-950 dark:bg-sky-300/30 dark:text-sky-50",
  default: "bg-slate-100 text-slate-900 dark:bg-white/15 dark:text-white",
};

const STATUS_CHIP_BASE =
  "rounded-full border border-transparent px-3 py-1 text-xs font-semibold shadow-sm shadow-sky-950/15";

export const getStatusChipClasses = (value?: string) => {
  const key = (value || "").toLowerCase();
  return `${STATUS_CHIP_BASE} ${statusPalette[key] || statusPalette.default}`;
};

const BUTTON_BASE = "rounded-full transition-transform hover:scale-95 active:scale-90";
const ACTION_COLORS = "bg-sky-100 text-sky-950 shadow-sm shadow-sky-900/15 dark:bg-sky-400/25 dark:text-white";
const DANGER_COLORS =
  "bg-rose-200 text-rose-900 shadow-sm shadow-rose-900/20 dark:bg-rose-500/45 dark:text-rose-50";

export const ACTION_BUTTON = `${BUTTON_BASE} ${ACTION_COLORS}`;
export const ICON_BUTTON = `${BUTTON_BASE} ${ACTION_COLORS}`;
export const DANGER_BUTTON = `${BUTTON_BASE} ${DANGER_COLORS}`;
