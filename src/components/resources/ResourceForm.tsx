// src/components/resources/ResourceForm.tsx
"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";

interface ResourceFormProps {
  onCreated: (res: {
    id_resource: number;
    title: string;
    description?: string;
    createdAt: string;
  }) => void;
}

// Heroicons copied inline
const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-6"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 4.5v15m7.5-7.5h-15"
    />
  </svg>
);

const MinusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-6"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
  </svg>
);

export default function ResourceForm({ onCreated }: ResourceFormProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleChangeTitle = (e: ChangeEvent<HTMLInputElement>) =>
    setTitle(e.target.value);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Completa todos los campos.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al crear recurso");
      }
      const data = await res.json();
      const newResource = data.resource || data;
      onCreated(newResource);
      setTitle("");
      toast.success("Recurso creado");
    } catch (err: unknown) {
      console.error(err);
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 550 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">Crear Recurso</p>
        <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur">
          {isFormVisible ? <MinusIcon /> : <PlusIcon />}
        </button>
      </div>

      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="max-h-[400px]"
        >
          <label className="ml-2 block dark:text-white">Título</label>
          <div className="flex items-center justify-center gap-2">
            <input
              type="text"
              name="title"
              value={title}
              onChange={handleChangeTitle}
              className="h-full flex-auto rounded-2xl border border-sky-950/10 p-2 outline-none backdrop-blur placeholder:font-light dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Hotelerias de..."
              required
            />

            <button
              type="submit"
              className="h-full rounded-full border border-sky-100 bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:border-white/10 dark:bg-white/10 dark:text-white dark:backdrop-blur"
              disabled={submitting}
            >
              {submitting ? (
                <Spinner />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
              )}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
