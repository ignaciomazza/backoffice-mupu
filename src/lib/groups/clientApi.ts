export type GroupApiError = {
  error?: string;
  message?: string;
  details?: string;
  solution?: string;
  code?: string;
};

const GROUP_API_TIMEOUT_MS = 15000;

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getGroupApiErrorMessage(
  body: GroupApiError | null,
  fallback: string,
): string {
  if (!body) return fallback;

  const base =
    trimOrEmpty(body.error) ||
    trimOrEmpty(body.message) ||
    trimOrEmpty(body.details) ||
    fallback;
  const details = trimOrEmpty(body.details);
  const solution = trimOrEmpty(body.solution);
  const detailsPart =
    details && details !== base ? ` Detalle: ${details}.` : "";
  const solutionPart = solution ? ` Cómo resolverlo: ${solution}` : "";

  return `${base}${detailsPart}${solutionPart}`.trim();
}

export async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function requestGroupApi<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(
    () => {
      timedOut = true;
      timeoutController.abort();
    },
    GROUP_API_TIMEOUT_MS,
  );
  const externalSignal = init.signal;
  const abortFromExternal = () => timeoutController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, {
        once: true,
      });
    }
  }

  try {
    const res = await fetch(input, {
      ...init,
      signal: timeoutController.signal,
    });
    const body = await readJsonSafe<T & GroupApiError>(res);
    if (!res.ok) {
      throw new Error(getGroupApiErrorMessage(body, fallbackError));
    }
    if (body == null) {
      throw new Error(fallbackError);
    }
    return body as T;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      throw new Error(
        timedOut ? `${fallbackError} Tiempo de espera agotado.` : fallbackError,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
