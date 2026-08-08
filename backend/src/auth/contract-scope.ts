import { NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "./auth.types";

/**
 * ADR-002 — segregación por contrato, en la capa de SERVICIO.
 *
 * Son funciones PURAS a propósito: sin `this`, sin base de datos, sin
 * request. Se testean con inputs y outputs, sin un solo mock, y cualquier
 * service las puede usar. Si esta lógica viviera dentro de un guard o de un
 * controller, cada endpoint nuevo tendría que acordarse de aplicarla — y el
 * día que alguien se olvide, filtra los 9 contratos.
 */

/**
 * Fragmento de `where` que limita la consulta al contrato del usuario.
 * Para roles no atados a contrato devuelve `{}`, que no filtra nada.
 */
export function contractScopeWhere(user: AuthenticatedUser): { contractId?: string } {
  if (user.role !== "COORDINATOR") return {};

  if (!user.contractId) {
    // Un COORDINATOR sin contrato es un dato corrupto. Devolver `{}` acá
    // le daría acceso a TODO: preferimos romper ruidosamente.
    throw new NotFoundException("Recurso no encontrado");
  }
  return { contractId: user.contractId };
}

/** ¿Puede este usuario ver un recurso de este contrato? */
export function canAccessContract(user: AuthenticatedUser, contractId: string): boolean {
  if (user.role !== "COORDINATOR") return true;
  return user.contractId === contractId;
}

/**
 * ADR-008: si no puede acceder, 404 — NO 403.
 *
 * Un 403 confirma que el recurso existe, y eso ya es filtración entre
 * contratos: el coordinador de A aprende que la requisición #47 de B existe.
 * El 404 no le enseña nada.
 */
export function assertContractAccess(
  user: AuthenticatedUser,
  resource: { contractId: string } | null,
): asserts resource is { contractId: string } {
  if (!resource || !canAccessContract(user, resource.contractId)) {
    throw new NotFoundException("Recurso no encontrado");
  }
}
