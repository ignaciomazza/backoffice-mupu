// src/context/AuthContext.tsx
"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  role: string | null;
  setRole: (role: string | null) => void;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [role, setRoleState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setToken = (newToken: string | null) => setTokenState(newToken);
  const setRole = (newRole: string | null) => setRoleState(newRole);

  useEffect(() => {
    let alive = true;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });
        if (!alive) return;

        if (res.ok) {
          const data = await res.json(); // { token, claims? }
          setTokenState(data.token ?? null);

          // Usá el rol del token si viene, y si no consultá a la API
          const claimRole: string | undefined = data?.claims?.role;
          if (claimRole) {
            setRoleState(claimRole);
            document.cookie = `role=${claimRole}; path=/;`;
          } else {
            const roleRes = await fetch("/api/user/role", {
              credentials: "include",
            });
            if (!alive) return;
            if (roleRes.ok) {
              const roleData = await roleRes.json();
              setRoleState(roleData.role ?? null);
              if (roleData.role) {
                document.cookie = `role=${roleData.role}; path=/;`;
              }
            } else {
              setRoleState(null);
            }
          }
        } else {
          setTokenState(null);
          setRoleState(null);
        }
      } catch (err) {
        console.error("Error al verificar la sesión:", err);
        setTokenState(null);
        setRoleState(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    checkSession();
    return () => {
      alive = false;
    };
  }, []);

  const logout = useMemo(
    () => async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // no-op
      } finally {
        setTokenState(null);
        setRoleState(null);
        // Opcional: limpiar cookie de rol (no HttpOnly)
        document.cookie = "role=; Max-Age=0; path=/;";
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ token, setToken, role, setRole, loading, logout }),
    [token, role, loading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx)
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  return ctx;
};
