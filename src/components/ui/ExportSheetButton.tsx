"use client";

type ExportSheetButtonProps = {
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

const BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[11px] font-medium text-zinc-700 shadow-sm shadow-zinc-900/10 backdrop-blur transition hover:bg-white/30 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className={className || "size-3.5"}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0 4-4m-4 4-4-4m-5 6.5v1.5A2 2 0 0 0 5 21h14a2 2 0 0 0 2-2v-1.5"
      />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className="size-3.5 animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-30"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ExportSheetButton({
  onClick,
  loading = false,
  disabled = false,
  label = "Descargar planilla",
  loadingLabel = "Descargando...",
  className,
  title,
  ariaLabel,
}: ExportSheetButtonProps) {
  const finalDisabled = disabled || loading;
  const finalTitle = title || label;
  const finalAriaLabel = ariaLabel || label;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={finalDisabled}
      title={finalTitle}
      aria-label={finalAriaLabel}
      className={[BASE_CLASS, className || ""].join(" ").trim()}
    >
      {loading ? <LoadingIcon /> : <DownloadIcon />}
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
}
