import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedUser, JwtPayload } from "./auth.types";
import { IS_PUBLIC_KEY } from "./decorators";

/**
 * Guard GLOBAL: todo endpoint exige token salvo que esté marcado @Public().
 *
 * El default es cerrado a propósito. Si el default fuera abierto, cada
 * endpoint nuevo nacería público y alguien tendría que acordarse de
 * protegerlo — y algún día no se acuerda.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthenticatedUser }>();

    const header = request.headers["authorization"];
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Falta el access token");
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7), {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        contractId: payload.contractId,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Access token inválido o expirado");
    }
  }
}
