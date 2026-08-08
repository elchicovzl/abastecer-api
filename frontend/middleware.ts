import { NextResponse, type NextRequest } from "next/server";

import { canAccessRoute, homeRouteFor, type Role } from "./lib/permissions";

const API_URL = process.env.API_URL ?? "http://localhost:3100/api";

/**
 * Gating de rutas por rol + renovación del access token.
 *
 * El gating es UX, NO seguridad: la seguridad vive en los guards del
 * backend. Acá solo evitamos que alguien aterrice en una pantalla donde
 * todas las acciones le darían 403.
 *
 * La renovación SÍ es funcional. El middleware es de los pocos lugares
 * donde Next permite escribir cookies (junto con Server Actions y Route
 * Handlers); durante el render de un Server Component está prohibido. Por
 * eso el refresh vive acá: corre ANTES de renderizar y deja el token nuevo
 * disponible tanto para esta request como para el navegador.
 *
 * El `matcher` es EXPLÍCITO: uno amplio haría correr esto en assets
 * estáticos y en la propia ruta de login, con el bucle de redirección que
 * eso implica.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const raw = request.cookies.get("asofer_user")?.value;
  if (!raw) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role: Role;
  try {
    role = (JSON.parse(raw) as { role: Role }).role;
  } catch {
    // Cookie corrupta: se trata como sesión inexistente.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!canAccessRoute(role, pathname)) {
    // A su pantalla de trabajo, no a un 403 en blanco.
    return NextResponse.redirect(new URL(homeRouteFor(role), request.url));
  }

  // Access token vencido o ausente (dura 15m) pero con refresh vivo (7d):
  // se renueva acá para que el render no tenga que hacerlo.
  const access = request.cookies.get("asofer_access")?.value;
  const refresh = request.cookies.get("asofer_refresh")?.value;

  // Sin ninguno de los dos no hay sesión que recuperar. Se corta acá: dejar
  // pasar significaría renderizar una pantalla que va a fallar entera con un
  // 401 del backend, y el usuario vería un error en vez de un login.
  if (!access && !refresh) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!access && refresh) {
    const renewed = await renewAccessToken(refresh);
    if (!renewed) {
      // El refresh también murió (revocado por logout, o expirado).
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Se inyecta en la request para que ESTA renderización ya lo tenga…
    request.cookies.set("asofer_access", renewed);
    const response = NextResponse.next({ request });
    // …y se persiste en el navegador para las próximas.
    response.cookies.set("asofer_access", renewed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15,
    });
    return response;
  }

  return NextResponse.next();
}

async function renewAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { accessToken } = (await res.json()) as { accessToken: string };
    return accessToken;
  } catch {
    // Backend caído: no se puede renovar. Mejor mandar al login que
    // renderizar una pantalla que va a fallar entera.
    return null;
  }
}

export const config = {
  matcher: [
    "/requisitions/:path*",
    "/warehouse/:path*",
    "/purchase-orders/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
  ],
};
