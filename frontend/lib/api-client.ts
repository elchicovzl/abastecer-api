import "server-only";

import { getAccessToken, getRefreshToken, setAccessToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3100/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Interno: token ya renovado para el reintento. */
  retryToken?: string;
}

/**
 * Cliente HTTP del backend, con refresh automático.
 *
 * Corre SOLO en el servidor (`server-only`): el access token nunca llega al
 * bundle del navegador.
 *
 * OJO con las cookies. Next PROHÍBE modificarlas durante el render de un
 * Server Component — solo se pueden escribir en Server Actions, Route
 * Handlers o middleware. Por eso el token renovado se usa EN MEMORIA para
 * el reintento, y persistirlo es "best effort": si estamos en un render, la
 * escritura falla y se ignora; el middleware la hace en la navegación
 * siguiente.
 *
 * Antes esto reventaba la página con un 500 a los 15 minutos de sesión —
 * justo cuando expiraba el access token. Ningún test lo cubría porque
 * ninguno espera 15 minutos.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.retryToken ?? (await getAccessToken());

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 401 && !options.retryToken) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      // Un solo reintento: si el refresh también falla, la sesión murió de
      // verdad y reintentar sería un bucle.
      return api<T>(path, { ...options, retryToken: renewed });
    }
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      message?: string;
      issues?: { path: string; message: string }[];
    };
    throw new ApiError(
      res.status,
      payload.message ?? `Error ${res.status}`,
      payload.issues,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Pide un access token nuevo y lo devuelve.
 *
 * Intenta persistirlo, pero NO depende de poder hacerlo: durante el render
 * de un Server Component esa escritura es ilegal y debe fallar sin romper
 * la página.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const { accessToken } = (await res.json()) as { accessToken: string };

  try {
    await setAccessToken(accessToken);
  } catch {
    // Render de Server Component: no se puede escribir la cookie. El token
    // igual sirve para esta request y el middleware lo persiste después.
  }

  return accessToken;
}
