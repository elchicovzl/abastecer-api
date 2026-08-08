import { z } from "zod";

import type { Role } from "../prisma/generated/client/client";

/** Payload del access token. `sub` es el id del usuario (convención JWT). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  contractId: string | null;
}

/**
 * Usuario autenticado que viaja en `request.user`.
 * Es el input del ContractScopeGuard y de toda la segregación (ADR-002).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  contractId: string | null;
}

export const loginSchema = z.object({
  email: z.email({ error: "Email inválido" }),
  password: z.string().min(1, { error: "La contraseña es obligatoria" }),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, { error: "refreshToken es obligatorio" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
