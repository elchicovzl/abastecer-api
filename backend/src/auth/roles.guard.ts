import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../prisma/generated/client/client";
import type { AuthenticatedUser } from "./auth.types";
import { ROLES_KEY } from "./decorators";

/**
 * Autorización por rol. Corre DESPUÉS del JwtAuthGuard, así que
 * `request.user` ya existe.
 *
 * Devuelve 403 y no 404: acá el recurso existe y el usuario está
 * autenticado, simplemente no tiene permiso para esa ACCIÓN. Distinto del
 * caso de segregación por contrato, donde el 404 es deliberado (ADR-008).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Tu rol no tiene permiso para esta acción");
    }
    return true;
  }
}
