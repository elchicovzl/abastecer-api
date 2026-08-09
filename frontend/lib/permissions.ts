export const ROLES = {
  ADMIN: "ADMIN",
  COORDINATOR: "COORDINATOR",
  WAREHOUSE: "WAREHOUSE",
  PURCHASING_MANAGER: "PURCHASING_MANAGER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Tabla de acceso por prefijo de ruta.
 *
 * Esto es UX, NO seguridad. La seguridad real vive en los guards del
 * backend: si alguien saltea el middleware y pega directo a la API, come
 * 403 igual. Acá solo evitamos mostrarle a la gente pantallas donde no
 * puede hacer nada.
 *
 * Una sola fuente de verdad: el middleware y el menú leen de acá.
 */
export const ROUTE_ROLES: Record<string, readonly Role[]> = {
  "/requisitions": ["COORDINATOR", "WAREHOUSE", "PURCHASING_MANAGER", "ADMIN"],
  "/warehouse": ["WAREHOUSE", "ADMIN"],
  "/purchase-orders": ["PURCHASING_MANAGER", "ADMIN"],
  "/dashboard": ["COORDINATOR", "WAREHOUSE", "PURCHASING_MANAGER", "ADMIN"],
  // El COORDINATOR entra para cargar los empleados de SU contrato: conoce a
  // su gente y es quien la necesita en las requisiciones de dotación.
  // Adentro solo ve sus empleados — usuarios y catálogo siguen siendo del
  // ADMIN, y eso lo hace cumplir el BACKEND, no esta tabla.
  "/admin": ["ADMIN", "COORDINATOR"],
  // Prefijo MÁS LARGO gana: aunque /admin admita al coordinador, la gestión
  // de usuarios sigue siendo exclusiva del ADMIN. El backend lo hace cumplir
  // igual con un 404 — esto solo evita mandarlo a una pantalla que falla.
  "/admin/users": ["ADMIN"],
};

/**
 * Default CERRADO: una ruta no declarada no es accesible para nadie.
 * Si fuera abierto, cada pantalla nueva nacería pública por olvido.
 */
export function canAccessRoute(role: Role, pathname: string): boolean {
  const match = Object.keys(ROUTE_ROLES)
    .filter(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
    .sort((a, b) => b.length - a.length)[0];

  if (!match) return false;
  return ROUTE_ROLES[match]!.includes(role);
}

/** Dónde aterriza cada rol al entrar: donde tiene trabajo pendiente. */
export function homeRouteFor(role: Role): string {
  switch (role) {
    case "COORDINATOR":
      return "/requisitions";
    case "WAREHOUSE":
      return "/warehouse";
    case "PURCHASING_MANAGER":
      return "/purchase-orders";
    case "ADMIN":
      return "/dashboard";
  }
}
