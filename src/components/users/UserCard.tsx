// src/components/users/UserCard.tsx

"use client";
import React, { useEffect, useMemo, useState } from "react";
import { User } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";

interface UserCardProps {
  user: User;
  startEditingUser: (user: User) => void;
  deleteUser: (id: number) => void;
  isManager?: boolean; // gerente/desarrollador
}

export default function UserCard({
  user,
  startEditingUser,
  deleteUser,
  isManager = false,
}: UserCardProps) {
  const { token } = useAuth();

  const handleEdit = (u: User) => {
    startEditingUser(u);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ======== Panel Cambiar Contraseña (en-card) ========
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showRep, setShowRep] = useState(false);

  const strongPasswordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  const requiresCurrent = useMemo(() => !isManager, [isManager]);

  useEffect(() => {
    if (!pwdOpen) {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setShowCur(false);
      setShowNew(false);
      setShowRep(false);
    }
  }, [pwdOpen]);

  const onSubmitChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (requiresCurrent && currentPwd.trim().length === 0) {
        toast.error("Ingresá tu contraseña actual.");
        return;
      }
      if (!strongPasswordPattern.test(newPwd)) {
        toast.error(
          "La nueva contraseña debe tener 8+ caracteres e incluir mayúscula, minúscula, número y símbolo.",
        );
        return;
      }
      if (newPwd !== confirmPwd) {
        toast.error("Las contraseñas no coinciden.");
        return;
      }

      const body = requiresCurrent
        ? { currentPassword: currentPwd, password: newPwd }
        : { password: newPwd };

      const res = await authFetch(
        `/api/users/${user.id_user}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error al cambiar la contraseña";
        try {
          const data = await res.json();
          msg = data.error || data.message || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      toast.success("Contraseña actualizada correctamente.");
      setPwdOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cambiar la contraseña.";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!isManager) return;
    const ok = window.confirm(
      `¿Eliminar al usuario ${user.first_name} ${user.last_name}?`,
    );
    if (!ok) return;
    deleteUser(user.id_user);
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      <p className="font-light">{user.email}</p>
      <div className="ml-5 list-disc">
        <li className="font-normal">
          Nombre
          <span className="ml-2 font-light">
            {user.first_name} {user.last_name}
          </span>
        </li>
        <li className="font-normal">
          Posición
          <span className="ml-2 font-light">{user.position || "-"}</span>
        </li>
        <li className="font-normal">
          Rol
          <span className="ml-2 font-light">{user.role}</span>
        </li>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {/* Editar */}
        <button
          type="button"
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          onClick={() => handleEdit(user)}
          title="Editar usuario"
          aria-label="Editar usuario"
        >
          <PencilIcon />
        </button>

        {/* Cambiar contraseña (toggle panel) */}
        <button
          type="button"
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          onClick={() => setPwdOpen((v) => !v)}
          title="Cambiar contraseña"
          aria-expanded={pwdOpen}
          aria-controls={`pwd-panel-${user.id_user}`}
          aria-label="Cambiar contraseña"
        >
          <KeyIcon />
        </button>

        {/* Eliminar (solo manager) */}
        {isManager && (
          <button
            type="button"
            className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
            onClick={handleDelete}
            title="Eliminar usuario"
            aria-label="Eliminar usuario"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {/* ===== Panel interno de cambio de contraseña ===== */}
      <AnimatePresence initial={false}>
        {pwdOpen && (
          <motion.div
            id={`pwd-panel-${user.id_user}`}
            key="pwd-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-3 rounded-2xl border border-white/10 bg-white/40 p-4 dark:bg-white/10"
          >
            <form onSubmit={onSubmitChangePassword} noValidate>
              {/* Contraseña actual (solo no-managers) */}
              {!isManager && (
                <div className="mb-3">
                  <label className="ml-1 block">
                    Contraseña actual <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCur ? "text" : "password"}
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      required
                      aria-required="true"
                      className="w-full rounded-2xl border border-sky-950/10 bg-white/60 p-2 pr-10 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCur((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-80 transition hover:opacity-100"
                      aria-label={
                        showCur ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                    >
                      {showCur ? <EyeOpenIcon /> : <EyeClosedIcon />}
                    </button>
                  </div>
                </div>
              )}

              {/* Nueva */}
              <div className="mb-3">
                <label className="ml-1 block">
                  Nueva contraseña <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                    aria-required="true"
                    className="w-full rounded-2xl border border-sky-950/10 bg-white/60 p-2 pr-10 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                    title="Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo."
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-80 transition hover:opacity-100"
                    aria-label={
                      showNew ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showNew ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                </div>
                <p className="mt-1 text-xs opacity-70">
                  Debe incluir mayúscula, minúscula, número y símbolo.
                </p>
              </div>

              {/* Repetir */}
              <div className="mb-4">
                <label className="ml-1 block">
                  Repetir contraseña <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showRep ? "text" : "password"}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    required
                    aria-required="true"
                    className="w-full rounded-2xl border border-sky-950/10 bg-white/60 p-2 pr-10 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRep((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-80 transition hover:opacity-100"
                    aria-label={
                      showRep ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {showRep ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPwdOpen(false)}
                  className="rounded-full bg-white/40 px-5 py-2 shadow-sm dark:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                >
                  Guardar
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =================== Iconos =================== */
function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.4}
      stroke="currentColor"
      className="size-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}
function KeyIcon() {
  // Icono estable (key outline-like)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.4}
      stroke="currentColor"
      className="size-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
function EyeOpenIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}
function EyeClosedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}
