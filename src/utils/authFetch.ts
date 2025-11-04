// src/utils/authFetch.ts
type AuthFetchDebugOpts = {
  label?: string; // etiqueta libre para agrupar (ej: "ServicesPage#fetchInvoices")
  caller?: string; // nombre del componente/origen si querés forzarlo
  logRequestBody?: boolean; // forzar log de body request (truncado)
  logResponseBody?: boolean; // forzar log de body response (truncado)
  extra?: Record<string, unknown>;
};

type AugmentedInit = RequestInit & { __debug?: AuthFetchDebugOpts };

function trimText(s: string, max = 2000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… [${s.length - max} chars more]`;
}

function maskAuth(h?: string | null) {
  if (!h) return undefined;
  // "Bearer XXX..." → "Bearer ********…abcd"
  const tail = h.slice(-6);
  return `Bearer ********${tail}`;
}

function guessCaller(): string | undefined {
  try {
    const err = new Error();
    const stack = (err.stack || "").split("\n").map((l) => l.trim());
    // Buscar la primera línea fuera de authFetch
    for (const ln of stack) {
      if (!ln) continue;
      if (ln.includes("authFetch")) continue;
      if (ln.startsWith("at ")) {
        return ln.replace(/^at\s+/, "");
      }
    }
  } catch {}
  return undefined;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const DEBUG_LEVEL = String(process.env.NEXT_PUBLIC_DEBUG_AUTH || "");
  const DEBUG_ENABLED = DEBUG_LEVEL === "1" || DEBUG_LEVEL === "2";
  const DEBUG_BODIES = DEBUG_LEVEL === "2";

  const { __debug } = init as AugmentedInit;
  const debugLabel = __debug?.label;
  const debugCaller = __debug?.caller || guessCaller();
  const wantReqBody = !!__debug?.logRequestBody || DEBUG_BODIES;
  const wantResBody = !!__debug?.logResponseBody || DEBUG_BODIES;

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

  // Content-Type por default cuando es JSON
  if (
    hasBody &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type") &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Bearer solo a endpoints internos
  if (token && isInternal) headers.set("Authorization", `Bearer ${token}`);

  // Preparar fetch sin el campo __debug
  // Preparar fetch sin el campo __debug
  const { __debug: __toOmit, ...initRest } = init as AugmentedInit;
  void __toOmit; // evita @typescript-eslint/no-unused-vars
  const start = Date.now();

  // Para previsualizar el request body sin consumir streams: como ya viene serializado o FormData.
  let requestBodyPreview: string | undefined;
  if (hasBody) {
    if (init.body instanceof FormData) {
      requestBodyPreview = "[FormData]";
    } else if (typeof init.body === "string") {
      requestBodyPreview = trimText(init.body);
    } else {
      // En general ya llega stringificado si es JSON; si no, mostramos tipo
      requestBodyPreview = `[${Object.prototype.toString.call(init.body)}]`;
    }
  }

  let res: Response;

  try {
    res = await fetch(input, { ...initRest, headers, credentials: "include" });
  } catch (err) {
    const duration = Date.now() - start;
    // Log de error duro de red/fetch
    if (DEBUG_ENABLED) {
      const title = `[AUTH-DEBUG] ${method} ${urlStr} — NETWORK ERROR ${debugLabel ? `— ${debugLabel}` : ""}`;
      (
        console as unknown as {
          groupCollapsed?: (...a: unknown[]) => void;
          groupEnd?: () => void;
        }
      ).groupCollapsed?.(title);
      console.error("error:", err);
      console.info("caller:", debugCaller);
      console.info("duration_ms:", duration);
      console.info("internal_endpoint:", isInternal);
      console.info("has_token:", Boolean(token));
      if (wantReqBody && requestBodyPreview) {
        console.info("request.body (preview):", requestBodyPreview);
      }
      (console as unknown as { groupEnd?: () => void }).groupEnd?.();
    }
    throw err;
  }

  const duration = Date.now() - start;

  // Logging condicional (debug o status problemático)
  const shouldLog = DEBUG_ENABLED || res.status === 401 || !res.ok;

  if (shouldLog) {
    const contentType = res.headers.get("content-type") || undefined;
    const xAuthReason = res.headers.get("x-auth-reason") || undefined;
    const xAuthSource = res.headers.get("x-auth-source") || undefined;
    const xRequestId = res.headers.get("x-request-id") || undefined;
    const reqContentType = headers.get("Content-Type") || undefined;

    // Previsualizar response body sin consumir el stream original
    let responseBodyPreview: string | undefined;
    if (
      (wantResBody || !res.ok) &&
      contentType &&
      contentType.includes("application/json")
    ) {
      try {
        const clone = res.clone();
        const txt = await clone.text();
        responseBodyPreview = trimText(txt);
      } catch {
        responseBodyPreview = "[unreadable body]";
      }
    } else if (
      (wantResBody || !res.ok) &&
      contentType &&
      contentType.includes("text/")
    ) {
      try {
        const clone = res.clone();
        const txt = await clone.text();
        responseBodyPreview = trimText(txt);
      } catch {
        responseBodyPreview = "[unreadable body]";
      }
    }

    const title = `[AUTH-DEBUG] ${method} ${urlStr} — ${res.status} ${debugLabel ? `— ${debugLabel}` : ""}`;
    (
      console as unknown as {
        groupCollapsed?: (...a: unknown[]) => void;
        groupEnd?: () => void;
      }
    ).groupCollapsed?.(title);

    // Cabecera
    console.info("caller:", debugCaller);
    console.info("duration_ms:", duration);
    console.info("internal_endpoint:", isInternal);

    // Request
    console.info("request", {
      method,
      url: urlStr,
      headers: {
        "Content-Type": reqContentType,
        Authorization: maskAuth(headers.get("Authorization")),
      },
    });
    if (isInternal && !token) {
      console.warn("warning: calling internal endpoint without token.");
    }
    if (wantReqBody && requestBodyPreview) {
      console.info("request.body (preview):", requestBodyPreview);
    }

    // Response
    console.info("response", {
      status: res.status,
      ok: res.ok,
      headers: {
        "content-type": contentType,
        "x-auth-reason": xAuthReason,
        "x-auth-source": xAuthSource,
        "x-request-id": xRequestId,
      },
    });
    if (responseBodyPreview) {
      console.info("response.body (preview):", responseBodyPreview);
    }

    // Extra opcional del caller
    if (__debug?.extra) {
      console.info("extra:", __debug.extra);
    }

    (console as unknown as { groupEnd?: () => void }).groupEnd?.();
  }

  // Compat: logs cortos previos si alguien los usaba
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    if (res.status === 401) {
      console.warn("[AUTH-DEBUG][authFetch] 401", {
        url: urlStr,
        xAuthReason: res.headers.get("x-auth-reason"),
        xAuthSource: res.headers.get("x-auth-source"),
      });
    } else if (!res.ok) {
      console.info("[AUTH-DEBUG][authFetch] non-ok", res.status, urlStr);
    }
  }

  return res;
}
