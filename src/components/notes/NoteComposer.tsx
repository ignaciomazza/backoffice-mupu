// src/components/notes/NoteComposer.tsx
"use client";

import React, { useCallback, useState } from "react";

interface NoteComposerProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  textareaClassName?: string;
  inputClassName?: string;
  addButtonClassName?: string;
}

const baseTextarea =
  "w-full resize-y rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10";
const baseInput =
  "w-full rounded-2xl border border-white/10 bg-white/40 p-2 px-3 text-sm shadow-sm shadow-sky-950/10 outline-none placeholder:text-xs placeholder:font-light dark:bg-white/10";
const baseButton =
  "rounded-full bg-sky-100 px-4 py-2 text-xs font-medium text-sky-950 shadow-sm shadow-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white";

export default function NoteComposer({
  id,
  name,
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  textareaClassName,
  inputClassName,
  addButtonClassName,
}: NoteComposerProps) {
  const [linkInput, setLinkInput] = useState("");
  const [itemInput, setItemInput] = useState("");

  const appendLine = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const base = value.trimEnd();
      const next = base ? `${base}\n${trimmed}` : trimmed;
      onChange(next);
    },
    [onChange, value],
  );

  const addLink = useCallback(() => {
    const url = linkInput.trim();
    if (!url) return;
    appendLine(`- ${url}`);
    setLinkInput("");
  }, [appendLine, linkInput]);

  const addItem = useCallback(() => {
    const item = itemInput.trim();
    if (!item) return;
    appendLine(`- ${item}`);
    setItemInput("");
  }, [appendLine, itemInput]);

  const handleKeyAdd =
    (handler: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handler();
    };

  return (
    <div className={className}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={textareaClassName ?? baseTextarea}
      />

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={handleKeyAdd(addLink)}
            placeholder="Agregar link (https://...)"
            className={inputClassName ?? baseInput}
          />
          <button
            type="button"
            onClick={addLink}
            className={addButtonClassName ?? baseButton}
          >
            Agregar link
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={itemInput}
            onChange={(e) => setItemInput(e.target.value)}
            onKeyDown={handleKeyAdd(addItem)}
            placeholder="Agregar ítem"
            className={inputClassName ?? baseInput}
          />
          <button
            type="button"
            onClick={addItem}
            className={addButtonClassName ?? baseButton}
          >
            Agregar ítem
          </button>
        </div>
      </div>
    </div>
  );
}
