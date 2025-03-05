// src/app/login/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";

const backgroundText1 = "BACK OFFICE";
const backgroundText2 = "by MUPU";

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
  visible: { opacity: 0.05, y: 0 },
};

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const { setToken } = useAuth();
  const router = useRouter();

  // Estado para el loader previo
  const [preloading, setPreloading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simula una carga de 2 segundos
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Error al iniciar sesión");
        return;
      }

      const data = await response.json();
      setToken(data.token);
      router.push("/");
    } catch (_error) {
      console.error(_error);
      toast.error("Ha ocurrido un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="absolute top-0 flex size-full items-center justify-center overflow-hidden">
      <AnimatePresence>
        {preloading && (
          <motion.div
            key="loader"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="mb-4 text-4xl font-bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            ></motion.div>
            <div className="h-1 w-64 overflow-hidden rounded-full bg-gray-300 dark:bg-gray-600">
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

      {!preloading && (
        <>
          <motion.div
            className="pointer-events-none inset-0 hidden items-center justify-center gap-20 md:absolute md:flex md:flex-col"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="flex items-end space-x-1">
              {backgroundText1.split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={letterVariants}
                  className="relative select-none font-bold text-black dark:text-white md:text-[115px] lg:text-[155px] xl:text-[195px] 2xl:text-[220px]"
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
                  className="relative select-none font-bold text-black dark:text-white md:text-[115px] lg:text-[155px] xl:text-[195px] 2xl:text-[220px]"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </div>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            className="relative z-10 mx-2 mb-6 w-full max-w-xl space-y-4 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-[#ffffff4e] dark:bg-black"
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -30 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
          >
            <h2 className="text-center text-2xl font-light dark:text-white">
              Iniciar Sesión
            </h2>
            <div className="space-y-1">
              <label className="ml-2 block font-light dark:text-white">
                Email
              </label>
              <input
                type="email"
                value={email}
                placeholder="juani@mupuviajes.com.ar"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none dark:bg-[#252525] dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="ml-2 block font-light dark:text-white">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="Juani_123"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-black p-2 px-3 pr-12 outline-none dark:bg-[#252525] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-50"
                >
                  {showPassword ? (
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
                        d="m4.5 15.75 7.5-7.5 7.5 7.5"
                      />
                    </svg>
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
                        d="m19.5 8.25-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex w-full justify-center">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-black px-12 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-[#252525] dark:text-white"
              >
                {loading ? <Spinner /> : "Ingresar"}
              </button>
            </div>
          </motion.form>
        </>
      )}
      <ToastContainer />
    </motion.div>
  );
}
