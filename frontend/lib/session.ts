import "server-only";

import { cookies } from "next/headers";

import type { Role } from "./permissions";

/**
 * Sesión en cookies httpOnly, NO en localStorage.
 *
 * localStorage es legible por cualquier JavaScript de la página: un solo XSS
 * —o una dependencia comprometida— y el atacante se lleva el refresh token
 * de 7 días. Una cookie httpOnly no la puede leer el JS del navegador.
 *
 * `sameSite: lax` corta el CSRF en las navegaciones de terceros sin romper
 * el flujo normal de login.
 */
const ACCESS = "asofer_access";
const REFRESH = "asofer_refresh";
const USER = "asofer_user";

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  contractId: string | null;
}

const baseOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function saveSession(
  accessToken: string,
  refreshToken: string,
  user: SessionUser,
): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS, accessToken, { ...baseOptions, maxAge: 60 * 15 });
  jar.set(REFRESH, refreshToken, { ...baseOptions, maxAge: 60 * 60 * 24 * 7 });
  // El usuario NO es httpOnly-sensible (no hay secretos), pero se guarda
  // igual como httpOnly para que el cliente no dependa de él: la fuente de
  // verdad del rol es el token que valida el backend.
  jar.set(USER, JSON.stringify(user), {
    ...baseOptions,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH)?.value ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS, REFRESH, USER]) jar.delete(name);
}

export async function setAccessToken(token: string): Promise<void> {
  (await cookies()).set(ACCESS, token, { ...baseOptions, maxAge: 60 * 15 });
}
