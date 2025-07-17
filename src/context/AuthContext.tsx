// src/context/AuthContext.tsx

"use client"; 
import React, { createContext, useContext, useState, useEffect } from "react";

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  role: string | null;
  setRole: (role: string | null) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [role, setRoleState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
  };

  const setRole = (newRole: string | null) => {
    setRoleState(newRole);
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setTokenState(data.token);
          const roleRes = await fetch("/api/user/role", {
            credentials: "include",
          });
          if (roleRes.ok) {
            const roleData = await roleRes.json();
            setRoleState(roleData.role);
            document.cookie = `role=${roleData.role}; path=/;`;
          } else {
            setRoleState(null);
          }
        } else {
          setTokenState(null);
          setRoleState(null);
        }
      } catch (error) {
        console.error("Error al verificar la sesión:", error);
        setTokenState(null);
        setRoleState(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ token, setToken, role, setRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
};
