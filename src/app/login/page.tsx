// src/app/login/page.tsx

"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setToken } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      setToken(data.token); // Esto guardará el token en `localStorage` y en `Cookies`
      router.push("/");
    } else {
      console.error("Error al iniciar sesión");
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <form
        className="w-[90%] max-w-xl bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-3 mb-6 mx-2 dark:border dark:border-white"
        onSubmit={handleSubmit}
      >
        <div>
          <label className="block ml-2 dark:text-white">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
          />
        </div>
        <div>
          <label className="block ml-2 dark:text-white">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-2 rounded-2xl border border-black dark:border-white outline-none"
          />
        </div>
        <div className="w-full flex justify-start">
          <button
            type="submit"
            className="m-auto py-2 px-12 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
          >
            Ingresar
          </button>
        </div>
      </form>
    </div>
  );
}
