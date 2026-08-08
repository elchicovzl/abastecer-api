import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * ¿Estamos en viewport móvil?
 *
 * shadcn lo implementa con useState + useEffect llamando setState de forma
 * sincrónica dentro del efecto. Eso dispara renders en cascada y React lo
 * marca como error: un efecto sirve para SINCRONIZAR con un sistema externo,
 * no para derivar estado que ya se puede leer.
 *
 * `useSyncExternalStore` es la API hecha para exactamente esto: suscribirse
 * a una fuente externa (el matchMedia del navegador) y leer su valor. De
 * paso resuelve el SSR con su tercer argumento — en el servidor no hay
 * `window`, y devolver `false` evita el hydration mismatch.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Snapshot del servidor: se asume escritorio. Si acertáramos el móvil
    // aquí estaríamos adivinando, y una hidratación inconsistente es peor
    // que un primer render de escritorio que se corrige al instante.
    () => false,
  );
}
