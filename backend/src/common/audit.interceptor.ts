import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import type { AuthenticatedUser } from "../auth/auth.types";
import { Prisma } from "../prisma/generated/client/client";
import { PrismaService } from "../prisma/prisma.service";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * ADR-006 — auditoría automática.
 *
 * Es un interceptor GLOBAL para que ninguna mutación pueda "olvidarse" de
 * auditar. Si cada service tuviera que llamar a `audit.log()` a mano, el día
 * que alguien agrega un endpoint y se olvida, ese cambio queda sin rastro —
 * y justo ese es el que vas a querer investigar.
 *
 * La escritura NO bloquea la respuesta: si la auditoría falla, se loguea el
 * error pero la operación de negocio ya ocurrió. Al revés sería peor —
 * rechazar una compra válida porque falló un INSERT de auditoría.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body: unknown;
      user?: AuthenticatedUser;
    }>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response: unknown) => {
        void this.record(request, response);
      }),
    );
  }

  private async record(
    request: { method: string; url: string; body: unknown; user?: AuthenticatedUser },
    response: unknown,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: request.user?.id ?? null,
          entity: entityFromUrl(request.url),
          entityId: extractId(response) ?? "-",
          action: `${request.method} ${request.url}`,
          // Prisma distingue "columna JSON nula" de "campo ausente":
          // `null` a secas no compila, hay que decir Prisma.JsonNull.
          before: Prisma.JsonNull,
          after: sanitize(response) ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      console.error("[audit] no se pudo registrar la operación:", error);
    }
  }
}

/** `/api/requisitions/abc` → `requisitions`. Función pura, fácil de testear. */
export function entityFromUrl(url: string): string {
  return url.replace(/^\/api\//, "").split("/")[0]?.split("?")[0] ?? "unknown";
}

function extractId(response: unknown): string | null {
  if (response && typeof response === "object" && "id" in response) {
    const { id } = response;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/**
 * Saca del registro todo lo que no debe quedar escrito en una tabla que
 * medio equipo puede leer. Auditar tokens sería crear una segunda copia de
 * las credenciales.
 */
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "accessToken",
  "refreshToken",
  "tokenHash",
]);

export function sanitize(value: unknown): Prisma.InputJsonObject | null {
  if (!value || typeof value !== "object") return null;

  // Se construye mutable y se castea UNA vez al retornar: InputJsonObject
  // es readonly, y lo que entra acá ya viene de una respuesta HTTP, así que
  // es JSON-serializable por construcción.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k)) continue;
    out[k] = v && typeof v === "object" ? sanitize(v) : v;
  }
  return out as Prisma.InputJsonObject;
}
