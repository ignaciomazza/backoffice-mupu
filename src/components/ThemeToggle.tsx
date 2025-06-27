// src/components/ThemeToggle.tsx

"use client";
import { useState, useEffect } from "react";

export default function ThemeToggle() {
  // Inicializamos con "dark" por defecto.
  const [theme, setTheme] = useState<string>("dark");

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme) {
      setTheme(storedTheme);
      // Aplica la clase dark si storedTheme es "dark"
      document.documentElement.classList.toggle("dark", storedTheme === "dark");
    } else {
      // Si no hay tema almacenado, establecemos "dark" por defecto
      setTheme("dark");
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    localStorage.setItem("theme", newTheme);
  };

  return (
    <div className="flex items-center space-x-2 text-black dark:text-white">
      {theme === "light" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
          />
        </svg>
      )}
      <button
        onClick={toggleTheme}
        className="relative flex h-5 w-10 items-center rounded-full bg-white/10 p-0.5 shadow-md backdrop-blur transition-colors"
      >
        <div
          className={`size-4 rounded-full bg-sky-100 shadow-md transition-transform dark:bg-gray-500 ${
            theme === "dark" ? "translate-x-5" : "translate-x-0"
          }`}
        ></div>
      </button>
    </div>
  );
}
