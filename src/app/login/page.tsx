// src/app/login/page.tsx

"use client";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";

const backgroundText1 = "OFIST PRO / OFIST LITE";
const backgroundText2 = "SISTEMA DE GESTIÓN";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const letterVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 0.02, y: 0 },
};

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string>("");
  const { setToken } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);

  // Estado para el preload inicial (2 s)
  const [preloading, setPreloading] = useState(true);
  const [progress, setProgress] = useState(0);

  // Spinner condicional al enviar (si demora >300 ms)
  const [showSpinner, setShowSpinner] = useState(false);
  let spinnerTimer: NodeJS.Timeout;

  useEffect(() => {
    // Simula carga inicial de 2 s
    const duration = 2000;
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      setProgress(Math.min(100, Math.floor((currentStep / steps) * 100)));
      if (currentStep >= steps) {
        clearInterval(interval);
        setPreloading(false);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, []);

  const validateEmail = (value: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    formRef.current?.classList.remove("animate-shake");

    // Validaciones en línea
    let valid = true;
    if (!validateEmail(email)) {
      setEmailError("Por favor, ingresá un email válido.");
      valid = false;
    } else {
      setEmailError("");
    }
    if (password.trim().length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres.");
      valid = false;
    } else {
      setPasswordError("");
    }
    if (!valid) {
      formRef.current?.classList.add("animate-shake");
      return;
    }

    setLoading(true);
    spinnerTimer = setTimeout(() => {
      setShowSpinner(true);
    }, 300);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      clearTimeout(spinnerTimer);
      setShowSpinner(false);

      if (!response.ok) {
        const errorData = await response.json();
        formRef.current?.classList.add("animate-shake");
        toast.error(errorData.error || "Error al iniciar sesión");
        return;
      }

      const data = await response.json();
      setToken(data.token);
      router.push("/");
    } catch (_error) {
      clearTimeout(spinnerTimer);
      setShowSpinner(false);
      console.error(_error);
      formRef.current?.classList.add("animate-shake");
      toast.error("Ha ocurrido un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white dark:bg-black">
      {/* Preload inicial */}
      <AnimatePresence>
        {preloading && (
          <motion.div
            key="loader"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white dark:bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="mb-4 text-3xl font-light text-black dark:text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              Ofist
            </motion.div>
            <div className="h-1 w-64 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <motion.div
                className="h-full bg-black dark:bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spinner overlay al enviar, si tarda >300 ms */}
      {showSpinner && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-black/80">
          <Spinner />
        </div>
      )}

      {!preloading && (
        <>
          {/* Fondo tipográfico grande, sólo en md+ */}
          <motion.div
            className="pointer-events-none hidden items-center justify-center gap-16 md:absolute md:flex md:flex-col"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="flex items-end space-x-1">
              {backgroundText1.split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={letterVariants}
                  className="select-none font-bold leading-none text-black dark:text-white md:text-[80px] lg:text-[100px] xl:text-[120px]"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </div>
            <div className="flex items-end space-x-1">
              {backgroundText2.split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={letterVariants}
                  className="select-none font-bold leading-none text-black dark:text-white md:text-[80px] lg:text-[100px] xl:text-[120px]"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* Formulario de login */}
          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            className="relative z-10 mx-4 w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-xl transition-all duration-300 ease-in-out dark:border dark:border-white/20 dark:bg-black"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
            noValidate
          >
            {/* Título */}
            <h2 className="text-center text-3xl font-medium dark:text-white">
              Iniciar Sesión
            </h2>

            {/* Email */}
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="ml-1 block text-sm font-medium dark:text-white"
              >
                Email
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="juanperez@correo.com"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-invalid={!!emailError}
                  aria-describedby="email-error"
                  autoFocus
                  className={`w-full rounded-xl border border-black/20 bg-white/90 px-4 py-2 pr-10 text-base outline-none transition-colors placeholder:text-black/50 focus:border-black focus:bg-white focus:ring-2 focus:ring-black dark:border-white/20 dark:bg-black/90 dark:text-white dark:placeholder:text-white/50 dark:focus:border-white dark:focus:bg-black dark:focus:ring-white ${
                    emailError ? "border-red-600 focus:ring-red-300" : ""
                  }`}
                />
                {/* Ícono de sobre */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-black/50 dark:text-white/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12.79V7.5a2.5 2.5 0 00-2.5-2.5H5.5A2.5 2.5 0 003 7.5v9a2.5 2.5 0 002.5 2.5h9.29M21 12.79L12 18.5l-9-5.71"
                  />
                </svg>
              </div>
              {emailError && (
                <span
                  id="email-error"
                  className="text-xs text-red-600 dark:text-red-400"
                  role="alert"
                  aria-live="polite"
                >
                  {emailError}
                </span>
              )}
            </div>

            {/* Contraseña */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="ml-1 block text-sm font-medium dark:text-white"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-invalid={!!passwordError}
                  aria-describedby="password-error"
                  className={`w-full rounded-xl border border-black/20 bg-white/90 px-4 py-2 pr-12 text-base outline-none transition-colors placeholder:text-black/50 focus:border-black focus:bg-white focus:ring-2 focus:ring-black dark:border-white/20 dark:bg-black/90 dark:text-white dark:placeholder:text-white/50 dark:focus:border-white dark:focus:bg-black dark:focus:ring-white ${
                    passwordError ? "border-red-600 focus:ring-red-300" : ""
                  }`}
                />
                <button
                  id="toggle-password-visibility"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-black/75 transition-opacity hover:opacity-100 dark:text-white/75"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? (
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
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  ) : (
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
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <span
                  id="password-error"
                  className="text-xs text-red-600 dark:text-red-400"
                  role="alert"
                  aria-live="polite"
                >
                  {passwordError}
                </span>
              )}
            </div>

            {/* Botón de Ingresar */}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-full bg-black px-12 py-3 text-base font-medium text-white transition-transform hover:scale-95 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-black active:scale-90 dark:bg-white dark:text-black dark:focus:ring-white"
              >
                {loading ? <Spinner /> : "Ingresar"}
              </button>
            </div>

            {/* Pie de página */}
            <p className="mt-2 text-center text-xs text-black/50 dark:text-white/50">
              © 2025 Ofist
            </p>
          </motion.form>
        </>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </motion.div>
  );
}
