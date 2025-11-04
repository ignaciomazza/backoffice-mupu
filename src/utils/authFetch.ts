// src/utils/authFetch.ts
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body != null;

  const urlStr = (() => {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL)
      return input.toString();
    if (typeof Request !== "undefined" && input instanceof Request)
      return input.url;
    return "";
  })();

  const origin =
    typeof window !== "undefined" && window?.location
      ? window.location.origin
      : undefined;

  const isInternal =
    urlStr.startsWith("/") || (!!origin && urlStr.startsWith(origin));

  // Content-Type por defecto sólo si hay body no-FormData
  if (
    hasBody &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type") &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Defaults seguros que no rompen llamadas existentes
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("X-Requested-With"))
    headers.set("X-Requested-With", "fetch");

  // Bearer sólo para endpoints internos (mantiene tu contrato actual)
  if (token && isInternal && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, {
    ...init,
    headers,
    credentials: "include", // mantiene cookies de sesión
    cache: init.cache ?? "no-store", // evita respuestas stale sin romper overrides
  });

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    if (res.status === 401) {
      // eslint-disable-next-line no-console
      console.warn("[AUTH-DEBUG][authFetch] 401", {
        url: urlStr,
        xAuthReason: res.headers.get("x-auth-reason"),
        xAuthSource: res.headers.get("x-auth-source"),
      });
    } else if (!res.ok) {
      // eslint-disable-next-line no-console
      console.info("[AUTH-DEBUG][authFetch] non-ok", res.status, urlStr);
    }
  }

  return res;
}

// Helper opcional, no intrusivo, útil para parsear JSON de forma segura
export async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
