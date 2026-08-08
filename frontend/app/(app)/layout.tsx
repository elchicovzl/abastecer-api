import { redirect } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getSessionUser } from "@/lib/session";

import { AppSidebar } from "./_components/app-sidebar";

/**
 * Todas las páginas bajo (app) leen la sesión desde cookies httpOnly, así
 * que NINGUNA puede prerenderizarse en build time.
 *
 * Sin esto, `next build` intenta generarlas estáticas y falla con
 * "Dynamic server usage: used `cookies`" — el catálogo llega vacío y la
 * pantalla se ve rota. En `next dev` NO pasa: todo es dinámico ahí. Es un
 * bug que solo aparece en producción, y lo destapó correr los E2E contra el
 * build real en vez del dev server.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">
            ASOFER · Obras y mejoras estructurales
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
