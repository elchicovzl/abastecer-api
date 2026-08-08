import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";

import type { Role } from "../prisma/generated/client/client";
import type { AuthenticatedUser } from "./auth.types";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";

/** Marca un endpoint como accesible sin token. Se usa solo en login y refresh. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declara qué roles pueden entrar. Un endpoint SIN @Roles queda accesible a
 * cualquier usuario autenticado — por eso el default de todo lo sensible es
 * declararlo explícito.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
