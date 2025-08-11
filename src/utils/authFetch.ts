// src/utils/authFetch.ts
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body != null;

  // Inferir URL sin usar "any" y siendo SSR-safe
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

  // Content-Type solo cuando corresponde (no para FormData/Blob)
  if (
    hasBody &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type") &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Authorization solo para llamadas internas a tu /api
  if (token && isInternal) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
