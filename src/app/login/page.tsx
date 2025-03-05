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
    // Simula una carga de 3 segundos
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
    } catch (error) {
      toast.error("Ha ocurrido un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="absolute top-0 w-full h-full flex items-center justify-center overflow-hidden">
      <AnimatePresence>
        {preloading && (
          <motion.div
            key="loader"
            className="absolute inset-0 flex flex-col items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="text-4xl font-bold mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            ></motion.div>
            <div className="w-64 h-1 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
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
          {/* Fondo animado: Texto "Mupu Viajes" */}
          <motion.div
            className="hidden md:absolute inset-0 md:flex md:flex-col gap-20 items-center justify-center pointer-events-none"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="flex items-end space-x-1">
              {backgroundText1.split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={letterVariants}
                  className="relative md:text-[115px] lg:text-[155px] xl:text-[195px] 2xl:text-[220px] font-bold text-black dark:text-white select-none"
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
                  className="relative md:text-[115px] lg:text-[155px] xl:text-[195px] 2xl:text-[220px] font-bold text-black dark:text-white select-none"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* Formulario de Login */}
          <motion.form
            onSubmit={handleSubmit}
            className="relative w-full max-w-xl bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-4 mb-6 mx-2 dark:border dark:border-[#ffffff4e] z-10"
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -30 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
          >
            <h2 className="text-2xl font-light text-center dark:text-white">
              Iniciar Sesión
            </h2>
            <div className="space-y-1">
              <label className="block ml-2 dark:text-white font-light">
                Email
              </label>
              <input
                type="email"
                value={email}
                placeholder="juani@mupuviajes.com.ar"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-2 px-3 rounded-2xl dark:text-white border dark:bg-[#252525] border-black outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block ml-2 dark:text-white font-light">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="Juani_123"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full p-2 px-3 pr-12 rounded-2xl dark:text-white border dark:bg-[#252525] border-black outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm opacity-50"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="w-full flex justify-center">
              <button
                type="submit"
                disabled={loading}
                className="py-2 px-12 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-[#252525] dark:text-white"
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
