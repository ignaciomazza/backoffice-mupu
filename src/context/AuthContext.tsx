"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const DBG =
  typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";

function dlog(...args: unknown[]): void {
  if (DBG) console.log("[AUTH-DEBUG][AuthContext]", ...args);
}

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
    dlog("setToken()", { hasToken: !!newToken });
    setTokenState(newToken);
  };

  const setRole = (newRole: string | null) => {
    dlog("setRole()", { role: newRole });
    setRoleState(newRole);
  };

  useEffect(() => {
    const checkSession = async () => {
      dlog("checkSession() start");
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });
        dlog("session response", {
          status: res.status,
          xAuthReason: res.headers.get("x-auth-reason"),
          xAuthSource: res.headers.get("x-auth-source"),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            token?: string | null;
          };
          setTokenState(data.token ?? null);

          const roleRes = await fetch("/api/user/role", {
            credentials: "include",
          });
          dlog("/api/user/role", {
            status: roleRes.status,
            xAuthReason: roleRes.headers.get("x-auth-reason"),
            xAuthSource: roleRes.headers.get("x-auth-source"),
          });

          if (roleRes.status === 401) {
            dlog("role 401 -> invalid session");
            setRoleState(null);
            setTokenState(null);
            document.cookie = `role=; Max-Age=0; path=/;`;
          } else if (roleRes.ok) {
            const roleData = (await roleRes.json().catch(() => ({}))) as {
              role?: string | null;
            };
            setRoleState(roleData.role ?? null);
            if (roleData.role)
              document.cookie = `role=${roleData.role}; path=/;`;
          } else {
            dlog("role non-ok (no 401), keeping token", roleRes.status);
            setRoleState(null);
          }
        } else {
          dlog("session not ok -> clear auth");
          setTokenState(null);
          setRoleState(null);
          document.cookie = `role=; Max-Age=0; path=/;`;
        }
      } catch (error) {
        console.error("[AUTH-DEBUG][AuthContext] session error:", error);
        setTokenState(null);
        setRoleState(null);
      } finally {
        setLoading(false);
        dlog("checkSession() end");
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
