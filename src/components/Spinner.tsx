// src/components/Spinner.tsx
"use client";

export default function Spinner() {
  return (
    <div className="flex size-full items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
    </div>
  );
}
