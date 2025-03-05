// src/components/Spinner.tsx

// src/components/Spinner.tsx
"use client";

export default function Spinner() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-current border-t-transparent"></div>
    </div>
  );
}
