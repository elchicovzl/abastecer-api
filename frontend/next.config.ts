import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Caché del Router del cliente en CERO para rutas dinámicas.
     *
     * Sin esto, tras registrar una entrega el usuario hace clic en
     * "Requisiciones" del sidebar y ve el estado VIEJO: Next le sirve el
     * payload que ya tenía cacheado. En un sistema de compras eso es grave —
     * alguien puede volver a despachar material que ya salió.
     *
     * Todas las pantallas leen datos que cambian con cada acción de otro
     * rol: acá no hay nada que valga la pena cachear del lado del cliente.
     */
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
