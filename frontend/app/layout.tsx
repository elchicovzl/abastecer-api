import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "ASOFER — Compras e Inventarios",
  description:
    "Gestión de requisiciones, inventario multi-bodega y órdenes de compra",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        {/*
          Toaster global. `richColors` distingue éxito de error por color Y
          por icono: color solo dejaría afuera a quien no distingue rojo de
          verde, que es ~8% de los hombres.
        */}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
